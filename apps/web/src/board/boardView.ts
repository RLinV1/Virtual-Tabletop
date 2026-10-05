import {
  Application,
  Assets,
  ColorMatrixFilter,
  Container,
  Graphics,
  Matrix,
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
  type Command,
} from "@vtt/shared";
import { footprint, placementPoint, type PlacementGhost } from "./placement";
import { clientToBoard, type BoardTransform } from "./diceThrow";
import { recenterOnResize } from "./recenter";
import { exceedsPanThreshold, pinchIsManual, resizeAction, zoomChangesScale } from "./viewFit";
import { conditionRowY, tokenLabelFontSize, tokenLabelStroke } from "./tokenLabel";
import { canRenderGrid, DEFAULT_BOARD_SIZE } from "./gridRenderLimit";
import { gridLines } from "./gridLines";
import {
  MAX_ATTACK_EFFECTS,
  artStyleFor,
  attackPlan,
  conditionLoopWanted,
  loopFrameDue,
  loopingConditions,
  prefersReducedMotion,
  watchReducedMotion,
  type AttackEffect,
} from "./effects";
import { makeFogCanvas } from "./fogTexture";
import { areaOrigin, areaShape, areaSizeFromDrag, fogRegionAt, formatDistance, hitMark, measure, sweepPoints, templateMark, type BoardTool, type Mark } from "./tools";
import { aimExpiry, expiredAims } from "./aims";
import { PING_MS, pingPulse } from "./ping";

/** A fog region as the Fog tool sends it (FR-GM-17, ADR 0016). */
export type FogDraft = Extract<Command, { type: "fog.add" }>["region"];

/** An area being aimed, as sent to the others (KAN-35); mirrors the `templatePreview` payload. */
export type AimPreview = { shape: AreaTemplate["shape"]; origin: Point; toward: Point; size: number; width?: number; gmOnly: boolean };

export interface BoardCallbacks {
  /** Commit a move. Resolves false if the server rejected it. */
  moveToken(tokenId: string, to: Point): Promise<boolean>;
  /** Every pointer move of a token drag; the connection coalesces them (KAN-39). */
  dragPreview(tokenId: string, at: Point): void;
  /**
   * The drag ended. `at` is where the token now rests (the drop point, or back where it started),
   * so other viewers' ghosts end there too; null when there is nothing to show.
   */
  dragEnd(tokenId: string, at: Point | null): void;
  ping(at: Point): void;
  /** Place a shared area template (ADR 0007). Resolves false if the server rejected it. */
  placeTemplate(template: { shape: AreaTemplate["shape"]; origin: Point; toward: Point; size: number; width?: number; gmOnly: boolean }): Promise<boolean>;
  /** The area being aimed, as others should see it (KAN-35); the connection coalesces these. */
  aimPreview(preview: AimPreview): void;
  /** Aiming stopped (placed or cancelled): clear it for the others. */
  aimEnd(gmOnly: boolean): void;
  /** Resolves false if the server rejected the removal. */
  removeTemplate(templateId: string): Promise<boolean>;
  /** GM: fog a region (FR-GM-17). Resolves false if the server rejected it. */
  addFog(region: FogDraft): Promise<boolean>;
  /** GM: remove a fog region. Resolves false if the server rejected it. */
  removeFog(regionId: string): Promise<boolean>;
  /** The viewer clicked the token `attackerId` attacks (attack-targeting). */
  pickTarget(attackerId: string, targetId: string): void;
  /** The viewer right-clicked while picking a target: stop without attacking. */
  cancelAttack(): void;
  /** The GM clicked a square while placing a new token (place-token-on-board). */
  placeToken(at: Point): void;
  /** A press on a token that stayed put (a click, not a drag) selects it; a click on bare map clears (null). */
  selectToken(tokenId: string | null): void;
  /** The GM right-clicked while placing: put the token back. */
  cancelPlacement(): void;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
/** Oldest marks drop off past this, so a long session can't grow the scene without bound. */
const MAX_MARKS = 100;
/** A tool drag shorter than this (screen pixels) is a click and makes no mark. */
const MIN_MARK_DRAG_PX = 4;
/** Stand-in id for the token being placed; never a real token's id. */
const GHOST_ID = "placement-ghost";
/** How close (screen pixels) a click must be to a polygon's first corner to close it. */
const FOG_CLOSE_PX = 12;
/** Fog colour. Players see it opaque; the GM sees it at FOG_GM_ALPHA with an outline (FR-GM-17). */
const FOG_COLOR = 0xc4c9ce;
/** Fog is drawn this far past its edge in grid cells, so no seam shows at a region's border or the map's. */
const FOG_BLEED_CELLS = 0.06;
/** How fast the clouds drift, in board pixels per second, and how often the drift is redrawn. */
const FOG_DRIFT_PX_PER_S = 38;
const FOG_DRIFT_INTERVAL_MS = 1000 / 20;
/** The cloud texture is drawn this many times larger than its 512 px tile, so clouds span several cells. */
const FOG_CLOUD_SCALE = 2.5;
const FOG_GM_ALPHA = 0.5;
const FOG_EDGE = 0x9fb3c8;
/** How close (screen pixels) the eraser has to come to a line to erase it. */
const ERASER_REACH_PX = 12;
/** A brush stroke adds a point once the pointer has moved this far (screen pixels). */
const BRUSH_STEP_PX = 2;
/**
 * Named fonts, never `system-ui`: Pixi measures text on an OffscreenCanvas but draws it on a
 * DOM canvas, and Firefox resolves `system-ui` to a narrower font offscreen, which crops the
 * end of long token names (fix-token-label-clipping).
 */
const BOARD_FONT = '"Helvetica Neue", Arial, sans-serif';
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
  // A crosshair over a dark fog square.
  fog: svgCursor(
    "<rect x='9' y='9' width='13' height='13' rx='2' fill='rgba(11,13,18,0.75)' stroke='#9fb3c8' stroke-width='1.5'/>" +
      outlined("M5 1v8M1 5h8"),
    5, 5,
  ),
  // A red reticle, aimed from its centre.
  attack: svgCursor(
    "<circle cx='12' cy='12' r='7.5' fill='none' stroke='#111' stroke-width='3.6'/>" +
      "<circle cx='12' cy='12' r='7.5' fill='none' stroke='#e74c3c' stroke-width='1.8'/>" +
      outlined("M12 1v6M12 17v6M1 12h6M17 12h6", 1.6),
    12, 12,
  ),
} as const;
const MEASURE_COLOR = 0xf1c40f;
/**
 * The attack aim (attack-targeting): the board's neutral mark style, a warm off-white on a soft
 * charcoal edge like the token direction arrows and ruler labels, so it reads on bright and dark
 * maps alike without shouting over the tokens.
 */
const AIM_COLOR = 0xf4ede4;
const AIM_EDGE = 0x14171b;
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
  /**
   * The token's body, art and mask. Condition looks (tilt, fade, grey) and shake apply here, never
   * to `container.position`, which is the token's board position (KAN-76).
   */
  art: Container;
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
  conditions: ConditionId[];
  /** Conditions whose effect moves, so the condition loop knows whom to redraw. */
  looping: boolean;
  /** Offsets from a hit shake and from trembling, added up on `art.position`. */
  shake: Point;
  /** The hit whose shake `shake` holds, or null (KAN-76). */
  shakeOwner: AttackFx | null;
  tremble: Point;
  /** Greyscale filter while Unconscious; made once, then reused. */
  grey: ColorMatrixFilter | null;
}

