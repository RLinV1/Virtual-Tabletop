import { BlurFilter, Container, Graphics, Rectangle, type Filter } from "pixi.js";
import { ShockwaveFilter } from "pixi-filters";
import type { AnimationDef, Point } from "@vtt/shared";
import { withDefaults, type ResolvedAnimation } from "./effectPresets";
import { WHITE, burst, clamp01, drawSparks, easeIn, easeOut, hex, mix, ring, stepSparks, type Spark } from "./fxKit";
import { STRIKE_SHAPES, type StrikeCtx, type StrikeShape } from "./fxStrikes";

/**
 * The one renderer for every `AnimationDef` (ADR 0038): the board and the library editor's preview
 * both play through here. Pure Pixi: it knows nothing of `BoardView`, rooms or React, only a
 * `FxHost` (where to draw, what to shake, what to filter). Everything is drawn in board
 * coordinates, scaled by the animation's `size` and the token radius, and never touches a token.
 * Each running effect owns display objects and filters; `destroy()` removes every one of them.
 */

export interface FxHost {
  /** Effects are added here, in board coordinates (the world's FX layer). */
  layer: Container;
  /** Moved by screen shake and put back exactly afterwards (the world container). */
  shakeTarget: Container;
  /**
   * Gets the nuke's shockwave filter. Its own transform must be the identity (the stage), so the
   * filter area is the screen and the shockwave centre is in screen pixels.
   */
  filterTarget: Container;
  /** The visible area, in `filterTarget` pixels. */
  screen: { width: number; height: number };
  /** Reduced motion: a static marker or tint, no travel, shake or shockwave. */
  reducedMotion: boolean;
}

/** A playing effect. `update` takes seconds since it started and returns false once it is over. */
export interface RunningFx {
  update(elapsed: number): boolean;
  /** Removes every filter and destroys every display object. Safe to call twice. */
  destroy(): void;
}

export interface StrikeFxParams {
  def: AnimationDef;
  from: Point;
  to: Point;
  /** The target token's radius, in board pixels. */
  radius: number;
}

export interface NukeFxParams {
  def: AnimationDef;
  origin: Point;
  /** One grid cell, in board pixels. */
  unit: number;
  /** How far the blast must reach to cross the whole map, in board pixels. */
  extent: number;
}

/** Seconds a reduced-motion marker stays. */
export const REDUCED_FX_S = 0.6;

/** Particle ceiling per effect, whatever the definition asks for. */
const MAX_PARTICLES = 120;

// ---------- screen shake ----------

interface ShakeState {
  base: Point;
  shown: Point;
  sources: Map<object, Point>;
}
const shakes = new WeakMap<Container, ShakeState>();

/**
 * Offsets `target` by the sum of every source's offset; a null offset drops the source. When the last
 * source goes, the target is set back to its base position exactly. A pan or zoom that moves the
 * target while it shakes is kept: the base follows it.
 */
function setShake(target: Container, key: object, offset: Point | null) {
  if (target.destroyed) return;
  let state = shakes.get(target);
  if (!state) {
    if (!offset) return;
    state = { base: { x: target.position.x, y: target.position.y }, shown: { x: target.position.x, y: target.position.y }, sources: new Map() };
    shakes.set(target, state);
  }
  state.base.x += target.position.x - state.shown.x;
  state.base.y += target.position.y - state.shown.y;
  if (offset) state.sources.set(key, offset);
  else state.sources.delete(key);
  let ox = 0;
  let oy = 0;
  for (const o of state.sources.values()) {
    ox += o.x;
    oy += o.y;
  }
  if (state.sources.size === 0) {
    target.position.set(state.base.x, state.base.y);
    shakes.delete(target);
    return;
  }
  state.shown = { x: state.base.x + ox, y: state.base.y + oy };
  target.position.set(state.shown.x, state.shown.y);
}

/** The display objects and filters one effect owns, so ending it can remove them all. */
interface FxScene {
  root: Container;
  /** Drawn additively, with a blurred copy underneath for glow. */
  g: Graphics;
  /** Drawn plainly, over `g`. */
  top: Graphics;
  dispose(): void;
}

