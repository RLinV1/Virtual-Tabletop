import { Application, Container, Graphics } from "pixi.js";
import type { AnimationDef } from "@vtt/shared";
import { playNuke, playStrike, type FxHost, type RunningFx } from "./fx";

/**
 * The library editor's preview stage (ADR 0038): a small Pixi application with a dark grid and a
 * stand-in attacker and target. It plays an `AnimationDef` through the same renderer as the board
 * (`fx.ts`), so what the GM sees is what the table sees. It is not connected to any room and
 * changes no data. React mounts it through a thin component; nothing here knows about React.
 */

const WIDTH = 360;
const HEIGHT = 200;
const CELL = 40;
const TOKEN_RADIUS = 16;
const ATTACKER = { x: 80, y: 100 };
const TARGET = { x: 280, y: 100 };

export class AnimationPreview {
  private app = new Application();
  private world = new Container();
  private fxLayer = new Container();
  private run: RunningFx | null = null;
  private frame = 0;
  private started = -1;
  private ready = false;
  private destroyed = false;

  constructor(private host: HTMLElement) {}

  /** Resolves false when the browser cannot create a WebGL context (the stage stays empty). */
  async init(): Promise<boolean> {
    try {
      await this.app.init({
        width: WIDTH,
        height: HEIGHT,
        background: "#14171b",
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
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
    this.app.canvas.style.width = "100%";
    this.app.canvas.style.maxWidth = `${WIDTH}px`;
    this.app.canvas.style.height = "auto";
    this.host.appendChild(this.app.canvas);
    this.world.addChild(this.drawStage(), this.drawToken(ATTACKER, 0x3b82f6), this.drawToken(TARGET, 0xef4444), this.fxLayer);
    this.app.stage.addChild(this.world);
    this.ready = true;
    this.app.render();
    return true;
  }

  private drawStage(): Graphics {
    const g = new Graphics();
    for (let x = 0; x <= WIDTH; x += CELL) g.moveTo(x, 0).lineTo(x, HEIGHT);
    for (let y = 0; y <= HEIGHT; y += CELL) g.moveTo(0, y).lineTo(WIDTH, y);
    g.stroke({ width: 1, color: 0xffffff, alpha: 0.08 });
    return g;
  }

  private drawToken(at: { x: number; y: number }, color: number): Graphics {
    const g = new Graphics();
    g.circle(at.x, at.y, TOKEN_RADIUS).fill({ color }).stroke({ width: 2, color: 0xffffff, alpha: 0.6 });
    return g;
  }

  /** Plays `def` from the attacker onto the target; a play in progress is cut short first. */
  play(def: AnimationDef, reducedMotion: boolean) {
    if (!this.ready || this.destroyed) return;
    this.stop();
    const host: FxHost = {
      layer: this.fxLayer,
      shakeTarget: this.world,
      filterTarget: this.app.stage,
      screen: { width: WIDTH, height: HEIGHT },
      reducedMotion,
    };
    this.run =
      def.shape === "nuke"
        ? playNuke(host, { def, origin: TARGET, unit: CELL, extent: WIDTH })
        : playStrike(host, { def, from: ATTACKER, to: TARGET, radius: TOKEN_RADIUS });
    this.started = -1;
    this.frame = requestAnimationFrame(this.step);
  }

  private step = (now: number) => {
    const run = this.run;
    if (!run || this.destroyed) return;
    if (this.started < 0) this.started = now;
    const alive = run.update((now - this.started) / 1000);
    if (!alive) {
      this.stop();
      return;
    }
    this.app.render();
    this.frame = requestAnimationFrame(this.step);
  };

  /** Ends the playing effect: every filter and display object it made is removed. */
  stop() {
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
    if (this.ready) this.app.destroy(true, { children: true });
  }
}
