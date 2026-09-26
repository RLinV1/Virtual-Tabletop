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
  type AreaTemplate,
} from "@vtt/shared";
import { recenterOnResize } from "./recenter";
import { areaOrigin, areaShape, areaSizeFromDrag, formatDistance, hitMark, measure, templateMark, type BoardTool, type Mark } from "./tools";

export interface BoardCallbacks {
  /** Commit a move. Resolves false if the server rejected it. */
  moveToken(tokenId: string, to: Point): Promise<boolean>;
  dragPreview(tokenId: string, at: Point): void;
  ping(at: Point): void;
  /** Place a shared area template (ADR 0007). Resolves false if the server rejected it. */
  placeTemplate(template: { shape: AreaTemplate["shape"]; origin: Point; toward: Point; size: number; gmOnly: boolean }): Promise<boolean>;
  removeTemplate(templateId: string): void;
}

const DEFAULT_BOARD = { width: 2100, height: 1400 };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const PREVIEW_INTERVAL_MS = 50;
/** Oldest marks drop off past this, so a long session can't grow the scene without bound. */
const MAX_MARKS = 100;
/** A tool drag shorter than this (screen pixels) is a click and makes no mark. */
const MIN_MARK_DRAG_PX = 4;
/** How close (screen pixels) the eraser has to come to a line to erase it. */
const ERASER_REACH_PX = 12;
/** A brush stroke adds a point once the pointer has moved this far (screen pixels). */
const BRUSH_STEP_PX = 2;
/** Longest brush stroke, in points, so one stroke can't grow without bound. */
const MAX_STROKE_POINTS = 2000;
/**
 * Tool cursors (KAN-69): 24px SVGs, light shapes with a dark outline so they read on any map.
 * Each hotspot is the point the tool acts on.
 */