function makeScene(host: FxHost, def: Pick<AnimationDef, "glow">, bloomed: boolean): FxScene {
  const root = new Container();
  root.eventMode = "none";
  const glowLayer = new Container();
  const g = new Graphics();
  g.blendMode = "add";
  const top = new Graphics();
  // Glow: a blurred, additive copy of `g` drawn under it. It shares `g`'s geometry, so every frame
  // drawn into `g` glows too. A blur of transparent pixels stays transparent, so unlike a bloom
  // filter it never leaves a grey box around the effect.
  let blur: BlurFilter | null = null;
  let halo: Graphics | null = null;
  if (bloomed && def.glow > 0.05) {
    halo = new Graphics(g.context);
    halo.blendMode = "add";
    halo.alpha = 0.5 + def.glow * 0.5;
    blur = new BlurFilter({ strength: 4 + def.glow * 10, quality: 3 });
    halo.filters = [blur];
    glowLayer.addChild(halo);
  }
  glowLayer.addChild(g);
  root.addChild(glowLayer, top);
  host.layer.addChild(root);
  let disposed = false;
  return {
    root, g, top,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (halo) halo.filters = null;
      blur?.destroy();
      // The halo borrows `g`'s context, so only `g` (its owner) destroys it.
      root.destroy({ children: true });
    },
  };
}

// ---------- strikes ----------

/** Plays any strike shape from `from` onto `to`. A nuke shape is drawn as a projectile. */
export function playStrike(host: FxHost, params: StrikeFxParams): RunningFx {
  const { from, to } = params;
  const def = withDefaults(params.def);
  const primary = hex(def.primary);
  const secondary = hex(def.secondary);
  const reduced = host.reducedMotion;
  const r = Math.max(8, params.radius) * def.size;
  const scene = makeScene(host, def, !reduced);
  const { g, top } = scene;
  const key = {};

  if (reduced) {
    // A still ring on the target, no travel and no shake.
    g.circle(to.x, to.y, r * 1.1).stroke({ width: Math.max(3, r * 0.12), color: primary, alpha: 0.9 });
    return {
      update: (elapsed) => elapsed < REDUCED_FX_S,
      destroy: scene.dispose,
    };
  }

  const duration = def.duration;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const dir = dist > 0 ? { x: dx / dist, y: dy / dist } : { x: 1, y: 0 };
  const normal = { x: -dir.y, y: dir.x };
  const sparkCount = Math.min(def.particles, MAX_PARTICLES);
  const sparks: Spark[] = [];
  const accent = def.accent ? hex(def.accent) : mix(primary, WHITE, 0.6);
  const palette = [primary, secondary, accent];
  const shape: StrikeShape = def.shape === "nuke" ? "projectile" : def.shape;
  const spec = STRIKE_SHAPES[shape];
  const landAt = spec.land * duration;
  const impactLen = Math.max(0.1, duration - landAt);
  const spinRate = 3 + def.spin * 25;
  const gravity = def.gravity * r * 5;

  const c: StrikeCtx = {
    d: def, g, top, from, to, dir, normal, dist, r,
    side: Math.random() < 0.5 ? -1 : 1,
    D: duration, L: landAt, impactLen,
    primary, secondary, accent, palette,
    n: def.count, spread: def.spread, arc: def.arc, trail: def.trail, spin: def.spin, spinRate, G: gravity,
    sparks, sparkCount, landed: false,
    along: (u, off = 0) => ({ x: from.x + dx * u + normal.x * off, y: from.y + dy * u + normal.y * off }),
    emit(at, count, speed, life = 0.6) {
      if (sparkCount > 0) burst(sparks, at, count, speed, Math.max(1.5, r * 0.05), palette, life, gravity, spinRate * 0.3);
    },
  };
  const drawing = spec.make(c);
  let last = 0;

  /** Flash, disc and rings at the target; `k` runs 0 -> 1 across the impact phase. */
  const drawImpact = (k: number) => {
    const e = easeOut(k);
    const fade = 1 - k;
    const big = spec.big;
    const full = spec.impact === "full";
    if (def.flash > 0) {
      const flash = full ? { size: r * (1 + e) * big, alpha: def.flash * 0.8 * fade * fade } : { size: r * (0.8 + e * 0.6), alpha: def.flash * 0.6 * fade * fade };
      top.circle(to.x, to.y, flash.size).fill({ color: WHITE, alpha: flash.alpha });
    }
    if (full) g.circle(to.x, to.y, r * (0.6 + e * 0.8) * big).fill({ color: primary, alpha: fade * 0.5 });
    const ringColors = [secondary, WHITE, accent];
    for (let i = 0; i < def.rings; i++) {
      const kk = clamp01((k - i * 0.1) / (1 - i * 0.1));
      ring(g, to, r * (0.3 + easeOut(kk) * 1.5) * big * (full ? 1 : 0.8) * (1 + i * 0.2), Math.max(2, r * 0.14 * (1 - kk)), ringColors[i % 3]!, (1 - kk) * (0.95 - i * 0.08));
    }
  };

  return {
    update(elapsed) {
      if (elapsed >= duration) return false;
      const dt = Math.max(0, elapsed - last);
      last = elapsed;
      g.clear();
      top.clear();
      if (!c.landed && elapsed >= landAt) {
        c.landed = true;
        if (sparkCount > 0) burst(sparks, to, sparkCount, r * 4 * spec.big, Math.max(1.5, r * 0.06), palette, 0.9, gravity, spinRate * 0.3);
      }
      drawing.draw(elapsed);
      if (c.landed) {
        const k = clamp01((elapsed - landAt) / impactLen);
        if (spec.impact !== "none") drawImpact(k);
        drawing.after?.(k, elapsed);
      }
      stepSparks(sparks, dt);
      drawSparks(g, sparks, def.particleShape);
      if (c.landed && def.shake > 0) {
        const k = clamp01((elapsed - landAt) / Math.min(impactLen, 0.35));
        const amp = def.shake * 9 * (1 - k);
        setShake(host.shakeTarget, key, k >= 1 ? null : { x: Math.sin(elapsed * 95) * amp, y: Math.cos(elapsed * 83) * amp });
      }
      return true;
    },
    destroy() {
      setShake(host.shakeTarget, key, null);
      scene.dispose();
    },
  };
}

