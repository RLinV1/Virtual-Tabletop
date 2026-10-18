import { Application, Container, Graphics, Text } from "pixi.js";
import { graphicsBudget, subscribeGraphicsSettings } from "../ui/clientSettings";
import type { AnimationDef } from "@vtt/shared";
import { playNuke, playStrike, type FxHost, type RunningFx } from "./fx";

/**
 * The library editor's preview stage (ADR 0038): a small Pixi application with a dark grid and a
 * stand-in attacker and target. It plays an `AnimationDef` through the same renderer as the board
 * (`fx.ts`), so what the GM sees is what the table sees. It is not connected to any room and
 * changes no data. React mounts it through a thin component; nothing here knows about React.
 */

/** The stage's logical size in board pixels: wide enough for a clear gap between the stand-ins. */
export const STAGE_WIDTH = 360;
export const STAGE_HEIGHT = 200;
export const STAGE_CELL = 40;
export const STAGE_TOKEN_RADIUS = 16;
/** The preview never magnifies past this, so the stand-ins stay token-sized on a large screen. */
const MAX_SCALE = 2;

/** A faint grid over `width` x `height` board pixels. */
export function drawStageGrid(width: number, height: number): Graphics {
  const g = new Graphics();
  for (let x = 0; x <= width; x += STAGE_CELL) g.moveTo(x, 0).lineTo(x, height);
  for (let y = 0; y <= height; y += STAGE_CELL) g.moveTo(0, y).lineTo(width, y);
  g.stroke({ width: 1, color: 0xffffff, alpha: 0.08 });
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

/** Where the stand-ins sit on a stage of this logical size. */
export function standInPositions(width: number, height: number): { attacker: { x: number; y: number }; target: { x: number; y: number } } {
  return { attacker: { x: width * 0.22, y: height / 2 }, target: { x: width * 0.78, y: height / 2 } };
}

export class AnimationPreview {
  private app = new Application();
  private world = new Container();
  /** The world's untransformed parent: screen-wide filters go here, never on the root stage. */
  private screenLayer = new Container();
  private screenFxLayer = new Container();
  private fxLayer = new Container();
  private gridLayer = new Container();
  private attacker = drawStageToken(0x3b82f6);
  private target = drawStageToken(0xef4444);
  private attackerLabel = new Text({ text: "Attacker", resolution: 2, style: { fontFamily: "Geist Sans, sans-serif", fontSize: 11, fill: 0xc5cbd2 } });
  private targetLabel = new Text({ text: "Target", resolution: 2, style: { fontFamily: "Geist Sans, sans-serif", fontSize: 11, fill: 0xc5cbd2 } });
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
      this.app.destroy(true, { children: true });
      return false;
    }
    this.app.canvas.style.display = "block";
    this.host.appendChild(this.app.canvas);
    this.attackerLabel.anchor.set(0.5, 0);
    this.targetLabel.anchor.set(0.5, 0);
    this.world.addChild(this.gridLayer, this.attacker, this.target, this.attackerLabel, this.targetLabel, this.fxLayer);
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
    return true;
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
    const old = this.gridLayer.removeChildren();
    for (const child of old) child.destroy();
    this.gridLayer.addChild(drawStageGrid(lw, lh));
    const { attacker, target } = standInPositions(lw, lh);
    this.attacker.position.set(attacker.x, attacker.y);
    this.target.position.set(target.x, target.y);
    this.attackerLabel.position.set(attacker.x, attacker.y + STAGE_TOKEN_RADIUS + 10);
    this.targetLabel.position.set(target.x, target.y + STAGE_TOKEN_RADIUS + 10);
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
    if (this.ready) this.app.destroy(true, { children: true });
  }
}
