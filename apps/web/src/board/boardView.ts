import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type FederatedPointerEvent,
} from "pixi.js";
import {
  can,
  conditionSpec,
  hpFraction,
  snapTokenCenter,
  type ConditionId,
  type ConditionShape,
  type GridSpec,
  type Participant,
  type Point,
  type RoomState,
  type Token,
} from "@vtt/shared";

export interface BoardCallbacks {
  /** Commit a move. Resolves false if the server rejected it. */
  moveToken(tokenId: string, to: Point): Promise<boolean>;
  dragPreview(tokenId: string, at: Point): void;
  ping(at: Point): void;
}

const DEFAULT_BOARD = { width: 2100, height: 1400 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const PREVIEW_INTERVAL_MS = 50;

interface TokenView {
  container: Container;
  body: Graphics;
  /** Resource bar and focus ring (FR-TAC-07). */
  decor: Graphics;
  /** Condition markers: one shape + abbreviation each (FR-TAC-08). */
  markers: Container;
  label: Text;
  drawnKey: string;
}

/**
 * Imperative PixiJS renderer. React owns the panels; this owns the canvas.
 * All positions it reports are board coordinates; each viewer's pan/zoom is local (FR-TAC-01).
 */
export class BoardView {
  private app = new Application();
  /** Token highlighted from the roster (FR-GM-24). */
  private focusedId: string | null = null;
  private world = new Container();
  private mapSprite = new Sprite(Texture.EMPTY);
  private grid = new Graphics();
  private tokenLayer = new Container();
  private fxLayer = new Container();
  private tokens = new Map<string, TokenView>();
  private ghosts = new Map<string, { g: Graphics; expires: number }>();

  private state: RoomState | null = null;
  private you: Participant | null = null;
  private mapUrl: string | null = null;
  private gridKey = "";

  private drag: { tokenId: string; offset: Point; lastPreview: number } | null = null;
  private pan: { start: Point; origin: Point } | null = null;
  /** Moves sent but not yet reflected in state, so tokens don't snap back while waiting. */
  private pendingMoves = new Map<string, Point>();
  private initialized = false;
  /** Keep auto-fitting (map changes, window resizes) until the viewer pans or zooms themselves. */
  private autoFit = true;

  constructor(
    private host: HTMLElement,
    private callbacks: BoardCallbacks,
  ) {}

  async init() {
    await this.app.init({
      resizeTo: this.host,
      background: "#1d1f24",
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio,
    });
    this.initialized = true;
    this.host.appendChild(this.app.canvas);

    this.world.addChild(this.mapSprite, this.grid, this.tokenLayer, this.fxLayer);
    this.app.stage.addChild(this.world);

    const stage = this.app.stage;
    stage.eventMode = "static";
    stage.hitArea = this.app.screen;
    stage.on("pointerdown", this.onBackgroundDown);
    stage.on("globalpointermove", this.onPointerMove);
    stage.on("pointerup", this.onPointerUp);
    stage.on("pointerupoutside", this.onPointerUp);

    this.app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.app.canvas.addEventListener("dblclick", this.onDoubleClick);
    this.app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.app.ticker.add(this.tick);
    this.app.renderer.on("resize", () => {
      if (this.autoFit) this.fitToScreen();
    });
  }

  destroy() {
    if (!this.initialized) return;
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.app.destroy(true, { children: true });
    this.initialized = false;
  }

  update(state: RoomState, you: Participant) {
    this.state = state;
    this.you = you;
    this.syncMap();
    this.syncGrid();
    this.syncTokens();
    if (this.autoFit) this.fitToScreen();
  }

  showPing(at: Point, color = 0xf1c40f) {
    const ring = new Graphics();
    ring.position.set(at.x, at.y);
    this.fxLayer.addChild(ring);
    const started = performance.now();
    const animate = () => {
      const t = (performance.now() - started) / 1200;
      if (t >= 1 || ring.destroyed) {
        this.app.ticker.remove(animate);
        if (!ring.destroyed) ring.destroy();
        return;
      }
      const cell = this.state?.scene.grid.cellSize ?? 70;
      ring
        .clear()
        .circle(0, 0, cell * (0.2 + t * 1.2))
        .stroke({ width: 4 / this.world.scale.x, color, alpha: 1 - t });
    };
    this.app.ticker.add(animate);
  }

  showDragPreview(tokenId: string, at: Point) {
    const token = this.state?.tokens[tokenId];
    if (!token || !this.state) return;
    let ghost = this.ghosts.get(tokenId);
    if (!ghost) {
      const g = new Graphics();
      this.fxLayer.addChild(g);
      ghost = { g, expires: 0 };
      this.ghosts.set(tokenId, ghost);
    }
    const r = (token.size * this.state.scene.grid.cellSize) / 2 - 2;
    ghost.g.clear().circle(0, 0, r).stroke({ width: 3, color: token.color, alpha: 0.8 });
    ghost.g.position.set(at.x, at.y);
    ghost.expires = performance.now() + 600;
  }

  /**
   * Centre the view on one token and highlight it (FR-GM-24).
   *
   * This is the roster's counterpart to clicking the canvas: keyboard users and anyone
   * hunting for a token in a crowded map get there without a precise mouse gesture.
   */
  focusToken(tokenId: string) {
    const token = this.state?.tokens[tokenId];
    if (!token) return;
    this.focusedId = tokenId;
    this.autoFit = false;
    const screen = this.app.screen;
    const scale = this.world.scale.x;
    this.world.position.set(
      screen.width / 2 - token.position.x * scale,
      screen.height / 2 - token.position.y * scale,
    );
    // Force a redraw so the focus ring appears on the newly focused token and clears
    // from the previous one.
    for (const view of this.tokens.values()) view.drawnKey = "";
    this.syncTokens();
  }

  clearFocus() {
    if (!this.focusedId) return;
    this.focusedId = null;
    for (const view of this.tokens.values()) view.drawnKey = "";
    this.syncTokens();
  }

  /** Fit the whole board in view and resume auto-fitting. */
  resetView() {
    this.autoFit = true;
    this.fitToScreen();
  }

  private fitToScreen() {
    const { width, height } = this.boardSize();
    const screen = this.app.screen;
    if (screen.width === 0 || screen.height === 0) return;
    const scale = Math.min(screen.width / width, screen.height / height) * 0.95;
    this.world.scale.set(scale);
    this.world.position.set((screen.width - width * scale) / 2, (screen.height - height * scale) / 2);
  }

  // ---------- sync from state ----------

  private boardSize() {
    const map = this.state?.scene.map;
    return map ? { width: map.width, height: map.height } : DEFAULT_BOARD;
  }

  private syncMap() {
    const url = this.state?.scene.map?.url ?? null;
    if (url === this.mapUrl) return;
    this.mapUrl = url;
    this.autoFit = true;
    if (!url) {
      this.mapSprite.texture = Texture.EMPTY;
      return;
    }
    Assets.load<Texture>(url).then((texture) => {
      if (this.mapUrl === url && this.initialized) this.mapSprite.texture = texture;
    });
  }

  private syncGrid() {
    const g = this.state!.scene.grid;
    const { width, height } = this.boardSize();
    const key = JSON.stringify([g, width, height]);
    if (key === this.gridKey) return;
    this.gridKey = key;

    this.grid.clear();
    if (!this.state!.scene.map) this.grid.rect(0, 0, width, height).fill({ color: 0x2b2e35 });
    for (let x = g.offsetX; x <= width; x += g.cellSize) this.grid.moveTo(x, 0).lineTo(x, height);
    for (let y = g.offsetY; y <= height; y += g.cellSize) this.grid.moveTo(0, y).lineTo(width, y);
    this.grid.stroke({ width: 1, color: 0x000000, alpha: 0.35 });
  }

  private syncTokens() {
    const state = this.state!;
    const you = this.you!;
    const grid = state.scene.grid;

    for (const [id, view] of this.tokens) {
      if (!state.tokens[id]) {
        view.container.destroy({ children: true });
        this.tokens.delete(id);
        this.pendingMoves.delete(id);
      }
    }

    for (const token of Object.values(state.tokens)) {
      let view = this.tokens.get(token.id);
      if (!view) {
        view = this.createTokenView(token);
        this.tokens.set(token.id, view);
      }
      this.drawToken(view, token, grid, you);

      const pending = this.pendingMoves.get(token.id);
      if (pending && pending.x === token.position.x && pending.y === token.position.y) {
        this.pendingMoves.delete(token.id);
      }
      if (this.drag?.tokenId !== token.id && !this.pendingMoves.has(token.id)) {
        view.container.position.set(token.position.x, token.position.y);
      }
    }
  }

  private createTokenView(token: Token): TokenView {
    const container = new Container();
    const body = new Graphics();
    const decor = new Graphics();
    const markers = new Container();
    const label = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 14, fontFamily: "system-ui, sans-serif", stroke: { color: 0x000000, width: 3 } },
    });
    label.anchor.set(0.5, 0);
    container.addChild(body, decor, markers, label);
    container.on("pointerdown", (e: FederatedPointerEvent) => this.onTokenDown(e, token.id));
    this.tokenLayer.addChild(container);
    return { container, body, decor, markers, label, drawnKey: "" };
  }

  private drawToken(view: TokenView, token: Token, grid: GridSpec, you: Participant) {
    const owned = token.ownerIds.includes(you.id);
    const movable = can.moveToken(you, token);
    const focused = this.focusedId === token.id;
    const active = this.activeTokenId() === token.id;
    const key = JSON.stringify([
      token.name, token.size, token.color, token.hidden, owned, movable, grid.cellSize,
      token.stats, token.conditions, focused, active,
    ]);
    view.container.eventMode = movable ? "static" : "none";
    view.container.cursor = movable ? "grab" : "default";
    if (key === view.drawnKey) return;
    view.drawnKey = key;

    const r = (token.size * grid.cellSize) / 2 - 2;
    view.body.clear().circle(0, 0, r).fill({ color: token.color });
    if (owned) view.body.circle(0, 0, r).stroke({ width: 3, color: 0xffffff });
    view.container.alpha = token.hidden ? 0.45 : 1;
    view.label.text = token.hidden ? `${token.name} (hidden)` : token.name;
    view.label.position.set(0, r + 2);

    this.drawDecor(view, token, r, focused, active);
    this.drawConditions(view, token.conditions, r);
  }

  /** Focus ring, active-turn ring, and the HP bar (FR-TAC-07, FR-GM-21, FR-GM-24). */
  private drawDecor(view: TokenView, token: Token, r: number, focused: boolean, active: boolean) {
    const g = view.decor.clear();

    // Rings differ in radius and dash as well as colour, so they remain distinguishable
    // when colour is not available (FR-TAC-08 applies to the whole board, not just markers).
    if (active) g.circle(0, 0, r + 7).stroke({ width: 4, color: 0xf1c40f });
    if (focused) g.circle(0, 0, r + 3).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });

    const fraction = hpFraction(token.stats);
    if (fraction === null) return;
    const w = r * 1.8;
    const h = 6;
    const y = -r - h - 4;
    g.rect(-w / 2, y, w, h).fill({ color: 0x000000, alpha: 0.65 });
    g.rect(-w / 2, y, w * fraction, h).fill({
      // Colour is a convenience; the bar length is the real signal.
      color: fraction > 0.5 ? 0x22c55e : fraction > 0.25 ? 0xeab308 : 0xdc2626,
    });
    g.rect(-w / 2, y, w, h).stroke({ width: 1, color: 0x000000, alpha: 0.8 });
  }

  /** One marker per condition: a distinct shape plus its abbreviation (FR-TAC-08). */
  private drawConditions(view: TokenView, conditions: ConditionId[], r: number) {
    view.markers.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (conditions.length === 0) return;

    const size = Math.max(11, r * 0.34);
    const step = size * 2.1;
    const startX = -((conditions.length - 1) * step) / 2;

    conditions.forEach((id, i) => {
      const spec = conditionSpec(id);
      const marker = new Container();
      const shape = new Graphics();
      drawShape(shape, spec.shape, size);
      shape.fill({ color: Number(`0x${spec.color.slice(1)}`) });
      shape.stroke({ width: 1.5, color: 0x000000, alpha: 0.85 });
      const text = new Text({
        text: spec.abbr,
        style: {
          fill: 0xffffff,
          fontSize: size * 0.85,
          fontFamily: "system-ui, sans-serif",
          fontWeight: "700",
          stroke: { color: 0x000000, width: 2 },
        },
      });
      text.anchor.set(0.5);
      marker.addChild(shape, text);
      marker.position.set(startX + i * step, r + 22);
      view.markers.addChild(marker);
    });
  }

  private activeTokenId(): string | null {
    const init = this.state?.initiative;
    if (!init) return null;
    return init.order[init.activeIndex] ?? null;
  }

  // ---------- input ----------

  private toBoard(global: Point): Point {
    const p = this.world.toLocal(global);
    return { x: p.x, y: p.y };
  }

  private onTokenDown = (e: FederatedPointerEvent, tokenId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const view = this.tokens.get(tokenId);
    if (!view) return;
    const p = this.toBoard(e.global);
    this.drag = {
      tokenId,
      offset: { x: p.x - view.container.x, y: p.y - view.container.y },
      lastPreview: 0,
    };
    view.container.cursor = "grabbing";
    this.tokenLayer.addChild(view.container); // bring to front
  };

  private onBackgroundDown = (e: FederatedPointerEvent) => {
    this.pan = { start: { x: e.global.x, y: e.global.y }, origin: { x: this.world.x, y: this.world.y } };
  };

  private onPointerMove = (e: FederatedPointerEvent) => {
    if (this.drag) {
      const view = this.tokens.get(this.drag.tokenId);
      if (!view) return;
      const p = this.toBoard(e.global);
      const at = { x: p.x - this.drag.offset.x, y: p.y - this.drag.offset.y };
      view.container.position.set(at.x, at.y);
      const now = performance.now();
      if (now - this.drag.lastPreview > PREVIEW_INTERVAL_MS) {
        this.drag.lastPreview = now;
        this.callbacks.dragPreview(this.drag.tokenId, at);
      }
    } else if (this.pan) {
      this.autoFit = false;
      this.world.position.set(
        this.pan.origin.x + e.global.x - this.pan.start.x,
        this.pan.origin.y + e.global.y - this.pan.start.y,
      );
    }
  };

  private onPointerUp = (e: FederatedPointerEvent) => {
    this.pan = null;
    const drag = this.drag;
    this.drag = null;
    if (!drag || !this.state) return;
    const token = this.state.tokens[drag.tokenId];
    const view = this.tokens.get(drag.tokenId);
    if (!token || !view) return;
    view.container.cursor = "grab";

    const dropped = { x: view.container.x, y: view.container.y };
    // Snap by default; hold Alt for free placement (FR-TAC-02).
    const to = e.altKey ? dropped : snapTokenCenter(dropped, token.size, this.state.scene.grid);
    if (to.x === token.position.x && to.y === token.position.y) {
      view.container.position.set(to.x, to.y);
      return;
    }
    view.container.position.set(to.x, to.y);
    this.pendingMoves.set(token.id, to);
    this.callbacks.moveToken(token.id, to).then((ok) => {
      if (ok) return;
      this.pendingMoves.delete(token.id);
      const current = this.state?.tokens[token.id];
      if (current) this.tokens.get(token.id)?.container.position.set(current.position.x, current.position.y);
    });
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.autoFit = false;
    const rect = this.app.canvas.getBoundingClientRect();
    const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const before = this.toBoard(screenPoint);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.world.scale.x * factor));
    this.world.scale.set(scale);
    this.world.position.set(screenPoint.x - before.x * scale, screenPoint.y - before.y * scale);
  };

  private onDoubleClick = (e: MouseEvent) => {
    const rect = this.app.canvas.getBoundingClientRect();
    const at = this.toBoard({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    this.showPing(at);
    this.callbacks.ping(at);
  };

  private tick = () => {
    const now = performance.now();
    for (const [id, ghost] of this.ghosts) {
      if (now > ghost.expires) {
        ghost.g.destroy();
        this.ghosts.delete(id);
      }
    }
  };
}

/**
 * Condition marker shapes (FR-TAC-08). Each is visually distinct in silhouette, so two
 * conditions never rely on colour alone to be told apart.
 */
function drawShape(g: Graphics, shape: ConditionShape, size: number) {
  const r = size;
  switch (shape) {
    case "circle":
      g.circle(0, 0, r);
      return;
    case "square":
      g.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      return;
    case "triangle":
      g.poly([0, -r, r, r * 0.8, -r, r * 0.8]);
      return;
    case "diamond":
      g.poly([0, -r, r, 0, 0, r, -r, 0]);
      return;
    case "hexagon":
      g.poly(
        Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 3) * i - Math.PI / 2;
          return [Math.cos(a) * r, Math.sin(a) * r];
        }).flat(),
      );
      return;
    case "heart": {
      const k = r * 0.55;
      g.moveTo(0, r * 0.75)
        .bezierCurveTo(-r * 1.3, -k, -k * 0.5, -r * 1.15, 0, -r * 0.35)
        .bezierCurveTo(k * 0.5, -r * 1.15, r * 1.3, -k, 0, r * 0.75);
      return;
    }
  }
}