// ---------- nuke ----------

/** Plays the map-wide blast: flash, shockwave, fireball, sparks, embers and screen shake. */
export function playNuke(host: FxHost, params: NukeFxParams): RunningFx {
  const { origin, unit, extent } = params;
  const def: ResolvedAnimation = withDefaults(params.def);
  const primary = hex(def.primary);
  const secondary = hex(def.secondary);
  const reduced = host.reducedMotion;
  const key = {};

  if (reduced) {
    // A brief static tint over the map, no shockwave or shake.
    const scene = makeScene(host, def, false);
    scene.top.rect(origin.x - extent * 2, origin.y - extent * 2, extent * 4, extent * 4).fill({ color: primary, alpha: 0.25 });
    return { update: (elapsed) => elapsed < REDUCED_FX_S + 0.2, destroy: scene.dispose };
  }

  const scene = makeScene(host, def, true);
  const { g, top } = scene;
  const duration = def.duration;
  const R = Math.max(unit, 24) * 2.5 * def.size;
  const sparkCount = Math.min(def.particles, MAX_PARTICLES);
  const sparks: Spark[] = [];
  const palette = [primary, secondary, def.accent ? hex(def.accent) : mix(primary, WHITE, 0.6), WHITE];
  burst(sparks, origin, sparkCount, extent * 0.55 / Math.max(1, duration), Math.max(2, unit * 0.07), palette, duration * 0.8, def.gravity * unit * 10, 2 + def.spin * 8);
  const emberCount = Math.min(36, 8 + Math.floor(sparkCount / 4));
  const embers = Array.from({ length: emberCount }, (_, i) => ({
    angle: (i / emberCount) * Math.PI * 2 + Math.random() * 0.2,
    speed: 0.8 + Math.random() * 0.5,
    rise: Math.random() * unit * 0.6,
  }));

  const waveEnd = duration * 0.85;
  const wave = new ShockwaveFilter({
    center: { x: 0, y: 0 },
    speed: Math.hypot(host.screen.width, host.screen.height) / (duration * 0.8),
    amplitude: 12 + def.shake * 30,
    wavelength: 160,
    brightness: 1 + def.flash * 0.25,
    radius: -1,
    time: 0,
  });
  const target = host.filterTarget;
  const previousFilters: Filter[] = [...(target.filters ?? [])] as Filter[];
  const previousArea = target.filterArea;
  target.filterArea = new Rectangle(0, 0, host.screen.width, host.screen.height);
  target.filters = [...previousFilters, wave];
  let waveOn = true;
  const dropWave = () => {
    if (!waveOn) return;
    waveOn = false;
    target.filters = previousFilters.length > 0 ? previousFilters : null;
    target.filterArea = previousArea;
    wave.destroy();
  };

  let last = 0;
  return {
    update(elapsed) {
      if (elapsed >= duration) return false;
      const dt = Math.max(0, elapsed - last);
      last = elapsed;
      g.clear();
      top.clear();

      if (waveOn) {
        if (elapsed > waveEnd) dropWave();
        else {
          const screen = host.layer.toGlobal(origin);
          const centre = target.toLocal(screen);
          wave.centerX = centre.x;
          wave.centerY = centre.y;
          wave.time = elapsed;
        }
      }

      // White flash: sudden, gone within a quarter of the blast.
      const flashAlpha = def.flash * (1 - clamp01(elapsed / (0.22 * duration))) ** 2;
      if (flashAlpha > 0.01) top.rect(origin.x - extent * 3, origin.y - extent * 3, extent * 6, extent * 6).fill({ color: WHITE, alpha: flashAlpha });

      // Fireball: swells fast, then cools and fades.
      const swell = easeOut(clamp01(elapsed / (0.45 * duration)));
      const fade = 1 - easeIn(clamp01((elapsed - 0.3 * duration) / (0.7 * duration)));
      // The firestorm: a wall of fire that rolls out over the whole map, then burns down to a scorch.
      const storm = easeOut(clamp01(elapsed / (0.5 * duration)));
      const burn = 1 - easeIn(clamp01((elapsed - 0.35 * duration) / (0.65 * duration)));
      g.circle(origin.x, origin.y, extent * 1.1 * storm).fill({ color: secondary, alpha: 0.32 * burn });
      g.circle(origin.x, origin.y, extent * 0.85 * storm).fill({ color: primary, alpha: 0.38 * burn });
      g.circle(origin.x, origin.y, extent * 0.5 * storm).fill({ color: mix(primary, WHITE, 0.45), alpha: 0.4 * burn });
      g.circle(origin.x, origin.y, R * 1.5 * swell).fill({ color: secondary, alpha: 0.28 * fade });
      g.circle(origin.x, origin.y, R * 1.05 * swell).fill({ color: primary, alpha: 0.55 * fade });
      g.circle(origin.x, origin.y, R * 0.6 * swell).fill({ color: mix(primary, WHITE, 0.6), alpha: 0.8 * fade });
      g.circle(origin.x, origin.y, R * 0.28 * swell).fill({ color: WHITE, alpha: fade });

      // Expanding blast rings across the map.
      for (let i = 0; i < def.rings; i++) {
        const k = clamp01((elapsed - i * 0.07 * duration) / (0.75 * duration));
        if (k <= 0) continue;
        ring(g, origin, R * 0.5 + easeOut(k) * extent * 1.15, Math.max(3, unit * Math.max(0.06, 0.28 - i * 0.07) * (1 - k)), [WHITE, primary, secondary][i % 3]!, (1 - k) * 0.9);
      }

      // Ember ring riding the main wave, embers drifting up as they cool.
      const ringK = clamp01(elapsed / (0.8 * duration));
      const ringR = R * 0.6 + easeOut(ringK) * extent * 0.95;
      for (const e of embers) {
        const rad = ringR * e.speed;
        const flicker = 0.6 + 0.4 * Math.sin(elapsed * 30 + e.angle * 9);
        const x = origin.x + Math.cos(e.angle) * rad;
        const y = origin.y + Math.sin(e.angle) * rad - e.rise * ringK * 3;
        const a = (1 - ringK) * flicker;
        g.circle(x, y, Math.max(2, unit * 0.1) * 2.5).fill({ color: secondary, alpha: a * 0.3 });
        g.circle(x, y, Math.max(2, unit * 0.1)).fill({ color: mix(primary, WHITE, 0.4), alpha: a });
      }

      stepSparks(sparks, dt);
      drawSparks(g, sparks, def.particleShape);

      if (def.shake > 0) {
        const k = clamp01(elapsed / (0.5 * duration));
        const amp = def.shake * 28 * (1 - k) ** 2;
        setShake(host.shakeTarget, key, k >= 1 ? null : { x: Math.sin(elapsed * 97) * amp, y: Math.cos(elapsed * 89) * amp });
      }
      return true;
    },
    destroy() {
      dropWave();
      setShake(host.shakeTarget, key, null);
      scene.dispose();
    },
  };
}