/** An attack effect playing; `stop` removes it and gives the tokens back their position. */
interface AttackFx {
  step: (now: number) => boolean;
  stop(): void;
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
  /**
   * Fog regions (FR-GM-17), between the grid and the tokens: a player's own token stays visible
   * on top, and anything else under fog is not in a player's state at all (ADR 0016).
   */
  private fogGraphics = new Graphics();
  /** The GM's fog outlines, kept apart so the fog's feathering never blurs them. */
  private fogEdgeGraphics = new Graphics();
  private fogLayer = new Container();
  /** The cloudy fog texture, made on first use and repeated across every region. */
  private fogTexture: Texture | null = null;
  /** The fog drift loop is in `animations`. */
  private gmFogShown = true;
  private readOnly = false;
  private fogLoopRegistered = false;
  private lastFogDraw = 0;
  private fogOffset = { x: 0, y: 0 };
  private tokenLayer = new Container();
  /** The viewer's own measure, draw and area marks (KAN-69); never sent anywhere. */
  private markLayer = new Container();
  private marksGraphics = new Graphics();
  /** The measurement and the shape being dragged out. */
  private overlayGraphics = new Graphics();
  private measureLabel = new Text({
    text: "",
    style: { fill: 0xffffff, fontSize: 14, fontFamily: BOARD_FONT, fontWeight: "600", stroke: { color: 0x000000, width: 4 } },
  });
  private fxLayer = new Container();
  private tokens = new Map<string, TokenView>();
  private ghosts = new Map<string, { g: Graphics; expires: number }>();
  /** Other participants' areas being aimed, by sender (KAN-35). Each fades 1 s after its last update. */
  private aims = new Map<string, { view: Container; expires: number }>();

  private state: RoomState | null = null;
  private you: Participant | null = null;
  private mapUrl: string | null = null;
  private gridPreview: GridSpec | null = null;
  /** The current map's image could not be loaded; draw the generic surface instead. */
  private mapMissing = false;
  private gridKey = "";

  private drag: { tokenId: string; offset: Point; movable: boolean } | null = null;
  /** Screen position where the token press began, to tell a click from a drag. */
  private dragDownAt: Point | null = null;
  private pan: { start: Point; origin: Point; button?: number } | null = null;
  private tool: BoardTool = { kind: "select" };
  private marks: Mark[] = [];
  /** Templates sent to the server but not yet back in state, so a release doesn't blink. */
  private pendingAreas: Extract<Mark, { kind: "area" }>[] = [];
  /**
   * Placements Clear all caught before the server's answer. They have no id yet, so each is
   * removed once its template shows up in state.
   */
  private cancelledAreas: Extract<Mark, { kind: "area" }>[] = [];
  /** Templates the eraser has asked to remove, so one sweep sends each only once. */
  private removing = new Set<string>();
  private drawnTemplates: RoomState["templates"] | null = null;
  private drawnFog: RoomState["fog"] | null = null;
  /** Fog regions sent to the server but not yet back in state, drawn so a release doesn't blink. */
  private pendingFog: FogDraft[] = [];
  /** Fog regions Reveal has asked to remove; hidden at once, shown again if refused. */
  private removingFog = new Set<string>();
  /** Corners of the fog polygon being clicked out, and the pointer for its next edge. */
  private fogPoints: Point[] = [];
  private fogHover: Point | null = null;
  /** The token under the pointer while picking an attack target; null over the map or the attacker. */
  private attackHover: string | null = null;
  /** When a target was last picked: a double-click there is part of the pick, not a ping. */
  private lastPickAt = 0;
  /** The last measurement; stays until the next one starts, the tool changes, or Clear. */
  private measurement: Mark | null = null;
  /** A Measure/Draw/Area/Eraser drag in progress, in board coordinates. */
  private gesture: { from: Point; to: Point; screenFrom: Point; free: boolean; dragged: boolean; path: Point[] } | null = null;
  /** Zoom the marks were last drawn at; stroke widths are divided by it. NaN forces a redraw. */
  private marksScale = Number.NaN;
  /** Moves sent but not yet reflected in state, so tokens don't snap back while waiting. */
  private pendingMoves = new Map<string, Point>();
  /** The new token being placed (place-token-on-board); null when not placing. */
  private placement: PlacementGhost | null = null;
  /** Where the pointer is over the board while placing; null when it is off the canvas. */
  private hover: { at: Point; free: boolean } | null = null;
  /** Screen point of a press while placing: released in place, it drops the token; dragged, it pans. */
  private placeDown: Point | null = null;
  /** The token drawn under the pointer while placing, and the squares it would cover. */
  private ghost: TokenView | null = null;
  private ghostFootprint = new Graphics();
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
  /** Set by a step that skipped its frame, so the frame is not redrawn for nothing. */
  private stepSkipped = false;
  /** Attack animations playing (KAN-76), oldest first. */
  private attackFx: AttackFx[] = [];
  private reducedMotion = prefersReducedMotion();
  private stopMotionWatch: (() => void) | null = null;
  /** The condition loop is in `animations`. */
  private loopRegistered = false;
  private lastLoopDraw = 0;
  /** Told the world transform whenever a frame draws it changed (throw-dice-on-board). */
  private viewListeners = new Set<(view: BoardTransform) => void>();
  private lastView: BoardTransform | null = null;

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
    this.fogGraphics.eventMode = "none";
    this.fogEdgeGraphics.eventMode = "none";
    this.fogLayer.eventMode = "none";
    this.fogLayer.addChild(this.fogGraphics, this.fogEdgeGraphics);
    this.world.addChild(this.mapSprite, this.grid, this.fogLayer, this.tokenLayer, this.markLayer, this.fxLayer);
    this.fxLayer.addChild(this.ghostFootprint);
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
    this.app.canvas.addEventListener("pointerleave", this.onPointerLeave);
    // A layout change (sidebar collapse, window resize) must not move what the viewer is
    // looking at. Without this a panned board stays pinned to the top-left and drifts.
    let lastSize = { width: this.app.screen.width, height: this.app.screen.height };
    this.app.renderer.on("resize", () => {
      if (!this.initialized) return;
      const size = { width: this.app.screen.width, height: this.app.screen.height };
      const action = resizeAction(this.autoFit, lastSize, size);
      if (action === "refit") this.fitToScreen();
      else if (action === "recenter") {
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
    this.stopMotionWatch = watchReducedMotion((reduced) => {
      this.reducedMotion = reduced;
      // Effects already playing finish as they are; conditions redraw at once.
      for (const view of this.tokens.values()) view.drawnKey = "";
      if (this.state && this.you) this.syncTokens();
      this.syncConditionLoop();
      this.syncFogLoop();
      this.invalidate();
    });
    document.addEventListener("visibilitychange", this.onVisibilityChange);
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
      let drew = false;
      for (const step of this.animations) {
        this.stepSkipped = false;
        if (!step(now)) this.animations.delete(step);
        if (!this.stepSkipped) drew = true;
      }
      if (drew) this.dirty = true;
    }
    for (const [id, ghost] of this.ghosts) {
      if (now > ghost.expires) {
        ghost.g.destroy();
        this.ghosts.delete(id);
        this.dirty = true;
      }
    }
    for (const from of expiredAims(this.aims, now)) this.clearAim(from);
    if (this.dirty && this.marksScale !== this.world.scale.x) this.redrawMarks();
    if (this.dirty) {
      this.app.render();
      this.notifyView();
    }
    this.dirty = false;
    // Cleared only now, so changes made while drawing this frame don't queue another.
    this.frame = 0;
    if (this.animations.size > 0 || this.ghosts.size > 0 || this.aims.size > 0 || this.pendingSize) this.schedule();
  };

  /** In the frame that draws it, so DOM layered over the canvas moves with the picture. */
  private notifyView() {
    const view = this.transform;
    const last = this.lastView;
    if (last && last.scale === view.scale && last.x === view.x && last.y === view.y) return;
    this.lastView = view;
    for (const fn of this.viewListeners) fn(view);
  }

  /**
   * Follow the board's world transform: called now with the current one, then once per drawn
   * frame in which it changed. Returns the unsubscribe.
   */
  onViewChange(fn: (view: BoardTransform) => void): () => void {
    this.viewListeners.add(fn);
    if (this.initialized) fn(this.transform);
    return () => this.viewListeners.delete(fn);
  }

  /** The board's world transform right now. */
  get transform(): BoardTransform {
    return { scale: this.world.scale.x, x: this.world.x, y: this.world.y };
  }

  /** A page point (clientX/Y) in board coordinates, or null when it is not over the canvas. */
  clientToBoard(clientX: number, clientY: number): Point | null {
    if (!this.initialized) return null;
    return clientToBoard({ x: clientX, y: clientY }, this.app.canvas.getBoundingClientRect(), this.transform);
  }

  /** The board point in the middle of the canvas, or null before the board is ready. */
  visibleCentre(): Point | null {
    if (!this.initialized) return null;
    const canvas = this.app.canvas.getBoundingClientRect();
    return this.clientToBoard(canvas.left + canvas.width / 2, canvas.top + canvas.height / 2);
  }

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
    this.attackFx = [];
    this.loopRegistered = false;
    this.stopMotionWatch?.();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.viewListeners.clear();
    this.hostObserver?.disconnect();
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.canvas.removeEventListener("touchstart", this.onTouchStart);
    this.app.canvas.removeEventListener("touchmove", this.onTouchMove);
    this.app.canvas.removeEventListener("touchend", this.onTouchEnd);
    this.app.canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.app.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.app.destroy(true, { children: true });
    this.initialized = false;
  }