function svgCursor(body: string, hotX: number, hotY: number) {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' " +
    "stroke-linecap='round' stroke-linejoin='round'>" + body + "</svg>";
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, crosshair`;
}
/** A path drawn light on top of a dark outline. */
const outlined = (d: string, width = 1.6) =>
  `<path d='${d}' fill='none' stroke='#111' stroke-width='${width + 2}'/><path d='${d}' fill='none' stroke='#fff' stroke-width='${width}'/>`;
const TOOL_CURSORS = {
  // A crosshair to aim from, with a small ruler beside it.
  measure: svgCursor(
    outlined("M5 1v8M1 5h8") +
      "<g transform='rotate(-35 16 16)'><rect x='9' y='13' width='14' height='6' rx='1' fill='#f1c40f' stroke='#111' stroke-width='1.2'/>" +
      "<path d='M12 13v2.5M15 13v1.8M18 13v2.5M21 13v1.8' stroke='#111' stroke-width='1.1'/></g>",
    5, 5,
  ),
  // A brush, tip at the bottom left.
  draw: svgCursor(
    "<g transform='rotate(45 12 12)'><rect x='9.5' y='-1' width='5' height='13' rx='1.2' fill='#c9955c' stroke='#111' stroke-width='1.2'/>" +
      "<rect x='9.3' y='11' width='5.4' height='3' fill='#d8dde3' stroke='#111' stroke-width='1.2'/>" +
      "<path d='M9.6 14h4.8c0 4-1.2 7-2.4 9.5-1.2-2.5-2.4-5.5-2.4-9.5Z' fill='#fff' stroke='#111' stroke-width='1.2'/></g>",
    3, 21,
  ),
  // A burst ring round the origin point.
  area: svgCursor(
    "<circle cx='12' cy='12' r='8.5' fill='rgba(230,126,34,0.25)' stroke='#111' stroke-width='3'/>" +
      "<circle cx='12' cy='12' r='8.5' fill='none' stroke='#e67e22' stroke-width='1.5' stroke-dasharray='3 2'/>" +
      outlined("M12 8v8M8 12h8", 1.4),
    12, 12,
  ),
  // A block eraser, rubber tip at the bottom left.
  erase: svgCursor(
    "<g transform='rotate(-45 12 12)' stroke='#111' stroke-width='1.5'>" +
      "<rect x='2' y='8' width='20' height='8' rx='2' fill='#f4f1ec'/>" +
      "<rect x='2' y='8' width='8' height='8' rx='2' fill='#e07a8a'/></g>",
    4, 20,
  ),
} as const;
const MEASURE_COLOR = 0xf1c40f;
const AREA_COLOR = 0xe67e22;
/** GM-only templates, which players never see, are drawn in a colour of their own. */
const GM_AREA_COLOR = 0x9b59b6;
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
  /** The viewer's own measure, draw and area marks (KAN-69); never sent anywhere. */
  private markLayer = new Container();
  private marksGraphics = new Graphics();
  /** The measurement and the shape being dragged out. */
  private overlayGraphics = new Graphics();
  private measureLabel = new Text({
    text: "",
    style: { fill: 0xffffff, fontSize: 14, fontFamily: "system-ui, sans-serif", fontWeight: "600", stroke: { color: 0x000000, width: 4 } },
  });
  private fxLayer = new Container();
  private tokens = new Map<string, TokenView>();
  private ghosts = new Map<string, { g: Graphics; expires: number }>();

  private state: RoomState | null = null;
  private you: Participant | null = null;
  private mapUrl: string | null = null;
  /** The current map's image could not be loaded; draw the generic surface instead. */
  private mapMissing = false;
  private gridKey = "";

  private drag: { tokenId: string; offset: Point; lastPreview: number } | null = null;
  private pan: { start: Point; origin: Point } | null = null;
  private tool: BoardTool = { kind: "select" };
  private marks: Mark[] = [];
  /** Templates sent to the server but not yet back in state, so a release doesn't blink. */
  private pendingAreas: Extract<Mark, { kind: "area" }>[] = [];
  /** Templates the eraser has asked to remove, so one sweep sends each only once. */
  private removing = new Set<string>();
  private drawnTemplates: RoomState["templates"] | null = null;
  /** The last measurement; stays until the next one starts, the tool changes, or Clear. */
  private measurement: Mark | null = null;
  /** A Measure/Draw/Area/Eraser drag in progress, in board coordinates. */
  private gesture: { from: Point; to: Point; screenFrom: Point; free: boolean; dragged: boolean; path: Point[] } | null = null;
  /** Zoom the marks were last drawn at; stroke widths are divided by it. NaN forces a redraw. */
  private marksScale = Number.NaN;
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

    this.measureLabel.anchor.set(0.5, 1.2);
    this.measureLabel.visible = false;
    this.markLayer.addChild(this.marksGraphics, this.overlayGraphics, this.measureLabel);
    this.world.addChild(this.mapSprite, this.grid, this.tokenLayer, this.markLayer, this.fxLayer);
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
    if (this.dirty && this.marksScale !== this.world.scale.x) this.redrawMarks();
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
    if (state.templates !== this.drawnTemplates) {
      for (const id of this.removing) if (!state.templates[id]) this.removing.delete(id);
      this.redrawMarks();
    }
    if (this.autoFit) this.fitToScreen();
    this.invalidate();
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

  // ---------- tools (KAN-69) ----------

  /** Switch the active tool. Changing tool drops the last measurement and any drag in progress. */
  setTool(tool: BoardTool) {
    if (tool.kind !== this.tool.kind) {
      this.measurement = null;
      this.gesture = null;
    }
    this.tool = tool;
    if (this.initialized) this.app.stage.cursor = this.toolCursor();
    if (this.state) this.syncTokens();
    this.redrawOverlay();
  }

  private toolCursor() {
    return this.tool.kind === "select" ? "default" : TOOL_CURSORS[this.tool.kind];
  }

  /** Remove every mark this viewer has made, including their shared templates. The tool stays as it is. */
  clearMarks() {
    this.marks = [];
    this.measurement = null;
    this.gesture = null;
    const you = this.you;
    for (const t of Object.values(this.state?.templates ?? {})) {
      if (you && t.ownerId === you.id) this.requestRemove(t);
    }
    this.redrawMarks();
  }

  private requestRemove(t: AreaTemplate) {
    if (this.removing.has(t.id)) return;
    this.removing.add(t.id);
    this.callbacks.removeTemplate(t.id);
  }

  private finishGesture() {
    const gesture = this.gesture!;
    this.gesture = null;
    const tool = this.tool;
    const { from, to, free, dragged } = gesture;
    if (tool.kind === "measure" && dragged) {
      this.measurement = { kind: "measure", from, to, free };
    } else if (tool.kind === "draw" && tool.shape === "brush" && dragged) {
      this.addMark({ kind: "stroke", color: tool.color, points: gesture.path });
    } else if (tool.kind === "draw" && tool.shape !== "brush" && dragged) {
      this.addMark({ kind: "draw", shape: tool.shape, color: tool.color, from, to });
    } else if (tool.kind === "area") {
      const area = this.areaFromGesture(gesture, tool);
      if (area?.kind === "area" && this.state) this.placeArea(area, tool.gmOnly);
    }
    this.redrawMarks();
  }

  /** Send an area to the table; show it until the server's answer arrives. */
  private placeArea(area: Extract<Mark, { kind: "area" }>, gmOnly: boolean) {
    const origin = areaOrigin(area.origin, this.state!.scene.grid, area.free);
    const pending = { ...area, origin, free: true, gmOnly };
    this.pendingAreas.push(pending);
    this.callbacks
      .placeTemplate({ shape: area.shape, origin, toward: area.toward, size: area.size, gmOnly })
      .finally(() => {
        this.pendingAreas = this.pendingAreas.filter((a) => a !== pending);
        this.redrawMarks();
      });
  }

  /**
   * The area a gesture describes. A drag sets its size (the pointer is on the far edge) and
   * aims it; a click places the tool's chosen size, pointing right.
   */
  private areaFromGesture(gesture: NonNullable<BoardView["gesture"]>, tool: Extract<BoardTool, { kind: "area" }>): Mark | null {
    const grid = this.state?.scene.grid;
    if (!grid) return null;
    const { from, to, free, dragged } = gesture;
    const size = dragged ? areaSizeFromDrag(areaOrigin(from, grid, free), to, grid, free) : tool.size;
    return { kind: "area", shape: tool.shape, size, origin: from, toward: dragged ? to : from, free, gmOnly: tool.gmOnly };
  }

  /** Remove every mark the eraser at `at` touches. */
  private eraseAt(at: Point) {
    const grid = this.state?.scene.grid;
    if (!grid) return;
    const reach = ERASER_REACH_PX / this.world.scale.x;
    const kept = this.marks.filter((mark) => !hitMark(mark, at, reach, grid));
    const measurementHit = this.measurement !== null && hitMark(this.measurement, at, reach, grid);
    // Shared templates: only ones this viewer may remove (their own; any, for the GM).
    const you = this.you;
    for (const t of Object.values(this.state?.templates ?? {})) {
      if (you && can.removeTemplate(you, t) && hitMark(templateMark(t), at, reach, grid)) this.requestRemove(t);
    }
    if (kept.length === this.marks.length && !measurementHit) return;
    this.marks = kept;
    if (measurementHit) this.measurement = null;
    this.redrawMarks();
  }

  private addMark(mark: Mark) {
    this.marks.push(mark);
    if (this.marks.length > MAX_MARKS) this.marks.shift();
  }

  /** Redraw committed marks and the overlay at the current zoom. */
  private redrawMarks() {
    if (!this.initialized) return;
    this.marksScale = this.world.scale.x;
    this.drawnTemplates = this.state?.templates ?? null;
    const g = this.marksGraphics.clear();
    for (const t of Object.values(this.state?.templates ?? {})) {
      if (!this.removing.has(t.id)) this.drawMark(g, templateMark(t));
    }
    for (const area of this.pendingAreas) this.drawMark(g, area);
    for (const mark of this.marks) this.drawMark(g, mark);
    this.redrawOverlay();
  }

  private redrawOverlay() {
    if (!this.initialized) return;
    const g = this.overlayGraphics.clear();
    this.measureLabel.visible = false;
    const gesture = this.gesture;
    const tool = this.tool;
    if (gesture && tool.kind === "measure") {
      this.drawMark(g, { kind: "measure", from: gesture.from, to: gesture.to, free: gesture.free });
    } else if (this.measurement) {
      this.drawMark(g, this.measurement);
    }
    if (gesture && tool.kind === "draw" && tool.shape === "brush") {
      this.drawMark(g, { kind: "stroke", color: tool.color, points: gesture.path });
    } else if (gesture && tool.kind === "draw" && tool.shape !== "brush") {
      this.drawMark(g, { kind: "draw", shape: tool.shape, color: tool.color, from: gesture.from, to: gesture.to });
    } else if (gesture && tool.kind === "area") {
      const area = this.areaFromGesture(gesture, tool);
      if (area?.kind === "area") {
        this.drawMark(g, area);
        // Show the size while dragging it out.
        if (gesture.dragged) this.showLabel(formatDistance(area.size, this.state!.scene.grid), gesture.to);
      }
    }
    this.invalidate();
  }

  /** The size label beside the pointer, kept the same size on screen at any zoom. */
  private showLabel(text: string, at: Point) {
    this.measureLabel.text = text;
    this.measureLabel.scale.set(1 / this.world.scale.x);
    this.measureLabel.position.set(at.x, at.y);
    this.measureLabel.visible = true;
  }

  private drawMark(g: Graphics, mark: Mark) {
    const grid = this.state?.scene.grid;
    if (!grid) return;
    // Stroke widths in screen pixels, so marks stay readable at any zoom.
    const px = 1 / this.world.scale.x;
    switch (mark.kind) {
      case "measure": {
        const m = measure(mark.from, mark.to, grid, mark.free);
        g.moveTo(m.from.x, m.from.y).lineTo(m.to.x, m.to.y).stroke({ width: 3 * px, color: MEASURE_COLOR });
        g.circle(m.from.x, m.from.y, 4 * px).circle(m.to.x, m.to.y, 4 * px).fill({ color: MEASURE_COLOR });
        this.showLabel(m.label, m.to);
        return;
      }
      case "draw": {
        const { from, to } = mark;
        if (mark.shape === "line") g.moveTo(from.x, from.y).lineTo(to.x, to.y);
        else if (mark.shape === "rect") g.rect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y));
        else g.circle(from.x, from.y, Math.hypot(to.x - from.x, to.y - from.y));
        g.stroke({ width: 3 * px, color: mark.color });
        return;
      }
      case "stroke": {
        const [first, ...rest] = mark.points;
        if (!first) return;
        g.moveTo(first.x, first.y);
        for (const p of rest) g.lineTo(p.x, p.y);
        g.stroke({ width: 3 * px, color: mark.color, cap: "round", join: "round" });
        return;
      }
      case "area": {
        const origin = areaOrigin(mark.origin, grid, mark.free);
        const shape = areaShape(mark.shape, origin, mark.toward, mark.size, grid);
        if (shape.kind === "circle") g.circle(shape.center.x, shape.center.y, shape.radius);
        else g.poly(shape.points.flatMap((p) => [p.x, p.y]));
        // Translucent, so tokens under the area stay visible.
        const color = mark.gmOnly ? GM_AREA_COLOR : AREA_COLOR;
        g.fill({ color, alpha: 0.2 }).stroke({ width: 2 * px, color, alpha: 0.9 });
        g.circle(origin.x, origin.y, 3 * px).fill({ color });
        return;
      }
    }
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
    return map ? { width: map.width, height: map.height } : DEFAULT_BOARD;
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
    const g = this.state!.scene.grid;
    const { width, height } = this.boardSize();
    const key = JSON.stringify([g, width, height, this.mapMissing]);
    if (key === this.gridKey) return;
    this.gridKey = key;
    // Measurements and areas are sized and snapped by the grid.
    this.marksScale = Number.NaN;

    this.grid.clear();
    if (!this.state!.scene.map || this.mapMissing) this.grid.rect(0, 0, width, height).fill({ color: EMPTY_MAP_FILL });
    for (let x = g.offsetX; x <= width; x += g.cellSize) this.grid.moveTo(x, 0).lineTo(x, height);
    for (let y = g.offsetY; y <= height; y += g.cellSize) this.grid.moveTo(0, y).lineTo(width, y);
    // The GM's line style (ADR 0005), or the historical black hairline for an unstyled grid.
    const style = gridLineStyle(g);
    this.grid.stroke({ width: style.width, color: Number(`0x${style.color.slice(1)}`), alpha: style.opacity });
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
    view.container.cursor = this.tool.kind !== "select" ? this.toolCursor() : movable ? "grab" : "default";
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
    // With a tool active, let the press reach the stage so e.g. a measurement starts here.
    if (e.button !== 0 || this.tool.kind !== "select") return;
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
    if (this.tool.kind !== "select" && e.button === 0) {
      const at = this.toBoard(e.global);
      this.gesture = { from: at, to: at, screenFrom: { x: e.global.x, y: e.global.y }, free: e.altKey, dragged: false, path: [at] };
      if (this.tool.kind === "measure") this.measurement = null;
      if (this.tool.kind === "erase") return this.eraseAt(at);
      this.redrawOverlay();
      return;
    }
    this.pan = { start: { x: e.global.x, y: e.global.y }, origin: { x: this.world.x, y: this.world.y } };
  };

  private onPointerMove = (e: FederatedPointerEvent) => {
    if (this.gesture) {
      const gesture = this.gesture;
      gesture.to = this.toBoard(e.global);
      gesture.free = e.altKey;
      gesture.dragged ||= Math.hypot(e.global.x - gesture.screenFrom.x, e.global.y - gesture.screenFrom.y) >= MIN_MARK_DRAG_PX;
      if (this.tool.kind === "erase") return this.eraseAt(gesture.to);
      const last = gesture.path[gesture.path.length - 1]!;
      const step = Math.hypot(gesture.to.x - last.x, gesture.to.y - last.y) * this.world.scale.x;
      const brushing = this.tool.kind === "draw" && this.tool.shape === "brush";
      if (brushing && step >= BRUSH_STEP_PX && gesture.path.length < MAX_STROKE_POINTS) gesture.path.push(gesture.to);
      this.redrawOverlay();
    } else if (this.drag) {
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
    if (this.gesture) return this.finishGesture();
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
    // Cancel whatever the first finger started, so a pinch never drags a token with it
    // or leaves half a drawing behind.
    this.pan = null;
    if (this.gesture) {
      this.gesture = null;
      this.redrawOverlay();
    }
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
