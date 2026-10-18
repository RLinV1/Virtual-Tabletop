import { BlurFilter, Container, Graphics, Rectangle, type Filter } from "pixi.js";
import { ShockwaveFilter } from "pixi-filters";
import type { AnimationDef, AnimationShape, Point } from "@vtt/shared";

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

type StrikeShape = Exclude<AnimationShape, "nuke">;
/** When each strike shape lands on the target, as a share of its duration. */
const LAND_AT: Record<StrikeShape, number> = { slash: 0.3, claw: 0.3, beam: 0.25, projectile: 0.55, fireball: 0.5, meteor: 0.55, bolt: 0.6 };
/** How big each shape's impact is, against the target token. */
const BIGNESS: Record<StrikeShape, number> = { slash: 1, claw: 1, beam: 1, projectile: 1, fireball: 2.2, meteor: 1.8, bolt: 1.5 };

const hex = (color: string) => parseInt(color.slice(1), 16);
const WHITE = 0xffffff;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3;
const easeIn = (t: number) => clamp01(t) ** 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function mix(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(lerp((a >> shift) & 0xff, (b >> shift) & 0xff, t));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

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

// ---------- particles ----------

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: number;
  gravity: number;
}

function burst(list: Spark[], at: Point, count: number, speed: number, size: number, colors: number[], life = 0.7, gravity = 0) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.75);
    list.push({
      x: at.x, y: at.y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, age: 0,
      life: life * (0.6 + Math.random() * 0.6), size: size * (0.5 + Math.random()), color: colors[i % colors.length]!, gravity,
    });
  }
}

function stepSparks(list: Spark[], dt: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    s.age += dt;
    if (s.age >= s.life) {
      list.splice(i, 1);
      continue;
    }
    s.vy += s.gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
  }
}

/** Each spark is a hot core with a soft halo; the blurred halo copy of the layer does the rest. */
function drawSparks(g: Graphics, list: readonly Spark[]) {
  for (const s of list) {
    const a = 1 - s.age / s.life;
    g.circle(s.x, s.y, s.size * 2.4).fill({ color: s.color, alpha: a * 0.22 });
    g.circle(s.x, s.y, s.size).fill({ color: mix(s.color, WHITE, 0.5), alpha: a });
  }
}

// ---------- shared drawing ----------

function ring(g: Graphics, at: Point, radius: number, width: number, color: number, alpha: number) {
  if (alpha <= 0 || radius <= 0) return;
  g.circle(at.x, at.y, radius).stroke({ width, color, alpha });
}

/** A soft glowing disc: halo, body, white core. */
function orb(g: Graphics, at: Point, radius: number, primary: number, secondary: number, alpha = 1) {
  g.circle(at.x, at.y, radius * 2.3).fill({ color: secondary, alpha: alpha * 0.25 });
  g.circle(at.x, at.y, radius * 1.4).fill({ color: primary, alpha: alpha * 0.55 });
  g.circle(at.x, at.y, radius).fill({ color: primary, alpha });
  g.circle(at.x, at.y, radius * 0.5).fill({ color: WHITE, alpha });
}

/** A trail or bolt segment drawn three times: wide halo, body, white core. */
function streak(g: Graphics, a: Point, b: Point, width: number, primary: number, secondary: number, alpha: number) {
  if (alpha <= 0) return;
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: width * 2.4, color: secondary, alpha: alpha * 0.3, cap: "round" });
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width, color: primary, alpha: alpha * 0.8, cap: "round" });
  g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ width: width * 0.4, color: WHITE, alpha, cap: "round" });
}