  update(state: RoomState, you: Participant) {
    this.state = state;
    this.you = you;
    this.syncMap();
    this.syncGrid();
    this.syncTokens();
    if (state.templates !== this.drawnTemplates || state.fog !== this.drawnFog) {
      for (const id of this.removing) if (!state.templates[id]) this.removing.delete(id);
      for (const id of this.removingFog) if (!state.fog[id]) this.removingFog.delete(id);
      this.removeCancelledAreas();
      this.redrawMarks();
    }
    // Tokens may have moved or gone while a target is being picked.
    if (this.tool.kind === "attack") {
      if (this.attackHover && !state.tokens[this.attackHover]) this.attackHover = null;
      this.redrawOverlay();
    }
    if (this.autoFit) this.fitToScreen();
    // A grid change moves the squares under a still pointer.
    if (this.placement) this.redrawGhost();
    this.syncConditionLoop();
    this.invalidate();
  }

  /** Previewing as a player (gm-view-as-player): tokens take no pointer input, so nothing can be dragged or aimed. */
  setReadOnly(readOnly: boolean) {
    if (this.readOnly === readOnly) return;
    this.readOnly = readOnly;
    for (const view of this.tokens.values()) view.drawnKey = "";
    if (this.initialized && this.state && this.you) this.syncTokens();
    this.invalidate();
  }

  /** GM only: false hides the fog tint entirely, leaving a faint outline, so the GM sees everything. */
  setGmFogShown(shown: boolean) {
    if (this.gmFogShown === shown) return;
    this.gmFogShown = shown;
    if (this.initialized) this.invalidateFog();
  }

