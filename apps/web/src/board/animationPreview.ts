import { Application, Assets, CanvasTextMetrics, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { graphicsBudget, subscribeGraphicsSettings } from "../ui/clientSettings";
import type { AnimationDef } from "@vtt/shared";
import { playNuke, playStrike, type FxHost, type RunningFx } from "./fx";

/**
 * The library editor's preview stage (ADR 0038): a small Pixi application with a courtyard map,
 * a faint grid and a portrait attacker and target. It plays an `AnimationDef` through the same
 * renderer as the board (`fx.ts`), so what the GM sees is what the table sees. It is not connected
 * to any room and changes no data. React mounts it through a thin component; nothing here knows
 * about React. Until the art loads, or if it cannot, the stand-ins are plain coloured discs.
 */

/** The stage's logical size in board pixels: wide enough for a clear gap between the stand-ins. */
export const STAGE_WIDTH = 360;
export const STAGE_HEIGHT = 200;
export const STAGE_CELL = 40;
/** Nearly fills its grid square, like a medium token on the board, so the art reads at a glance. */
export const STAGE_TOKEN_RADIUS = 19;
/** The preview never magnifies past this, so the stand-ins stay token-sized on a large screen. */
const MAX_SCALE = 2;
/** Each side's colour: the disc before the art loads, then the portrait's rim. */
const SIDE_COLOR = { attacker: 0x3b82f6, target: 0xef4444 } as const;
export type StageSide = keyof typeof SIDE_COLOR;
/** How far the map reaches past the stage on every side, so a screen shake never shows its edge. */
const BACKDROP_BLEED = 16;
/** The app's small-caps label face (index.html loads it), so the name tags match the panels. */
const LABEL_FACE = "Alegreya Sans SC";
const LABEL_STYLE = { fontFamily: `"${LABEL_FACE}", "Alegreya Sans", system-ui, sans-serif`, fontWeight: "700", fontSize: 10, fill: 0xe6e8eb } as const;
/** The name tags draw small and are magnified with the stage, so their text is drawn finer. */
const LABEL_RESOLUTION = 4;
const LABEL_TEXT = { attacker: "Attacker", target: "Target" } as const;

const STAGE_ART_URLS = {
  arena: "/img/preview/arena.webp",
  attacker: "/img/preview/attacker.webp",
  target: "/img/preview/target.webp",
} as const;

/** The stage's pictures: the courtyard map and one portrait per side. */
export type StageArt = Record<keyof typeof STAGE_ART_URLS, Texture>;

let stageArt: Promise<StageArt | null> | null = null;

/** Mipmapped, so the map and portraits stay smooth when drawn far smaller, as on a library card. */
const loadSmooth = (src: string) => Assets.load<Texture>({ src, data: { autoGenerateMipmaps: true } });

/** Loads the stage art once for every stage. Null when a picture fails; the next call tries again. */
export function loadStageArt(): Promise<StageArt | null> {
  stageArt ??= Promise.all([
    loadSmooth(STAGE_ART_URLS.arena),
    loadSmooth(STAGE_ART_URLS.attacker),
    loadSmooth(STAGE_ART_URLS.target),
  ]).then(
    ([arena, attacker, target]) => ({ arena, attacker, target }),
    () => {
      stageArt = null;
      return null;
    },
  );
  return stageArt;
}

let labelFont: Promise<void> | null = null;

/**
 * Waits for the name tags' face: a canvas draws text in whatever font has loaded, and never
 * redraws on its own when a better one arrives. Resolves either way.
 */
export function loadStageFont(): Promise<void> {
  labelFont ??= "fonts" in document
    ? document.fonts.load(`700 12px "${LABEL_FACE}"`).then(() => undefined, () => undefined)
    : Promise.resolve();
  return labelFont;
}

/** A faint grid over `width` x `height` board pixels, with a square centred on the stage's middle. */
export function drawStageGrid(width: number, height: number, alpha = 0.08): Graphics {
  const g = new Graphics();
  for (let x = (width / 2 + STAGE_CELL / 2) % STAGE_CELL; x <= width; x += STAGE_CELL) g.moveTo(x, 0).lineTo(x, height);
  for (let y = (height / 2 + STAGE_CELL / 2) % STAGE_CELL; y <= height; y += STAGE_CELL) g.moveTo(0, y).lineTo(width, y);
  g.stroke({ width: 1, color: 0xffffff, alpha });
  return g;
}

/** A stand-in token centred on the origin. */
export function drawStageToken(color: number): Graphics {
  const g = new Graphics();
  g.circle(0, 0, STAGE_TOKEN_RADIUS).fill({ color }).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
  g.circle(0, -4, 4).fill({ color: 0xffffff, alpha: 0.8 });
  g.ellipse(0, 7, 8, 5).fill({ color: 0xffffff, alpha: 0.65 });
  return g;
}

/**
 * A portrait stand-in centred on the origin, drawn like a token on the board: the picture covers
 * the token circle. A hairline rim in the side's colour, just inside the edge, keeps attacker and
 * target apart without hiding the art; a tight shadow to the lower right lifts it off the map and
 * stays inside its grid square.
 */
export function drawStagePortrait(texture: Texture, rim: number): Container {
  const r = STAGE_TOKEN_RADIUS;
  const token = new Container();
  const shadow = new Graphics().circle(0.5, 0.9, r).fill({ color: 0x000000, alpha: 0.5 });
  const picture = new Sprite(texture);
  picture.anchor.set(0.5);
  picture.scale.set((r * 2) / Math.min(texture.width, texture.height));
  const mask = new Graphics().circle(0, 0, r).fill({ color: 0xffffff });
  picture.mask = mask;
  const ring = new Graphics().circle(0, 0, r - 0.5).stroke({ width: 1, color: rim });
  token.addChild(shadow, picture, mask, ring);
  return token;
}

/** One side's stand-in: its portrait when the art is in, otherwise its coloured disc. */
export function drawStandIn(side: StageSide, art: StageArt | null): Container {
  return art ? drawStagePortrait(art[side], SIDE_COLOR[side]) : drawStageToken(SIDE_COLOR[side]);
}

/**
 * A side's name tag, its top centre on the origin: small caps on a dark pill with a hairline in
 * the side's colour. It is never wider than a grid square, so it sits in the square below its token.
 */
export function drawStageLabel(side: StageSide): Container {
  const tag = new Container();
  const style = new TextStyle(LABEL_STYLE);
  const text = new Text({ text: LABEL_TEXT[side], resolution: LABEL_RESOLUTION, style });
  text.anchor.set(0.5, 0);
  // Both tags shrink by the same amount, to fit the longer name, so their type matches.
  const widest = Math.max(...Object.values(LABEL_TEXT).map((name) => CanvasTextMetrics.measureText(name, style).width));
  text.scale.set(Math.min(1, (STAGE_CELL - 8) / widest));
  const w = text.width + 6;
  const h = text.height + 1;
  text.position.set(0, 0.5);
  const plate = new Graphics()
    .roundRect(-w / 2, 0, w, h, h / 2)
    .fill({ color: 0x0b0d10, alpha: 0.72 })
    .stroke({ width: 0.75, color: SIDE_COLOR[side], alpha: 0.6 });
  tag.addChild(plate, text);
  return tag;
}

let vignette: Texture | null = null;

/** A radial shade, clear in the middle and dark at the rim; null where a canvas cannot draw. */
function vignetteTexture(): Texture | null {
  if (vignette) return vignette;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const shade = ctx.createRadialGradient(128, 128, 48, 128, 128, 182);
  shade.addColorStop(0, "rgba(9, 11, 14, 0.12)");
  shade.addColorStop(1, "rgba(9, 11, 14, 0.72)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 256, 256);
  vignette = Texture.from(canvas);
  return vignette;
}

/**
 * The courtyard map covering `width` x `height` board pixels, centred and cropped like a CSS
 * cover, with a vignette that keeps the middle (where effects travel) the brightest part.
 */
export function drawStageBackdrop(map: Texture, width: number, height: number): Container {
  const backdrop = new Container();
  const w = width + BACKDROP_BLEED * 2;
  const h = height + BACKDROP_BLEED * 2;
  const picture = new Sprite(map);
  picture.anchor.set(0.5);
  picture.scale.set(Math.max(w / map.width, h / map.height));
  picture.position.set(width / 2, height / 2);
  backdrop.addChild(picture);
  const shade = vignetteTexture();
  if (shade) {
    const overlay = new Sprite(shade);
    overlay.position.set(-BACKDROP_BLEED, -BACKDROP_BLEED);
    overlay.setSize(w, h);
    backdrop.addChild(overlay);
  }
  return backdrop;
}

/**
 * Where the stand-ins sit on a stage of this logical size: each in the middle of a grid square
 * (see `drawStageGrid`), level with the stage's centre and the same number of squares either side.
 */
export function standInPositions(width: number, height: number): { attacker: { x: number; y: number }; target: { x: number; y: number } } {
  const squares = Math.max(1, Math.round((width * 0.28) / STAGE_CELL));
  const x = squares * STAGE_CELL;
  return { attacker: { x: width / 2 - x, y: height / 2 }, target: { x: width / 2 + x, y: height / 2 } };
}

export class AnimationPreview {
  private app = new Application();
  private world = new Container();
  /** The world's untransformed parent: screen-wide filters go here, never on the root stage. */
  private screenLayer = new Container();
  private screenFxLayer = new Container();
  private fxLayer = new Container();
  /** The map (once loaded) and the grid, redrawn to the stage's size. */
  private groundLayer = new Container();
  private attacker = new Container();
  private target = new Container();
  private attackerTag = new Container();
  private targetTag = new Container();
  private art: StageArt | null = null;
  private observer: ResizeObserver | null = null;
  private run: RunningFx | null = null;
  private frame = 0;
  private finishTimer = 0;
  private stopSettingsWatch: (() => void) | null = null;
  private started = -1;
  private lastFrame = -Infinity;
  private ready = false;
  private destroyed = false;
  private size = { width: STAGE_WIDTH, height: STAGE_HEIGHT };

  constructor(private host: HTMLElement) {}

  /** Resolves false when the browser cannot create a WebGL context (the stage stays empty). */
  async init(): Promise<boolean> {
    const box = this.hostSize();
    // Fetched while the renderer starts, so cached art and type are in place for the first frame.
    const art = Promise.all([loadStageArt(), loadStageFont()]);
    try {
      await this.app.init({
        width: box.width,
        height: box.height,
        background: "#14171b",
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, graphicsBudget().resolution),
        autoStart: false,
      });
    } catch {
      return false;
    }
    // Torn down while the renderer was starting.
    if (this.destroyed) {
      this.app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
      return false;
    }
    this.app.canvas.style.display = "block";
    this.host.appendChild(this.app.canvas);
    this.world.addChild(this.groundLayer, this.attacker, this.target, this.attackerTag, this.targetTag, this.fxLayer);
    this.screenLayer.addChild(this.world);
    this.app.stage.addChild(this.screenLayer, this.screenFxLayer);
    this.ready = true;
    this.stopSettingsWatch = subscribeGraphicsSettings(() => {
      this.stop();
      this.app.renderer.resize(this.size.width, this.size.height, Math.min(window.devicePixelRatio || 1, graphicsBudget().resolution));
      this.app.render();
    });
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.layout(box.width, box.height);
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(() => this.fit());
      this.observer.observe(this.host);
    }
    void art.then(([loaded]) => this.useArt(loaded));
    return true;
  }

  /**
   * Once the art and the tags' font are in: lays the map under the grid, swaps the discs for
   * portraits and redraws the tags in their face. Without the art only the tags change.
   */
  private useArt(art: StageArt | null) {
    if (!this.ready || this.destroyed) return;
    this.art = art;
    this.layout(this.size.width, this.size.height);
  }

  private hostSize(): { width: number; height: number } {
    return {
      width: Math.max(160, Math.round(this.host.clientWidth || STAGE_WIDTH)),
      height: Math.max(120, Math.round(this.host.clientHeight || STAGE_HEIGHT)),
    };
  }

  /** Follows the container: the canvas is resized and the world re-laid out. A play in progress carries on. */
  private fit() {
    if (!this.ready || this.destroyed) return;
    const { width, height } = this.hostSize();
    if (width === this.size.width && height === this.size.height) return;
    this.layout(width, height);
  }

  private layout(width: number, height: number) {
    this.app.renderer.resize(width, height);
    const scale = Math.min(width / STAGE_WIDTH, MAX_SCALE);
    this.size = { width, height };
    this.world.scale.set(scale);
    const lw = width / scale;
    const lh = height / scale;
    for (const child of this.groundLayer.removeChildren()) child.destroy({ children: true });
    if (this.art) this.groundLayer.addChild(drawStageBackdrop(this.art.arena, lw, lh));
    // Over the map the grid only needs to hint at scale; the flagstones already read as squares.
    this.groundLayer.addChild(drawStageGrid(lw, lh, this.art ? 0.055 : 0.08));
    for (const child of this.attacker.removeChildren()) child.destroy({ children: true });
    for (const child of this.target.removeChildren()) child.destroy({ children: true });
    for (const child of this.attackerTag.removeChildren()) child.destroy({ children: true });
    for (const child of this.targetTag.removeChildren()) child.destroy({ children: true });
    this.attacker.addChild(drawStandIn("attacker", this.art));
    this.target.addChild(drawStandIn("target", this.art));
    this.attackerTag.addChild(drawStageLabel("attacker"));
    this.targetTag.addChild(drawStageLabel("target"));
    const { attacker, target } = standInPositions(lw, lh);
    this.attacker.position.set(attacker.x, attacker.y);
    this.target.position.set(target.x, target.y);
    // In the square below each token, just under its top edge.
    this.attackerTag.position.set(attacker.x, attacker.y + STAGE_CELL / 2 + 3);
    this.targetTag.position.set(target.x, target.y + STAGE_CELL / 2 + 3);
    this.app.render();
  }

  /** Plays `def` from the attacker onto the target; a play in progress is cut short first. */
  /** The editor always plays the whole animation: reduced animations never applies while making one. */
  play(def: AnimationDef) {
    if (!this.ready || this.destroyed) return;
    this.stop();
    const { width, height } = this.size;
    const scale = this.world.scale.x;
    const lw = width / scale;
    const lh = height / scale;
    const { attacker, target } = standInPositions(lw, lh);
    const host: FxHost = {
      layer: this.fxLayer,
      shakeTarget: this.world,
      filterTarget: this.screenLayer,
      screen: { width, height },
      reducedMotion: false,
    };
    this.run =
      def.shape === "nuke"
        ? playNuke({ ...host, layer: this.screenFxLayer }, { def, origin: { x: width / 2, y: height / 2 }, unit: STAGE_CELL, extent: Math.hypot(width, height) / 2 })
        : playStrike(host, { def, from: attacker, to: target, radius: STAGE_TOKEN_RADIUS });
    if (this.run.animated === false && this.run.duration !== undefined) {
      this.run.update(0);
      this.app.render();
      this.finishTimer = window.setTimeout(() => this.stop(), this.run.duration * 1000);
      return;
    }
    this.started = -1;
    this.lastFrame = -Infinity;
    this.frame = requestAnimationFrame(this.step);
  }

  private step = (now: number) => {
    const run = this.run;
    if (!run || this.destroyed) return;
    if (this.started < 0) this.started = now;
    if (now - this.lastFrame < graphicsBudget().frameMs - 1) {
      this.frame = requestAnimationFrame(this.step);
      return;
    }
    this.lastFrame = now;
    const alive = run.update((now - this.started) / 1000);
    if (!alive) {
      this.stop();
      return;
    }
    this.app.render();
    this.frame = requestAnimationFrame(this.step);
  };

  private onVisibilityChange = () => { if (document.visibilityState === "hidden") this.stop(); };

  /** Ends the playing effect: every filter and display object it made is removed. */
  stop() {
    window.clearTimeout(this.finishTimer);
    this.finishTimer = 0;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.run) {
      this.run.destroy();
      this.run = null;
      if (this.ready && !this.destroyed) this.app.render();
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    this.stopSettingsWatch?.();
    this.observer?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    if (this.ready) this.app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true });
  }
}