/** A lightning line between two points: `pieces` jagged segments, each off the line by up to `jitter`. */
function lightning(g: Graphics, a: Point, b: Point, pieces: number, jitter: number, width: number, primary: number, secondary: number, alpha: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let last = a;
  for (let i = 1; i <= pieces; i++) {
    const t = i / pieces;
    const off = i === pieces ? 0 : (Math.random() - 0.5) * 2 * jitter;
    const next = { x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off };
    streak(g, last, next, width, primary, secondary, alpha);
    last = next;
  }
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

function makeScene(host: FxHost, def: AnimationDef, bloomed: boolean): FxScene {
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

/** Plays a slash, projectile or bolt from `from` onto `to`. A nuke shape is drawn as a projectile. */
export function playStrike(host: FxHost, params: StrikeFxParams): RunningFx {
  const { def, from, to } = params;
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
  const side = Math.random() < 0.5 ? -1 : 1;
  const sparkCount = Math.min(def.particles, MAX_PARTICLES);
  const sparks: Spark[] = [];
  const palette = [primary, secondary, mix(primary, WHITE, 0.6)];
  const shape = def.shape === "nuke" ? "projectile" : def.shape;
  /** Shapes that cut across the target instead of flying into it. */
  const cut = shape === "slash" || shape === "claw";
  /** When the strike lands, as a share of the duration. */
  const landAt = LAND_AT[shape] * duration;
  const impactLen = Math.max(0.1, duration - landAt);
  const bigness = BIGNESS[shape];
  /** A meteor falls from high above the target, whoever cast it. */
  const sky = { x: to.x - r * 4, y: to.y - r * 11 };
  let landed = false;
  let last = 0;

  const pathAt = (u: number): Point => {
    if (shape === "meteor") return { x: lerp(sky.x, to.x, u), y: lerp(sky.y, to.y, u) };
    const x = from.x + dx * u;
    const y = from.y + dy * u;
    if (shape === "projectile" || shape === "fireball") {
      const lift = Math.sin(Math.PI * u) * Math.min(dist * 0.2, r * 3) * side;
      return { x: x + normal.x * lift, y: y + normal.y * lift };
    }
    const wobble = Math.sin(u * 22) * r * 0.32 * (1 - u * 0.4) * Math.sin(Math.PI * Math.min(1, u * 1.2));
    return { x: x + normal.x * wobble, y: y + normal.y * wobble };
  };

  const drawImpact = (k: number) => {
    // k runs 0 -> 1 across the impact phase.
    const e = easeOut(k);
    const fade = 1 - k;
    if (def.flash > 0) top.circle(to.x, to.y, r * (1 + e) * bigness).fill({ color: WHITE, alpha: def.flash * 0.8 * fade * fade });
    g.circle(to.x, to.y, r * (0.6 + e * 0.8) * bigness).fill({ color: primary, alpha: fade * 0.5 });
    ring(g, to, r * (0.4 + e * 1.7) * bigness, Math.max(2, r * 0.16 * fade), secondary, fade);
    ring(g, to, r * (0.2 + e * 1.1) * bigness, Math.max(2, r * 0.1 * fade), WHITE, fade * 0.8);
    if (shape === "fireball" || shape === "meteor") {
      // A rolling ball of fire, then scorch.
      g.circle(to.x, to.y, r * (0.8 + e * 1.4) * bigness).fill({ color: secondary, alpha: fade * 0.35 });
      g.circle(to.x, to.y, r * (0.5 + e * 0.9) * bigness).fill({ color: mix(primary, WHITE, 0.4), alpha: fade * 0.6 });
    }
    if (shape === "meteor") {
      // Debris thrown out of the crater.
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.3;
        const d = r * (0.6 + e * 2.4);
        g.circle(to.x + Math.cos(a) * d, to.y + Math.sin(a) * d * 0.6 - Math.sin(Math.PI * e) * r, Math.max(2, r * 0.12 * fade)).fill({ color: primary, alpha: fade });
      }
    }
    if (shape === "bolt") {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + 0.4;
        const tip = { x: to.x + Math.cos(a) * r * 1.8 * e, y: to.y + Math.sin(a) * r * 1.8 * e };
        lightning(g, to, tip, 4, r * 0.25, Math.max(2, r * 0.07), primary, secondary, fade);
      }
    }
  };

  /** One glowing arc sweeping across the target, `offset` to one side, starting `delay` seconds late. */
  const drawArc = (elapsed: number, offset: number, delay: number, scale: number) => {
    const t = elapsed - delay;
    if (t <= 0) return;
    const sweep = clamp01(t / (0.4 * duration));
    const fadeOut = t > 0.55 * duration ? clamp01(1 - (t - 0.55 * duration) / (0.45 * duration)) : 1;
    const R = r * 1.5 * scale;
    const centre = { x: to.x - dir.x * R + normal.x * offset, y: to.y - dir.y * R + normal.y * offset };
    const mid = Math.atan2(dir.y, dir.x);
    const span = 1.15;
    const segments = 30;
    const head = Math.floor(sweep * segments);
    const point = (i: number): Point => {
      const phi = mid + side * (-span + (2 * span * i) / segments);
      return { x: centre.x + Math.cos(phi) * R, y: centre.y + Math.sin(phi) * R };
    };
    for (let i = 0; i < head; i++) {
      const age = (head - i) / segments;
      const taper = Math.sin((Math.PI * (i + 0.5)) / segments);
      streak(g, point(i), point(i + 1), Math.max(2, r * 0.42 * taper * scale), primary, secondary, Math.max(0, 1 - age * 1.4) * fadeOut);
    }
    if (head > 0 && fadeOut > 0) orb(g, point(head), r * 0.22 * scale, WHITE, primary, fadeOut);
  };

  const draw = (elapsed: number) => {
    if (shape === "slash") return drawArc(elapsed, 0, 0, 1);
    if (shape === "claw") {
      // Three raking cuts, side by side, a beat apart.
      for (let i = -1; i <= 1; i++) drawArc(elapsed, i * r * 0.6, (i + 1) * 0.06 * duration, 1.15);
      return;
    }
    if (shape === "beam") {
      // A beam that shoots out, holds and burns, then thins away.
      const reach = easeOut(clamp01(elapsed / landAt));
      const hold = elapsed < 0.7 * duration ? 1 : clamp01(1 - (elapsed - 0.7 * duration) / (0.3 * duration));
      if (hold <= 0) return;
      const end = { x: from.x + dx * reach, y: from.y + dy * reach };
      const flicker = 0.85 + 0.15 * Math.sin(elapsed * 55);
      streak(g, from, end, Math.max(3, r * 0.5 * flicker * hold), primary, secondary, hold);
      orb(g, from, r * 0.32 * hold, primary, secondary, hold);
      if (landed) {
        orb(g, to, r * 0.45 * flicker * hold, primary, secondary, hold);
        if (sparkCount > 0 && Math.random() < 0.9) burst(sparks, to, 2, r * 2.5, Math.max(1.5, r * 0.05), palette, 0.4);
      }
      return;
    }
    const charge = shape === "bolt" ? 0.25 * duration : 0;
    const flight = landAt - charge;
    if (shape === "bolt" && elapsed < charge) {
      // A charging orb gathers at the attacker, with sparks spiralling in.
      const c = elapsed / charge;
      const pulse = 1 + Math.sin(elapsed * 45) * 0.12;
      orb(g, from, r * (0.15 + c * 0.4) * pulse, primary, secondary, 0.7 + c * 0.3);
      for (let i = 0; i < 6; i++) {
        const a = elapsed * 14 + (i / 6) * Math.PI * 2;
        const rad = r * (1.6 - c * 0.9);
        g.circle(from.x + Math.cos(a) * rad, from.y + Math.sin(a) * rad, Math.max(2, r * 0.07)).fill({ color: palette[i % 3]!, alpha: 0.9 });
      }
      return;
    }
    if (elapsed < landAt) {
      const u = easeIn((elapsed - charge) / flight) * 0.6 + clamp01((elapsed - charge) / flight) * 0.4;
      const head = pathAt(u);
      if (shape === "projectile" || shape === "fireball" || shape === "meteor") {
        // Fireballs and meteors are fatter and leave a longer, hotter tail.
        const heavy = shape !== "projectile";
        const steps = heavy ? 20 : 14;
        for (let k = 0; k < steps; k++) {
          const a = pathAt(Math.max(0, u - k * 0.03));
          const b = pathAt(Math.max(0, u - (k + 1) * 0.03));
          streak(g, a, b, Math.max(2, r * (heavy ? 0.55 : 0.3) * (1 - k / steps)), primary, secondary, 1 - k / steps);
        }
        orb(g, head, r * (shape === "meteor" ? 0.6 : heavy ? 0.5 : 0.3), primary, secondary);
        if (sparkCount > 0 && Math.random() < 0.7) burst(sparks, head, 1, r * 1.2, Math.max(1.5, r * 0.05), palette, 0.5, r * 2);
      } else {
        // Bolt: a jagged line from the attacker to the head, redrawn every frame.
        lightning(g, from, head, 9, r * 0.35, Math.max(2, r * 0.13), primary, secondary, 0.9);
        orb(g, head, r * 0.42, primary, secondary);
        if (sparkCount > 0 && Math.random() < 0.8) burst(sparks, head, 1, r * 1.6, Math.max(1.5, r * 0.05), palette, 0.45);
      }
      return;
    }
    if (!landed) return;
  };

  return {
    update(elapsed) {
      if (elapsed >= duration) return false;
      const dt = Math.max(0, elapsed - last);
      last = elapsed;
      g.clear();
      top.clear();
      if (!landed && elapsed >= landAt) {
        landed = true;
        if (sparkCount > 0) burst(sparks, to, sparkCount, r * 4 * bigness, Math.max(1.5, r * 0.06), palette, 0.9, r * 2.5);
      }
      draw(elapsed);
      if (landed && !cut && shape !== "beam") drawImpact(clamp01((elapsed - landAt) / impactLen));
      if (cut && landed) {
        // The cut leaves a flash at the target as the sweep passes it.
        const k = clamp01((elapsed - landAt) / impactLen);
        if (def.flash > 0) top.circle(to.x, to.y, r * (0.8 + easeOut(k) * 0.6)).fill({ color: WHITE, alpha: def.flash * 0.6 * (1 - k) ** 2 });
        ring(g, to, r * (0.3 + easeOut(k) * 1.2), Math.max(2, r * 0.1 * (1 - k)), secondary, (1 - k) * 0.8);
      }
      stepSparks(sparks, dt);
      drawSparks(g, sparks);
      if (landed && def.shake > 0) {
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
  const { def, origin, unit, extent } = params;
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
  const palette = [primary, secondary, mix(primary, WHITE, 0.6), WHITE];
  burst(sparks, origin, sparkCount, extent * 0.55 / Math.max(1, duration), Math.max(2, unit * 0.07), palette, duration * 0.8, unit * 3);
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
      for (let i = 0; i < 3; i++) {
        const k = clamp01((elapsed - i * 0.07 * duration) / (0.75 * duration));
        if (k <= 0) continue;
        ring(g, origin, R * 0.5 + easeOut(k) * extent * 1.15, Math.max(3, unit * (0.28 - i * 0.07) * (1 - k)), i === 0 ? WHITE : i === 1 ? primary : secondary, (1 - k) * 0.9);
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
      drawSparks(g, sparks);

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