  private invalidateFog() {
    this.drawnFog = null;
    this.redrawFog();
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
      const pulse = pingPulse((now - started) / PING_MS, this.reducedMotion);
      if (!pulse || ring.destroyed) {
        if (!ring.destroyed) ring.destroy();
        return false;
      }
      const cell = this.state?.scene.grid.cellSize ?? 70;
      ring
        .clear()
        .circle(0, 0, cell * pulse.radiusCells)
        .stroke({ width: 4 / this.world.scale.x, color, alpha: pulse.alpha });
      return true;
    });
    this.invalidate();
  }

  /**
   * Another participant's area being aimed (KAN-35): a translucent outline with their name at the
   * origin, replaced on each update and gone a second after the last one. Null clears it.
   */
  showAimPreview(from: string, preview: AimPreview | null, label: string) {
    if (!preview || !this.state) return this.clearAim(from);
    let aim = this.aims.get(from);
    if (!aim) {
      const view = new Container();
      view.addChild(new Graphics());
      view.addChild(new Text({ text: "", style: { fill: 0xffffff, fontSize: 13, fontFamily: BOARD_FONT, fontWeight: "600", stroke: { color: 0x000000, width: 4 } } }));
      this.fxLayer.addChild(view);
      aim = { view, expires: 0 };
      this.aims.set(from, aim);
    }
    const [g, text] = aim.view.children as [Graphics, Text];
    const grid = this.state.scene.grid;
    const px = 1 / this.world.scale.x;
    const shape = areaShape(preview.shape, preview.origin, preview.toward, preview.size, grid, preview.width);
    g.clear();
    if (shape.kind === "circle") g.circle(shape.center.x, shape.center.y, shape.radius);
    else g.poly(shape.points.flatMap((p) => [p.x, p.y]));
    const color = preview.gmOnly ? GM_AREA_COLOR : AREA_COLOR;
    g.fill({ color, alpha: 0.1 }).stroke({ width: 2 * px, color, alpha: 0.6 });
    text.text = `${label} aiming`;
    text.scale.set(px);
    text.position.set(preview.origin.x + 6 * px, preview.origin.y + 6 * px);
    aim.expires = aimExpiry(performance.now());
    this.invalidate();
  }

  private clearAim(from: string) {
    const aim = this.aims.get(from);
    if (!aim) return;
    aim.view.destroy({ children: true });
    this.aims.delete(from);
    this.dirty = true;
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
    if (tool.kind !== this.tool.kind || (tool.kind === "fog" && this.tool.kind === "fog" && tool.mode !== this.tool.mode)) {
      if (this.gesture && this.tool.kind === "area") this.callbacks.aimEnd(this.tool.gmOnly);
      this.measurement = null;
      this.gesture = null;
      this.fogPoints = [];
      this.fogHover = null;
    }
    this.attackHover = null;
    this.tool = tool;
    if (this.initialized) this.app.stage.cursor = this.toolCursor();
    if (this.state) this.syncTokens();
    this.redrawOverlay();
  }

  private toolCursor() {
    if (this.placement) return "crosshair";
    return this.tool.kind === "select" ? "default" : TOOL_CURSORS[this.tool.kind];
  }

  // ---------- placing a new token (place-token-on-board) ----------

  /**
   * Start or stop placing a new token. While placing, a ghost of it follows the pointer,
   * snapped to the square(s) it would cover; a click there calls `placeToken`, a drag still
   * pans, and the rail's tools wait until it is done.
   */
  setPlacement(placement: PlacementGhost | null) {
    this.placement = placement;
    this.placeDown = null;
    if (placement) {
      this.gesture = null;
      this.redrawOverlay();
    } else {
      this.ghost?.container.destroy({ children: true });
      this.ghost = null;
    }
    if (this.initialized) this.app.stage.cursor = this.toolCursor();
    if (this.state) this.syncTokens();
    this.redrawGhost();
  }

  private redrawGhost() {
    if (!this.initialized) return;
    const { placement, hover, state, you } = this;
    const g = this.ghostFootprint.clear();
    if (!placement || !hover || !state || !you) {
      if (this.ghost) this.ghost.container.visible = false;
      return this.invalidate();
    }
    const grid = state.scene.grid;
    const at = placementPoint(hover.at, placement.size, grid, hover.free);
    // Alt places freely, so there is no square to highlight.
    if (!hover.free) {
      const r = footprint(at, placement.size, grid);
      g.rect(r.x, r.y, r.width, r.height)
        .fill({ color: 0xffffff, alpha: 0.18 })
        .stroke({ width: 2 / this.world.scale.x, color: 0xffffff, alpha: 0.9 });
    }
    if (!this.ghost) {
      this.ghost = this.createTokenView(GHOST_ID);
      this.fxLayer.addChild(this.ghost.container);
    }
    const token: Token = {
      id: GHOST_ID,
      name: placement.name,
      position: at,
      size: placement.size,
      rotation: placement.rotation,
      color: placement.color,
      imageUrl: placement.imageUrl,
      assetId: null,
      ownerIds: [],
      hidden: placement.hidden,
      stats: placement.stats,
      conditions: [],
    };
    this.drawToken(this.ghost, token, grid, you);
    const view = this.ghost.container;
    // Never a target: a click goes through it to the stage, which places the token.
    view.eventMode = "none";
    view.alpha = placement.hidden ? 0.35 : 0.75;
    view.position.set(at.x, at.y);
    view.visible = true;
    this.invalidate();
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
    // Areas still on their way to the server are cleared too, once they arrive.
    this.cancelledAreas.push(...this.pendingAreas);
    this.pendingAreas = [];
    this.redrawMarks();
  }

  private requestRemove(t: AreaTemplate) {
    if (this.removing.has(t.id)) return;
    this.removing.add(t.id);
    // Hidden from now on; shown again if the server refuses, so it never lingers invisibly.
    const restore = () => {
      this.removing.delete(t.id);
      this.redrawMarks();
    };
    this.callbacks.removeTemplate(t.id).then((ok) => {
      if (!ok) restore();
    }, restore);
  }

  /** Remove the templates of placements Clear all cancelled, as they appear in state. */
  private removeCancelledAreas() {
    const you = this.you;
    if (!you || this.cancelledAreas.length === 0) return;
    for (const t of Object.values(this.state?.templates ?? {})) {
      if (t.ownerId !== you.id || this.removing.has(t.id)) continue;
      const i = this.cancelledAreas.findIndex(
        (a) =>
          a.shape === t.shape && a.size === t.size && a.gmOnly === t.gmOnly &&
          a.origin.x === t.origin.x && a.origin.y === t.origin.y &&
          a.toward.x === t.toward.x && a.toward.y === t.toward.y,
      );
      if (i === -1) continue;
      this.cancelledAreas.splice(i, 1);
      this.requestRemove(t);
    }
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
      this.callbacks.aimEnd(tool.gmOnly);
      const area = this.areaFromGesture(gesture, tool);
      if (area?.kind === "area" && this.state) this.placeArea(area, tool.gmOnly);
    } else if (tool.kind === "fog" && tool.mode === "rect" && dragged) {
      this.sendFog({ shape: "rect", from, to });
    }
    this.redrawMarks();
  }

  // ---------- fog of war (FR-GM-17, ADR 0016) ----------

  /** Send a fog region; draw it until the server's answer arrives. */
  private sendFog(region: FogDraft) {
    this.pendingFog.push(region);
    const done = () => {
      this.pendingFog = this.pendingFog.filter((r) => r !== region);
      this.redrawMarks();
    };
    this.callbacks.addFog(region).then(done, done);
  }

  /** Close the polygon being clicked out and send it. False when it has too few corners. */
  closeFogPolygon(): boolean {
    if (this.fogPoints.length < 3) return false;
    this.sendFog({ shape: "polygon", points: this.fogPoints });
    this.fogPoints = [];
    this.fogHover = null;
    this.redrawMarks();
    return true;
  }

  /** Drop the polygon's last corner. False when there is none. */
  undoFogPoint(): boolean {
    if (this.fogPoints.length === 0) return false;
    this.fogPoints = this.fogPoints.slice(0, -1);
    this.redrawOverlay();
    return true;
  }

  /** Abandon the polygon being clicked out. False when there is none, so Escape can leave the tool. */
  cancelFogPolygon(): boolean {
    if (this.fogPoints.length === 0) return false;
    this.fogPoints = [];
    this.fogHover = null;
    this.redrawOverlay();
    return true;
  }

  /** A Fog tool click: a polygon corner, or a region to reveal. */
  private fogClick(at: Point, screen: Point) {
    if (this.tool.kind !== "fog" || !this.state) return;
    if (this.tool.mode === "reveal") {
      const visible = Object.fromEntries(Object.entries(this.state.fog).filter(([id]) => !this.removingFog.has(id)));
      const region = fogRegionAt(visible, at);
      if (!region) return;
      this.removingFog.add(region.id);
      // Cleared on any answer: an undo can bring the same id back, and it must be drawn again.
      const settle = () => {
        this.removingFog.delete(region.id);
        this.redrawMarks();
      };
      this.callbacks.removeFog(region.id).then(settle, settle);
      this.redrawMarks();
      return;
    }
    // Clicking the first corner again closes the polygon.
    const first = this.fogPoints[0];
    if (first && this.fogPoints.length >= 3) {
      const p = this.world.toGlobal(first);
      if (Math.hypot(p.x - screen.x, p.y - screen.y) <= FOG_CLOSE_PX) {
        this.closeFogPolygon();
        return;
      }
    }
    this.fogPoints = [...this.fogPoints, at];
    this.redrawOverlay();
  }

  /** Draw fog: opaque for players, see-through with an outline for the GM. */
  private redrawFog() {
    const state = this.state;
    this.drawnFog = state?.fog ?? null;
    const g = this.fogGraphics.clear();
    const edge = this.fogEdgeGraphics.clear();
    if (!state) return;
    const gm = this.you?.role === "gm";
    const px = 1 / this.world.scale.x;
    const cell = state.scene.grid.cellSize;
    // "See everything": the GM's tint is switched off and only a faint outline marks each region.
    const tint = !gm || this.gmFogShown;
    const hasRegions = Object.keys(state.fog).length > 0 || this.pendingFog.length > 0;
    // The cloud texture is made on first need, so a board with no fog never pays for it.
    const cloud = tint && hasRegions ? this.fogCloud() : null;
    // The clouds drift across the board; the texture tiles seamlessly, so any offset is fine.
    const matrix = new Matrix().scale(FOG_CLOUD_SCALE, FOG_CLOUD_SCALE).translate(this.fogOffset.x, this.fogOffset.y);
    const fillAlpha = gm ? FOG_GM_ALPHA : 1;
    const draw = (points: Point[], pending: boolean) => {
      const flat = points.flatMap((p) => [p.x, p.y]);
      if (tint) g.poly(flat).fill({ texture: cloud!, matrix, textureSpace: "global", alpha: fillAlpha });
      if (!gm) g.poly(flat).stroke({ width: 2 * FOG_BLEED_CELLS * cell, join: "miter", texture: cloud!, matrix, textureSpace: "global", alpha: 1 });
      if (gm) edge.poly(flat).stroke({ width: 2 * px, color: FOG_EDGE, alpha: (pending ? 0.5 : 0.9) * (tint ? 1 : 0.4) });
    };
    for (const region of Object.values(state.fog)) {
      if (!this.removingFog.has(region.id)) draw(region.points, false);
    }
    for (const region of this.pendingFog) draw(fogDraftPoints(region), true);
    this.syncFogLoop();
  }

  /** The seamless cloud texture, drawn once on first use. */
  private fogCloud(): Texture {
    if (!this.fogTexture) {
      this.fogTexture = Texture.from(makeFogCanvas());
      this.fogTexture.source.style.addressMode = "repeat";
    }
    return this.fogTexture;
  }

  /**
   * Runs the fog drift only while fog exists, the page is shown, motion is allowed, and the
   * fill is drawn: a GM who switched the tint off sees no drift, so there is nothing to animate.
   */
  private fogLoopWanted() {
    const any = Object.keys(this.state?.fog ?? {}).length > 0 || this.pendingFog.length > 0;
    const tinted = this.you?.role !== "gm" || this.gmFogShown;
    return any && tinted && document.visibilityState === "visible" && !this.reducedMotion;
  }

  private syncFogLoop() {
    if (!this.initialized || this.fogLoopRegistered || !this.fogLoopWanted()) return;
    this.fogLoopRegistered = true;
    // So the first frame after a pause does not apply the whole pause as drift.
    this.lastFogDraw = 0;
    this.animations.add(this.fogLoop);
    this.schedule();
  }

  private fogLoop = (now: number) => {
    if (!this.fogLoopWanted()) {
      this.fogLoopRegistered = false;
      return false;
    }
    if (now - this.lastFogDraw < FOG_DRIFT_INTERVAL_MS) {
      this.stepSkipped = true;
      return true;
    }
    const dt = this.lastFogDraw === 0 ? 0 : (now - this.lastFogDraw) / 1000;
    this.lastFogDraw = now;
    this.fogOffset = { x: this.fogOffset.x + FOG_DRIFT_PX_PER_S * dt, y: this.fogOffset.y + FOG_DRIFT_PX_PER_S * 0.35 * dt };
    this.redrawFog();
    return true;
  };

  /** Send an area to the table; show it until the server's answer arrives. */
  private placeArea(area: Extract<Mark, { kind: "area" }>, gmOnly: boolean) {
    const origin = areaOrigin(area.origin, this.state!.scene.grid, area.free);
    const pending = { ...area, origin, free: true, gmOnly };
    this.pendingAreas.push(pending);
    this.callbacks
      .placeTemplate({ shape: area.shape, origin, toward: area.toward, size: area.size, width: area.width, gmOnly })
      .then(
        (ok) => {
          // Refused: nothing will arrive to clear, so stop waiting for it.
          if (!ok) this.cancelledAreas = this.cancelledAreas.filter((a) => a !== pending);
          else this.removeCancelledAreas();
        },
        () => {
          this.cancelledAreas = this.cancelledAreas.filter((a) => a !== pending);
        },
      )
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
    const origin = areaOrigin(from, grid, free);
    const size = dragged ? areaSizeFromDrag(origin, to, grid, free) : tool.size;
    // A click aims right from the snapped origin, not at the raw press point beside it.
    const toward = dragged ? to : { x: origin.x + 1, y: origin.y };
    const width = tool.shape === "line" ? tool.lineCells * grid.unitsPerCell : undefined;
    return { kind: "area", shape: tool.shape, size, origin: from, toward, free, gmOnly: tool.gmOnly, width };
  }

  /** Remove every mark the eraser touches on its way from `from` to `at`. */
  private eraseAt(at: Point, from: Point = at) {
    const grid = this.state?.scene.grid;
    if (!grid) return;
    const reach = ERASER_REACH_PX / this.world.scale.x;
    const path = sweepPoints(from, at, reach);
    const touches = (mark: Mark) => path.some((p) => hitMark(mark, p, reach, grid));
    const kept = this.marks.filter((mark) => !touches(mark));
    const measurementHit = this.measurement !== null && touches(this.measurement);
    // Shared templates: only ones this viewer may remove (their own; any, for the GM).
    const you = this.you;
    for (const t of Object.values(this.state?.templates ?? {})) {
      if (you && can.removeTemplate(you, t) && touches(templateMark(t))) this.requestRemove(t);
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
    this.redrawFog();
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
    if (tool.kind === "fog") this.drawFogDraft(g, tool.mode);
    if (tool.kind === "attack") this.drawAttackLine(g, tool.attackerId);
    this.invalidate();
  }

  /** The fog rectangle being dragged, or the polygon being clicked out with its next edge. */
  private drawFogDraft(g: Graphics, mode: Extract<BoardTool, { kind: "fog" }>["mode"]) {
    const px = 1 / this.world.scale.x;
    const style = { width: 2 * px, color: FOG_EDGE, alpha: 0.95 };
    const gesture = this.gesture;
    if (mode === "rect" && gesture?.dragged) {
      const points = fogDraftPoints({ shape: "rect", from: gesture.from, to: gesture.to });
      g.poly(points.flatMap((p) => [p.x, p.y])).fill({ color: FOG_COLOR, alpha: 0.4 }).stroke(style);
      return;
    }
    if (mode !== "polygon" || this.fogPoints.length === 0) return;
    const [first, ...rest] = this.fogPoints;
    g.moveTo(first!.x, first!.y);
    for (const p of rest) g.lineTo(p.x, p.y);
    if (this.fogHover) g.lineTo(this.fogHover.x, this.fogHover.y);
    g.stroke(style);
    for (const p of this.fogPoints) g.circle(p.x, p.y, 4 * px).fill({ color: FOG_EDGE });
    // The first corner is the one to click to close the shape.
    if (this.fogPoints.length >= 3) g.circle(first!.x, first!.y, FOG_CLOSE_PX * px).stroke(style);
  }

  /**
   * While picking a target: a dashed arrow from the attacker to the token under the pointer, with
   * the distance halfway along. It starts and ends just outside each token's rings (owner, focus,
   * active turn) rather than crossing the portraits, and a thin ring marks the token aimed at.
   * Only this viewer sees it; nothing is sent until the roll (attack-targeting).
   */
  private drawAttackLine(g: Graphics, attackerId: string) {
    const state = this.state;
    const attacker = state?.tokens[attackerId];
    const target = this.attackHover ? state?.tokens[this.attackHover] : undefined;
    if (!state || !attacker || !target) return;
    const grid = state.scene.grid;
    const px = 1 / this.world.scale.x;
    // A token's disc is size × cell / 2 − 2; its active-turn ring reaches 9 beyond (see drawDecor).
    const clearance = (t: Token) => (t.size * grid.cellSize) / 2 - 2 + 9 + 3 * px;

    const from = attacker.position;
    const to = target.position;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const ux = (to.x - from.x) / (length || 1);
    const uy = (to.y - from.y) / (length || 1);
    const start = { x: from.x + ux * clearance(attacker), y: from.y + uy * clearance(attacker) };
    const tip = { x: to.x - ux * clearance(target), y: to.y - uy * clearance(target) };

    // The token aimed at: one thin ring just inside where the arrow stops.
    const ringRadius = clearance(target) - 3 * px;
    g.circle(to.x, to.y, ringRadius).stroke({ width: 3.5 * px, color: AIM_EDGE, alpha: 0.45 });
    g.circle(to.x, to.y, ringRadius).stroke({ width: 1.5 * px, color: AIM_COLOR, alpha: 0.95 });

    // Snapped cell to cell, like Measure: exact for 1-cell tokens, a hint for larger ones.
    const m = measure(from, to, grid, false);
    const span = Math.hypot(tip.x - start.x, tip.y - start.y);
    // Tokens touching or overlapping: no room for an arrow, so the ring and distance say it all.
    if (span <= 0 || (tip.x - start.x) * ux + (tip.y - start.y) * uy <= 0) {
      this.showLabel(m.label, { x: to.x, y: to.y - ringRadius });
      return;
    }

    const head = Math.min(10 * px, span / 2);
    const shaftEnd = { x: tip.x - ux * head, y: tip.y - uy * head };
    const dashes = (style: { width: number; color: number; alpha: number }) => {
      const total = Math.hypot(shaftEnd.x - start.x, shaftEnd.y - start.y);
      const dash = 7 * px;
      const gap = 5 * px;
      for (let d = 0; d < total; d += dash + gap) {
        const e = Math.min(d + dash, total);
        g.moveTo(start.x + ux * d, start.y + uy * d).lineTo(start.x + ux * e, start.y + uy * e);
      }
      g.stroke({ ...style, cap: "round" });
    };
    dashes({ width: 4 * px, color: AIM_EDGE, alpha: 0.45 });
    dashes({ width: 2 * px, color: AIM_COLOR, alpha: 0.95 });

    const wing = 5 * px;
    g.poly([
      tip.x, tip.y,
      shaftEnd.x - uy * wing, shaftEnd.y + ux * wing,
      shaftEnd.x + uy * wing, shaftEnd.y - ux * wing,
    ])
      .fill({ color: AIM_COLOR, alpha: 0.95 })
      .stroke({ width: 1.5 * px, color: AIM_EDGE, alpha: 0.55, join: "round" });

    // Halfway along, above the shaft, so it names the gap rather than sitting on a portrait.
    this.showLabel(m.label, { x: (start.x + tip.x) / 2, y: (start.y + tip.y) / 2 });
  }

  /** The topmost token whose disc contains `p`, other than `exceptId`. */
  private tokenAt(p: Point, exceptId: string): string | null {
    const state = this.state;
    if (!state) return null;
    const cell = state.scene.grid.cellSize;
    // Later children of the token layer draw on top, so search from the top down.
    const views = [...this.tokens.entries()].sort(([, a], [, b]) => this.tokenLayer.getChildIndex(b.container) - this.tokenLayer.getChildIndex(a.container));
    for (const [id] of views) {
      const t = state.tokens[id];
      if (!t || id === exceptId) continue;
      if (Math.hypot(p.x - t.position.x, p.y - t.position.y) <= (t.size * cell) / 2) return id;
    }
    return null;
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
        const shape = areaShape(mark.shape, origin, mark.toward, mark.size, grid, mark.width);
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
    // Measurements and areas are sized and snapped by the grid.
    this.marksScale = Number.NaN;

    this.grid.clear();
    if (!this.state!.scene.map || this.mapMissing) this.grid.rect(0, 0, width, height).fill({ color: EMPTY_MAP_FILL });
    // Legacy or external grids still need a safety guard even though the editor rejects them.
    if (!canRenderGrid(g.cellSize, { width, height })) {
      this.invalidate();
      return;
    }
    const { xs, ys } = gridLines(g, { x: 0, y: 0, width, height });
    for (const x of xs) this.grid.moveTo(x, 0).lineTo(x, height);
    for (const y of ys) this.grid.moveTo(0, y).lineTo(width, y);
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
        // A filter is not a child: free the Unconscious greyscale's GPU resources by hand.
        view.grey?.destroy();
        view.container.destroy({ children: true });
        this.tokens.delete(id);
        this.pendingMoves.delete(id);
      }
    }

    for (const token of Object.values(state.tokens)) {
      let view = this.tokens.get(token.id);
      if (!view) {
        view = this.createTokenView(token.id);
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

  private createTokenView(tokenId: string): TokenView {
    const container = new Container();
    const body = new Graphics();
    const decor = new Graphics();
    const markers = new Container();
    const label = new Text({
      text: "",
      style: { fill: 0xffffff, fontSize: 14, fontFamily: BOARD_FONT, stroke: { color: 0x000000, width: 3 } },
    });
    label.anchor.set(0.5, 0);
    const image = new Sprite(Texture.EMPTY);
    image.anchor.set(0.5);
    image.visible = false;
    const imageMask = new Graphics();
    image.mask = imageMask;
    // Disc first so it shows through while the image loads, or instead of one that failed.
    const art = new Container();
    art.addChild(body, image, imageMask);
    container.addChild(art, decor, markers, label);
    container.on("pointerdown", (e: FederatedPointerEvent) => this.onTokenDown(e, tokenId));
    this.tokenLayer.addChild(container);
    return {
      container, art, body, image, imageMask, imageUrl: null, radius: 0, decor, markers, label, drawnKey: "",
      conditions: [], looping: false, shake: { x: 0, y: 0 }, shakeOwner: null, tremble: { x: 0, y: 0 }, grey: null,
    };
  }

  private drawToken(view: TokenView, token: Token, grid: GridSpec, you: Participant) {
    const owned = token.ownerIds.includes(you.id);
    const movable = !this.readOnly && can.moveToken(you, token);
    const focused = this.focusedId === token.id;
    const active = this.activeTokenId() === token.id;
    const key = JSON.stringify([
      token.name, token.size, token.rotation, token.color, token.hidden, owned, movable, grid.cellSize,
      token.stats, token.conditions, focused, active, token.imageUrl,
    ]);
    // Every visible token takes presses so a click can select it; only movable ones start a drag.
    view.container.eventMode = "static";
    view.container.cursor = this.placement || this.tool.kind !== "select" ? this.toolCursor() : movable ? "grab" : "pointer";
    if (key === view.drawnKey) return;
    view.drawnKey = key;

    const r = (token.size * grid.cellSize) / 2 - 2;
    view.radius = r;
    view.body.clear().circle(0, 0, r).fill({ color: token.color });
    view.imageMask.clear().circle(0, 0, r).fill({ color: 0xffffff });
    this.syncTokenImage(view, token.imageUrl);
    view.image.rotation = token.rotation * Math.PI / 180;
    view.container.alpha = token.hidden ? 0.45 : 1;
    view.label.text = token.hidden ? `${token.name} (hidden)` : token.name;
    const fontSize = tokenLabelFontSize(r);
    view.label.style.fontSize = fontSize;
    view.label.style.stroke = { color: 0x000000, width: tokenLabelStroke(fontSize) };
    view.label.position.set(0, r + 2);

    this.drawDecor(view, token, r, focused, active, owned);
    this.drawConditions(view, token.conditions, r);
    this.drawConditionLook(view, token.conditions);
  }

  /**
   * The fixed effect of each condition (KAN-76): a look for the art wrapper (fade, tilt, grey) and
   * decoration in the effects layer. Looping ones are redrawn by `conditionLoop`; with reduced
   * motion, or while the loop is not running, they show their still pose.
   */
  private drawConditionLook(view: TokenView, conditions: ConditionId[]) {
    view.conditions = conditions;
    view.looping = !this.reducedMotion && loopingConditions(conditions).length > 0;
    const style = artStyleFor(conditions, this.reducedMotion);
    const { art } = view;
    art.alpha = style.alpha;
    art.rotation = (style.tilt * Math.PI) / 180;
    art.scale.set(1, style.squash);
    if (style.greyscale) {
      view.grey ??= new ColorMatrixFilter();
      view.grey.greyscale(0.6, false);
      art.filters = [view.grey];
    } else {
      art.filters = null;
    }
    if (!view.looping) this.applyArtOffset(view, 0, 0);
  }

  /** Trembling and a hit's shake move the art inside the token; `container.position` is never touched. */
  private applyArtOffset(view: TokenView, trembleX: number, trembleY: number) {
    view.tremble.x = trembleX;
    view.tremble.y = trembleY;
    view.art.position.set(view.shake.x + trembleX, view.shake.y + trembleY);
  }

  private loopWanted() {
    let loopingTokens = 0;
    for (const view of this.tokens.values()) if (view.looping && view.container.visible) loopingTokens++;
    return conditionLoopWanted({ loopingTokens, pageVisible: document.visibilityState === "visible", reducedMotion: this.reducedMotion });
  }

  /** A page that becomes visible again restarts any loop that stopped while it was hidden. */
  private onVisibilityChange = () => {
    // Browsers pause animation frames in a hidden tab, so the drift clock must not count the pause.
    if (document.visibilityState === "hidden") this.lastFogDraw = 0;
    this.syncConditionLoop();
    this.syncFogLoop();
  };

  /** Runs the condition loop only while a visible token has a moving effect, the page is shown and motion is allowed. */
  private syncConditionLoop = () => {
    if (!this.initialized || this.loopRegistered || !this.loopWanted()) return;
    this.loopRegistered = true;
    this.animations.add(this.conditionLoop);
    this.schedule();
  };

  /** One step of `animations` for every looping condition: redraws at most 30 times a second, then unregisters itself. */
  private conditionLoop = (now: number) => {
    if (!this.loopWanted()) {
      this.loopRegistered = false;
      for (const view of this.tokens.values()) if (view.tremble.x !== 0 || view.tremble.y !== 0) this.applyArtOffset(view, 0, 0);
      return false;
    }
    if (!loopFrameDue(now, this.lastLoopDraw)) {
      this.stepSkipped = true;
      return true;
    }
    this.lastLoopDraw = now;
    const t = now / 1000;
    for (const view of this.tokens.values()) {
      if (!view.looping) continue;
      const amp = artStyleFor(view.conditions, false).tremble * view.radius;
      this.applyArtOffset(view, Math.sin(t * 61) * amp, Math.cos(t * 53) * amp);
    }
    return true;
  };

  /**
   * The board's part of an attack effect (KAN-76): a hit shakes the target's art. The projectile,
   * flash, miss and damage number are drawn by the React effects overlay (board-effects-overlay).
   * The shake follows the token and never changes its recorded position.
   */
  playAttackEffect(effect: AttackEffect) {
    if (!this.initialized || !this.state || effect.kind !== "hit") return;
    const target = this.tokens.get(effect.tokenId);
    if (!target || target.container.destroyed) return;
    while (this.attackFx.length >= MAX_ATTACK_EFFECTS) this.endAttackFx(this.attackFx[0]!);

    const plan = attackPlan(effect, this.reducedMotion);
    const started = performance.now();
    const fx: AttackFx = {
      step: (now) => {
        const t = Math.max(0, (now - started) / plan.durationMs);
        if (t >= 1 || target.container.destroyed) {
          this.endAttackFx(fx);
          return false;
        }
        const r = target.radius;
        // The newest hit on a token owns its shake, so an older one ending can't cut it off.
        target.shakeOwner = fx;
        target.shake.x = plan.motion ? Math.sin(t * 40) * r * 0.12 * (1 - t) : 0;
        this.applyArtOffset(target, target.tremble.x, target.tremble.y);
        return true;
      },
      stop: () => {
        if (!target.container.destroyed && target.shakeOwner === fx) {
          target.shakeOwner = null;
          target.shake.x = 0;
          this.applyArtOffset(target, target.tremble.x, target.tremble.y);
        }
      },
    };
    this.attackFx.push(fx);
    this.animations.add(fx.step);
    this.invalidate();
  }

  private endAttackFx(fx: AttackFx) {
    this.animations.delete(fx.step);
    this.attackFx = this.attackFx.filter((f) => f !== fx);
    fx.stop();
    this.invalidate();
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
    // Direction remains visible even when the token has no art; labels and HP stay upright.
    const angle = (token.rotation - 90) * Math.PI / 180;
    const x = Math.cos(angle) * (r - 5);
    const directionY = Math.sin(angle) * (r - 5);
    const side = Math.max(3, Math.min(6, r * 0.15));
    const dx = Math.cos(angle + Math.PI / 2) * side;
    const dy = Math.sin(angle + Math.PI / 2) * side;
    g.poly([x + Math.cos(angle) * side, directionY + Math.sin(angle) * side, x + dx, directionY + dy, x - dx, directionY - dy])
      .fill(0xffffff).stroke({ width: 1, color: 0x000000 });
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
    // Below the name label, which scales with the token, so the name never covers the markers.
    const y = conditionRowY(view.label.position.y, view.label.height, size);
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
          fontFamily: BOARD_FONT,
          fontWeight: "700",
          stroke: { color: 0x000000, width: 2 },
        },
      });
      text.anchor.set(0.5);
      marker.addChild(shape, text);
      marker.position.set(startX + i * step, y);
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
    // With a tool active or a token being placed, let the press reach the stage so e.g. a
    // measurement starts here, or the new token can go on an occupied square.
    if (e.button !== 0 || this.tool.kind !== "select" || this.placement) return;
    e.stopPropagation();
    const view = this.tokens.get(tokenId);
    const token = this.state?.tokens[tokenId];
    if (!view || !token || !this.you) return;
    const movable = !this.readOnly && can.moveToken(this.you, token);
    const p = this.toBoard(e.global);
    this.drag = {
      tokenId,
      offset: { x: p.x - view.container.x, y: p.y - view.container.y },
      movable,
    };
    this.dragDownAt = { x: e.global.x, y: e.global.y };
    if (!movable) return;
    view.container.cursor = "grabbing";
    this.tokenLayer.addChild(view.container); // bring to front
    this.invalidate();
  };

  private onBackgroundDown = (e: FederatedPointerEvent) => {
    if (this.placement && e.button === 2) return this.callbacks.cancelPlacement();
    if (this.placement && e.button === 0) {
      this.placeDown = { x: e.global.x, y: e.global.y };
      // Falls through to pan: a drag moves the view, and only a press that stays put places.
      this.pan = { start: { x: e.global.x, y: e.global.y }, origin: { x: this.world.x, y: this.world.y } };
      return;
    }
    if (this.tool.kind === "attack") {
      if (e.button === 2) return this.callbacks.cancelAttack();
      const target = e.button === 0 ? this.tokenAt(this.toBoard(e.global), this.tool.attackerId) : null;
      if (target) {
        this.lastPickAt = performance.now();
        return this.callbacks.pickTarget(this.tool.attackerId, target);
      }
      // A press on the map or the attacker picks nothing; dragging still pans.
      this.pan = { start: { x: e.global.x, y: e.global.y }, origin: { x: this.world.x, y: this.world.y } };
      return;
    }
    if (this.tool.kind === "fog" && this.tool.mode !== "rect" && e.button === 0) {
      return this.fogClick(this.toBoard(e.global), { x: e.global.x, y: e.global.y });
    }
    if (this.tool.kind !== "select" && e.button === 0) {
      const at = this.toBoard(e.global);
      this.gesture = { from: at, to: at, screenFrom: { x: e.global.x, y: e.global.y }, free: e.altKey, dragged: false, path: [at] };
      if (this.tool.kind === "measure") this.measurement = null;
      if (this.tool.kind === "erase") return this.eraseAt(at);
      this.redrawOverlay();
      return;
    }
    this.pan = { start: { x: e.global.x, y: e.global.y }, origin: { x: this.world.x, y: this.world.y }, button: e.button };
  };

  private onPointerMove = (e: FederatedPointerEvent) => {
    if (this.placement) {
      this.hover = { at: this.toBoard(e.global), free: e.altKey };
      this.redrawGhost();
    }
    if (this.tool.kind === "attack" && !this.pan) {
      const hover = this.tokenAt(this.toBoard(e.global), this.tool.attackerId);
      if (hover !== this.attackHover) {
        this.attackHover = hover;
        this.redrawOverlay();
      }
    }
    if (this.tool.kind === "fog" && this.tool.mode === "polygon" && this.fogPoints.length > 0) {
      this.fogHover = this.toBoard(e.global);
      this.redrawOverlay();
    }
    if (this.gesture) {
      const gesture = this.gesture;
      const previous = gesture.to;
      gesture.to = this.toBoard(e.global);
      gesture.free = e.altKey;
      gesture.dragged ||= Math.hypot(e.global.x - gesture.screenFrom.x, e.global.y - gesture.screenFrom.y) >= MIN_MARK_DRAG_PX;
      if (this.tool.kind === "erase") return this.eraseAt(gesture.to, previous);
      const last = gesture.path[gesture.path.length - 1]!;
      const step = Math.hypot(gesture.to.x - last.x, gesture.to.y - last.y) * this.world.scale.x;
      const brushing = this.tool.kind === "draw" && this.tool.shape === "brush";
      if (brushing && step >= BRUSH_STEP_PX && gesture.path.length < MAX_STROKE_POINTS) gesture.path.push(gesture.to);
      // Aiming an area: the others see it take shape (KAN-35).
      if (this.tool.kind === "area" && this.state) {
        const area = this.areaFromGesture(gesture, this.tool);
        if (area?.kind === "area") {
          const origin = areaOrigin(area.origin, this.state.scene.grid, area.free);
          this.callbacks.aimPreview({ shape: area.shape, origin, toward: area.toward, size: area.size, width: area.width, gmOnly: this.tool.gmOnly });
        }
      }
      this.redrawOverlay();
    } else if (this.drag) {
      if (!this.drag.movable) return;
      const view = this.tokens.get(this.drag.tokenId);
      if (!view) return;
      const p = this.toBoard(e.global);
      const at = { x: p.x - this.drag.offset.x, y: p.y - this.drag.offset.y };
      view.container.position.set(at.x, at.y);
      this.callbacks.dragPreview(this.drag.tokenId, at);
      this.invalidate();
    } else if (this.pan) {
      // A press that hardly moves is a tap, not a deliberate pan (KAN-54).
      if (exceedsPanThreshold(this.pan.start, e.global)) this.autoFit = false;
      this.world.position.set(
        this.pan.origin.x + e.global.x - this.pan.start.x,
        this.pan.origin.y + e.global.y - this.pan.start.y,
      );
      this.invalidate();
    }
  };

  private onPointerUp = (e: FederatedPointerEvent) => {
    const pan = this.pan;
    this.pan = null;
    if (pan && pan.button === 0 && !this.placement && !this.gesture && this.tool.kind === "select" && !exceedsPanThreshold(pan.start, e.global)) {
      this.callbacks.selectToken(null);
    }
    const down = this.placeDown;
    this.placeDown = null;
    if (down && this.placement && this.state) {
      if (Math.hypot(e.global.x - down.x, e.global.y - down.y) >= MIN_MARK_DRAG_PX) return;
      const at = placementPoint(this.toBoard(e.global), this.placement.size, this.state.scene.grid, e.altKey);
      return this.callbacks.placeToken(at);
    }
    if (this.gesture) return this.finishGesture();
    const drag = this.drag;
    const downAt = this.dragDownAt;
    this.drag = null;
    this.dragDownAt = null;
    if (!drag) return;
    // A press that stays put is a click: select the token. Anything further is a drag and moves it.
    const clicked = downAt !== null && Math.hypot(e.global.x - downAt.x, e.global.y - downAt.y) < MIN_MARK_DRAG_PX;
    if (clicked) this.callbacks.selectToken(drag.tokenId);
    const token = this.state?.tokens[drag.tokenId];
    const view = this.tokens.get(drag.tokenId);
    if (!drag.movable) return;
    if (!this.state || !token || !view) return this.callbacks.dragEnd(drag.tokenId, null);
    view.container.cursor = "grab";
    if (clicked) {
      // A click never moves the token, even one placed off-centre: put it back and end the ghost.
      view.container.position.set(token.position.x, token.position.y);
      this.invalidate();
      return this.callbacks.dragEnd(token.id, token.position);
    }

    this.invalidate();
    const dropped = { x: view.container.x, y: view.container.y };
    // Snap by default; hold Alt for free placement (FR-TAC-02).
    const to = e.altKey ? dropped : snapTokenCenter(dropped, token.size, this.state.scene.grid);
    view.container.position.set(to.x, to.y);
    this.callbacks.dragEnd(token.id, to);
    if (to.x === token.position.x && to.y === token.position.y) return;
    this.pendingMoves.set(token.id, to);
    this.callbacks.moveToken(token.id, to).then((ok) => {
      if (ok) return;
      this.pendingMoves.delete(token.id);
      const current = this.state?.tokens[token.id];
      if (current) {
        this.tokens.get(token.id)?.container.position.set(current.position.x, current.position.y);
        // Rejected: the others' ghost goes back to where the token still is.
        this.callbacks.dragEnd(token.id, current.position);
      }
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
  private pinch: { distance: number; midpoint: Point; scale: number; start: Point } | null = null;
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
    // Cancel whatever the first finger started, so a pinch never drags a token with it,
    // leaves half a drawing behind, or drops the token being placed.
    this.pan = null;
    this.placeDown = null;
    if (this.gesture) {
      this.gesture = null;
      this.redrawOverlay();
    }
    if (this.drag) {
      const view = this.tokens.get(this.drag.tokenId);
      const token = this.state?.tokens[this.drag.tokenId];
      if (view && token) view.container.position.set(token.position.x, token.position.y);
      this.callbacks.dragEnd(this.drag.tokenId, token?.position ?? null);
      this.drag = null;
      this.invalidate();
    }
    const { distance, midpoint } = this.touchInfo(e.touches);
    this.pinch = { distance, midpoint, scale: this.world.scale.x, start: midpoint };
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.pinch || e.touches.length !== 2) return;
    e.preventDefault();
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
    if (pinchIsManual(this.pinch.start, midpoint, this.world.scale.x, scale)) this.autoFit = false;
    this.world.scale.set(scale);
    this.world.position.set(midpoint.x - anchor.x * scale, midpoint.y - anchor.y * scale);
    this.pinch = { ...this.pinch, distance, midpoint, scale };
    this.invalidate();
  };

  private onTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) this.pinch = null;

    // Double-tap to ping. `dblclick` is synthesised inconsistently on touch, and a ping is
    // the one board gesture a player on a phone actually needs (FR-TAC-05).
    const touch = e.changedTouches[0];
    if (!touch || e.touches.length > 0 || this.pinch || this.placement) return;
    const rect = this.app.canvas.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    const now = performance.now();
    const quick = now - this.lastTap.at < 350;
    const close = Math.hypot(x - this.lastTap.x, y - this.lastTap.y) < 30;
    if (quick && close) {
      if (this.partOfAttackPick()) {
        this.lastTap = { at: 0, x: 0, y: 0 };
        return;
      }
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
    const rect = this.app.canvas.getBoundingClientRect();
    const screenPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const before = this.toBoard(screenPoint);
    const factor = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.world.scale.x * factor));
    if (zoomChangesScale(this.world.scale.x, scale)) this.autoFit = false;
    this.world.scale.set(scale);
    this.world.position.set(screenPoint.x - before.x * scale, screenPoint.y - before.y * scale);
    this.invalidate();
  };

  /**
   * Whether a double-click or double-tap belongs to picking an attack target. Such a ping would
   * land on the target for everyone, and the GM may be picking a hidden one (FR-GM-23).
   */
  private partOfAttackPick() {
    return this.tool.kind === "attack" || performance.now() - this.lastPickAt < 600;
  }

  /** The pointer left the board: there is no square to show the new token on. */
  private onPointerLeave = () => {
    if (!this.hover) return;
    this.hover = null;
    this.redrawGhost();
  };

  private onDoubleClick = (e: MouseEvent) => {
    // A double click while placing is two tries at the same square, not a ping.
    if (this.placement) return;
    if (this.partOfAttackPick()) return;
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

/** The corners of a fog draft, as `decide` will store them (a rectangle becomes four corners). */
function fogDraftPoints(region: FogDraft): Point[] {
  if (region.shape === "polygon") return region.points;
  const { from, to } = region;
  const [x0, x1] = [Math.min(from.x, to.x), Math.max(from.x, to.x)];
  const [y0, y1] = [Math.min(from.y, to.y), Math.max(from.y, to.y)];
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
}
