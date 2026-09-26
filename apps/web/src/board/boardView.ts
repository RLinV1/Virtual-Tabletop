import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  Ticker,
  type FederatedPointerEvent,
} from "pixi.js";
import {
  can,
  conditionSpec,
  gridLineStyle,
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
import { recenterOnResize } from "./recenter";
import { canRenderGrid, DEFAULT_BOARD_SIZE } from "./gridRenderLimit";

export interface BoardCallbacks {
  /** Commit a move. Resolves false if the server rejected it. */
  moveToken(tokenId: string, to: Point): Promise<boolean>;
  dragPreview(tokenId: string, at: Point): void;
  ping(at: Point): void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const PREVIEW_INTERVAL_MS = 50;
/** Neutral stand-in for a map image that no longer exists (board-asset-fallback). */
const EMPTY_MAP_FILL = 0x2b2e35;

/**
 * Image URLs that failed to load this session — typically a deleted library asset. The
 * log keeps old URLs forever, so without this every state sync would re-request a 404.
 */
const failedImageUrls = new Set<string>();

interface TokenView {
  container: Container;
  body: Graphics;
  /** Token art clipped to the token circle; hidden when there is none or it failed to load. */
  image: Sprite;
  imageMask: Graphics;
  /** URL the sprite is showing or loading, so a late load for an old URL is ignored. */
  imageUrl: string | null;
  radius: number;
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
  private gridPreview: GridSpec | null = null;
  /** The current map's image could not be loaded; draw the generic surface instead. */
  private mapMissing = false;
  private gridKey = "";

  private drag: { tokenId: string; offset: Point; lastPreview: number } | null = null;
  private pan: { start: Point; origin: Point } | null = null;
  /** Moves sent but not yet reflected in state, so tokens don't snap back while waiting. */
  private pendingMoves = new Map<string, Point>();
  private initialized = false;
  /** Keep auto-fitting (map changes, window resizes) until the viewer pans or zooms themselves. */
  private autoFit = true;
  private hostObserver: ResizeObserver | null = null;
  /**
   * Rendering is on demand: nothing draws while the picture is unchanged. `invalidate()`
   * marks the picture dirty and asks for a frame; running animations (pings), drag ghosts
   * and a host that is still changing size keep frames coming until they settle.
   */
  private frame = 0;
  private dirty = false;
  /** Host size seen last frame while a resize waits to settle; null when none is pending. */
  private pendingSize: { width: number; height: number } | null = null;
  /** Per-frame animation steps; each returns false once it has finished. */
  private animations = new Set<(now: number) => boolean>();

  constructor(
    private host: HTMLElement,
    private callbacks: BoardCallbacks,
  ) {}

  async init() {
    await this.app.init({
      width: Math.max(1, this.host.clientWidth),
      height: Math.max(1, this.host.clientHeight),
      background: "#14171b",
      antialias: true,
      autoDensity: true,
      // Beyond 2x the extra pixels are not visible on a map, but they cost fill rate.
      resolution: Math.min(window.devicePixelRatio, 2),
      // No continuous render loop; see `invalidate`.
      autoStart: false,
    });
    // Pixi's event system also re-tests hover on every frame of the shared system ticker,
    // for a scene moving under a still pointer. Every change here comes with a pointer
    // event or a render we asked for, so that loop is idle work.
    Ticker.system.stop();
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
    // Touch: a phone has no wheel, so without these the board cannot be zoomed at all.
    this.app.canvas.addEventListener("touchstart", this.onTouchStart, { passive: false });
    this.app.canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.app.canvas.addEventListener("touchend", this.onTouchEnd);
    this.app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    // A layout change (sidebar collapse, window resize) must not move what the viewer is
    // looking at. Without this a panned board stays pinned to the top-left and drifts.
    let lastSize = { width: this.app.screen.width, height: this.app.screen.height };
    this.app.renderer.on("resize", () => {
      const size = { width: this.app.screen.width, height: this.app.screen.height };
      if (this.autoFit) this.fitToScreen();
      else {
        const to = recenterOnResize(this.world.position, lastSize, size);
        this.world.position.set(to.x, to.y);
      }
      lastSize = size;
      this.dirty = true;
    });
    // Watch the host, not the window: collapsing the sidebar resizes the host without
    // resizing the window. Reallocating the canvas every frame of the sidebar's slide made
    // it stutter, so the resize waits until the host has kept one size for a frame. In the
    // meantime the canvas keeps its old size; the board's background covers any gap.
    this.hostObserver = new ResizeObserver(() => {
      this.pendingSize ??= { width: -1, height: -1 };
      this.schedule();
    });
    this.hostObserver.observe(this.host);
    this.invalidate();
  }

  /** Draw once on the next animation frame. Calls within one frame share it. */
  private invalidate() {
    this.dirty = true;
    this.schedule();
  }

  private schedule() {
    if (this.frame || !this.initialized) return;
    this.frame = requestAnimationFrame(this.renderFrame);
  }

  private renderFrame = (now: number) => {
    if (!this.initialized) return;
    if (this.pendingSize) this.settleResize();
    if (this.animations.size > 0) {
      for (const step of this.animations) if (!step(now)) this.animations.delete(step);
      this.dirty = true;
    }
    for (const [id, ghost] of this.ghosts) {
      if (now > ghost.expires) {
        ghost.g.destroy();
        this.ghosts.delete(id);
        this.dirty = true;
      }
    }
    if (this.dirty) this.app.render();
    this.dirty = false;
    // Cleared only now, so changes made while drawing this frame don't queue another.
    this.frame = 0;
    if (this.animations.size > 0 || this.ghosts.size > 0 || this.pendingSize) this.schedule();
  };

  /** Resize the canvas once the host has held the same size for a whole frame. */
  private settleResize() {
    const size = { width: this.host.clientWidth, height: this.host.clientHeight };
    const last = this.pendingSize!;
    if (size.width !== last.width || size.height !== last.height) {
      this.pendingSize = size;
      return;
    }
    this.pendingSize = null;
    if (size.width === 0 || size.height === 0) return;
    if (size.width === this.app.screen.width && size.height === this.app.screen.height) return;
    // Emits "resize", whose handler keeps the view in place and marks the frame dirty.
    this.app.renderer.resize(size.width, size.height);
  }

  destroy() {
    if (!this.initialized) return;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.animations.clear();
    this.hostObserver?.disconnect();
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.canvas.removeEventListener("touchstart", this.onTouchStart);
    this.app.canvas.removeEventListener("touchmove", this.onTouchMove);
    this.app.canvas.removeEventListener("touchend", this.onTouchEnd);
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
    this.invalidate();
  }

  /** Only this viewer sees the calibration overlay. Token movement keeps the committed grid. */
  setGridPreview(grid: GridSpec | null) {
    this.gridPreview = grid;
    if (this.initialized && this.state) this.syncGrid();
  }

  showPing(at: Point, color = 0xf1c40f) {
    const ring = new Graphics();
    ring.position.set(at.x, at.y);
    this.fxLayer.addChild(ring);
    const started = performance.now();
    this.animations.add((now) => {
      // rAF timestamps can trail performance.now() slightly on the first frame.
      const t = Math.max(0, (now - started) / 1200);
      if (t >= 1 || ring.destroyed) {
        if (!ring.destroyed) ring.destroy();
        return false;
      }
      const cell = this.state?.scene.grid.cellSize ?? 70;
      ring
        .clear()
        .circle(0, 0, cell * (0.2 + t * 1.2))
        .stroke({ width: 4 / this.world.scale.x, color, alpha: 1 - t });
      return true;
    });
    this.invalidate();
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
    this.invalidate();
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
    this.invalidate();
  }

  clearFocus() {
    if (!this.focusedId) return;
    this.focusedId = null;
    for (const view of this.tokens.values()) view.drawnKey = "";
    this.syncTokens();
    this.invalidate();
  }

  /** Fit the whole board in view and resume auto-fitting. */
  resetView() {
    this.autoFit = true;
    this.fitToScreen();
    this.invalidate();
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
    return map ? { width: map.width, height: map.height } : DEFAULT_BOARD_SIZE;
  }

  private syncMap() {
    const url = this.state?.scene.map?.url ?? null;
    if (url === this.mapUrl) return;
    this.mapUrl = url;
    this.autoFit = true;
    this.mapMissing = false;
    this.mapSprite.texture = Texture.EMPTY;
    if (!url) return;
    const markMissing = () => {
      if (this.mapUrl !== url || !this.initialized) return;
      // Board coordinates come from the stored width/height, not the image, so every
      // token stays where it was on the generic surface (invariant 8).
      this.mapMissing = true;
      this.gridKey = "";
      if (this.state) this.syncGrid();
      this.invalidate();
    };
    if (failedImageUrls.has(url)) return markMissing();
    Assets.load<Texture>(url).then(
      (texture) => {
        if (this.mapUrl !== url || !this.initialized) return;
        this.mapSprite.texture = texture;
        this.invalidate();
      },
      () => {
        failedImageUrls.add(url);
        markMissing();
      },
    );
  }

  private syncGrid() {
    const g = this.gridPreview ?? this.state!.scene.grid;
    const { width, height } = this.boardSize();
    const key = JSON.stringify([
      g.cellSize, g.offsetX, g.offsetY, g.lineColor, g.lineWidth, g.lineOpacity,
      width, height, this.mapMissing, !!this.gridPreview,
    ]);
    if (key === this.gridKey) return;
    this.gridKey = key;

    this.grid.clear();
    if (!this.state!.scene.map || this.mapMissing) this.grid.rect(0, 0, width, height).fill({ color: EMPTY_MAP_FILL });
    // Legacy or external grids still need a safety guard even though the editor rejects them.
    if (!canRenderGrid(g.cellSize, { width, height })) {
      this.invalidate();
      return;
    }
    for (let x = g.offsetX; x <= width; x += g.cellSize) this.grid.moveTo(x, 0).lineTo(x, height);
    for (let y = g.offsetY; y <= height; y += g.cellSize) this.grid.moveTo(0, y).lineTo(width, y);
    // The GM's preview stays identifiable while the modal shows the precise line style.
    const style = gridLineStyle(g);
    this.grid.stroke(this.gridPreview
      ? { width: Math.max(style.width, 1.5), color: 0x5b8def, alpha: 0.8 }
      : { width: style.width, color: Number(`0x${style.color.slice(1)}`), alpha: style.opacity });
    this.invalidate();
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
    const image = new Sprite(Texture.EMPTY);
    image.anchor.set(0.5);
    image.visible = false;
    const imageMask = new Graphics();
    image.mask = imageMask;
    // Disc first so it shows through while the image loads, or instead of one that failed.
    container.addChild(body, image, imageMask, decor, markers, label);
    container.on("pointerdown", (e: FederatedPointerEvent) => this.onTokenDown(e, token.id));
    this.tokenLayer.addChild(container);
    return { container, body, image, imageMask, imageUrl: null, radius: 0, decor, markers, label, drawnKey: "" };
  }

  private drawToken(view: TokenView, token: Token, grid: GridSpec, you: Participant) {
    const owned = token.ownerIds.includes(you.id);
    const movable = can.moveToken(you, token);
    const focused = this.focusedId === token.id;
    const active = this.activeTokenId() === token.id;
    const key = JSON.stringify([
      token.name, token.size, token.color, token.hidden, owned, movable, grid.cellSize,
      token.stats, token.conditions, focused, active, token.imageUrl,
    ]);
    view.container.eventMode = movable ? "static" : "none";
    view.container.cursor = movable ? "grab" : "default";
    if (key === view.drawnKey) return;
    view.drawnKey = key;

    const r = (token.size * grid.cellSize) / 2 - 2;
    view.radius = r;
    view.body.clear().circle(0, 0, r).fill({ color: token.color });
    view.imageMask.clear().circle(0, 0, r).fill({ color: 0xffffff });
    this.syncTokenImage(view, token.imageUrl);
    view.container.alpha = token.hidden ? 0.45 : 1;
    view.label.text = token.hidden ? `${token.name} (hidden)` : token.name;
    view.label.position.set(0, r + 2);

    this.drawDecor(view, token, r, focused, active, owned);
    this.drawConditions(view, token.conditions, r);
  }

  /**
   * Shows the token's image over its colour disc. A missing image (e.g. a deleted library
   * asset) leaves the disc showing, unchanged in size and position (board-asset-fallback).
   */
  private syncTokenImage(view: TokenView, url: string | null) {
    if (url === view.imageUrl) return this.fitTokenImage(view);
    view.imageUrl = url;
    view.image.visible = false;
    if (!url || failedImageUrls.has(url)) return;
    Assets.load<Texture>(url).then(
      (texture) => {
        if (view.imageUrl !== url || view.container.destroyed) return;
        view.image.texture = texture;
        view.image.visible = true;
        this.fitTokenImage(view);
        this.invalidate();
      },
      () => {
        failedImageUrls.add(url);
      },
    );
  }

  /** Cover the token circle: scale the short edge to the diameter; the mask trims the rest. */
  private fitTokenImage(view: TokenView) {
    const { texture } = view.image;
    if (!view.image.visible || texture.width === 0 || texture.height === 0) return;
    view.image.scale.set((view.radius * 2) / Math.min(texture.width, texture.height));
  }

  /** Focus ring, active-turn ring, and the HP bar (FR-TAC-07, FR-GM-21, FR-GM-24). */
  private drawDecor(view: TokenView, token: Token, r: number, focused: boolean, active: boolean, owned: boolean) {
    const g = view.decor.clear();
    // Drawn here, above the token art, so an image never hides whose token it is.
    if (owned) g.circle(0, 0, r).stroke({ width: 3, color: 0xffffff });

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
    this.invalidate();
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
      this.invalidate();
    } else if (this.pan) {
      this.autoFit = false;
      this.world.position.set(
        this.pan.origin.x + e.global.x - this.pan.start.x,
        this.pan.origin.y + e.global.y - this.pan.start.y,
      );
      this.invalidate();
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

    this.invalidate();
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
      this.invalidate();
    });
  };

  /**
   * Pinch to zoom and two-finger pan (FR-TAC-01 on touch).
   *
   * One finger is left alone so it still drags tokens and pans the background through the
   * existing pointer handlers. Two fingers are unambiguously a camera gesture, so we take
   * them over and keep the midpoint between the fingers anchored to the same board point —
   * which is what makes a pinch feel like it is grabbing the map rather than scaling it
   * around some arbitrary centre.
   */
  private pinch: { distance: number; midpoint: Point; scale: number } | null = null;
  private lastTap = { at: 0, x: 0, y: 0 };

  private touchInfo(touches: TouchList) {
    const rect = this.app.canvas.getBoundingClientRect();
    const a = touches[0]!;
    const b = touches[1]!;
    return {
      distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      midpoint: {
        x: (a.clientX + b.clientX) / 2 - rect.left,
        y: (a.clientY + b.clientY) / 2 - rect.top,
      },
    };
  }

  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 2) return;
    e.preventDefault();
    // Cancel whatever the first finger started, so a pinch never drags a token with it.
    this.pan = null;
    if (this.drag) {
      const view = this.tokens.get(this.drag.tokenId);
      const token = this.state?.tokens[this.drag.tokenId];
      if (view && token) view.container.position.set(token.position.x, token.position.y);
      this.drag = null;
      this.invalidate();
    }
    const { distance, midpoint } = this.touchInfo(e.touches);
    this.pinch = { distance, midpoint, scale: this.world.scale.x };
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.pinch || e.touches.length !== 2) return;
    e.preventDefault();
    this.autoFit = false;
    const { distance, midpoint } = this.touchInfo(e.touches);
    if (this.pinch.distance === 0) return;

    const scale = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, this.pinch.scale * (distance / this.pinch.distance)),
    );
    // Board point under the starting midpoint, kept under the current midpoint.
    const anchor = {
      x: (this.pinch.midpoint.x - this.world.x) / this.world.scale.x,
      y: (this.pinch.midpoint.y - this.world.y) / this.world.scale.y,
    };
    this.world.scale.set(scale);
    this.world.position.set(midpoint.x - anchor.x * scale, midpoint.y - anchor.y * scale);
    this.pinch = { distance, midpoint, scale };
    this.invalidate();
  };

  private onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) this.pinch = null;

    // Double-tap to ping. `dblclick` is synthesised inconsistently on touch, and a ping is
    // the one board gesture a player on a phone actually needs (FR-TAC-05).
    const touch = e.changedTouches[0];
    if (!touch || e.touches.length > 0 || this.pinch) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const now = performance.now();
    const quick = now - this.lastTap.at < 350;
    const close = Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 30;
    if (quick && close) {
      const at = this.toBoard({ x, y });
      this.showPing(at);
      this.callbacks.ping(at);
      this.lastTap = { at: 0, x: 0, y: 0 };
      return;
    }
    this.lastTap = { at: now, x, y };
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
    this.invalidate();
  };

  private onDoubleClick = (e: MouseEvent) => {
    const rect = this.app.canvas.getBoundingClientRect();
    const at = this.toBoard({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    this.showPing(at);
    this.callbacks.ping(at);
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
