import type { Graphics } from "pixi.js";
import type { AnimationShape, Point } from "@vtt/shared";
import type { ResolvedAnimation } from "./effectPresets";
import { graphicsBudget } from "../ui/clientSettings";
import {
  WHITE, arcPoints, blade, clamp01, easeIn, easeOut, lerp, lerpPoint, lightning, mix, orb, polyline, ring, streak, type Spark,
} from "./fxKit";

/**
 * The look of every strike shape (ADR 0038). `fx.ts` owns the scene, the clock, the landing burst
 * and the shake; each shape here only draws one frame into `c.g` (additive, glows) and `c.top`
 * (plain, over it) and emits sparks. Every setting of the definition reaches the drawing through
 * the context: count, spread, arc, trail, spin, gravity (via `c.G`), rings, accent and the spark look.
 */

export type StrikeShape = Exclude<AnimationShape, "nuke">;

/** Everything a shape needs to draw a frame. Positions are board pixels. */
export interface StrikeCtx {
  d: ResolvedAnimation;
  g: Graphics;
  top: Graphics;
  from: Point;
  to: Point;
  /** Unit vector from attacker to target, and its left normal. */
  dir: Point;
  normal: Point;
  /** -1 or 1: which way arcs bow, chosen at random per play. */
  side: number;
  dist: number;
  /** Target radius times the animation's size. */
  r: number;
  /** Duration, landing time and the seconds after landing, all in seconds. */
  D: number;
  L: number;
  impactLen: number;
  primary: number;
  secondary: number;
  accent: number;
  palette: number[];
  n: number;
  spread: number;
  arc: number;
  trail: number;
  spin: number;
  /** Radians per second for anything that turns. */
  spinRate: number;
  /** Spark gravity in pixels per second squared (positive falls, negative rises). */
  G: number;
  sparks: Spark[];
  sparkCount: number;
  landed: boolean;
  /** A point on the line from attacker to target, `off` to the side. */
  along(u: number, off?: number): Point;
  /** Throws `count` sparks from `at`, if the animation has any particles. */
  emit(at: Point, count: number, speed: number, life?: number): void;
}

interface ShapeDraw {
  /** Called every frame, before and after the landing. */
  draw(e: number): void;
  /** Called every frame after the landing; `k` runs 0 to 1 over the impact. */
  after?(k: number, e: number): void;
}

export interface ShapeSpec {
  /** When the strike lands, as a share of the duration. */
  land: number;
  /** How big the impact is against the target token. */
  big: number;
  /** "full": flash, disc and rings. "light": flash and rings. "none": the shape draws all of it. */
  impact: "full" | "light" | "none";
  make(c: StrikeCtx): ShapeDraw;
}

const TAU = Math.PI * 2;
const rnd = Math.random;

/** A dot circling `at`, for shapes that spin. */
function satellites(c: StrikeCtx, at: Point, rad: number, e: number, count: number, size: number) {
  if (c.spin < 0.05) return;
  for (let i = 0; i < count; i++) {
    const a = e * c.spinRate + (i / count) * TAU;
    c.g.circle(at.x + Math.cos(a) * rad, at.y + Math.sin(a) * rad, size).fill({ color: c.palette[i % c.palette.length]!, alpha: 0.9 });
  }
}

function squarePoints(x: number, y: number, h: number, rot: number): number[] {
  const c = Math.cos(rot) * h;
  const s = Math.sin(rot) * h;
  return [x + c - s, y + s + c, x - c - s, y - s + c, x - c + s, y - s - c, x + c + s, y + s - c];
}

/** A ball of fire rolling out of the impact. */
function rollingBall(c: StrikeCtx, k: number, big: number) {
  const e = easeOut(k);
  const fade = 1 - k;
  c.g.circle(c.to.x, c.to.y, c.r * (0.8 + e * 1.4) * big).fill({ color: c.secondary, alpha: fade * 0.35 });
  c.g.circle(c.to.x, c.to.y, c.r * (0.5 + e * 0.9) * big).fill({ color: mix(c.primary, WHITE, 0.4), alpha: fade * 0.6 });
}

// ---------- cuts ----------

/** One glowing arc sweeping across the target, `offset` to one side, starting `delay` seconds late. */
function cutArc(c: StrikeCtx, e: number, offset: number, delay: number, scale: number, side: number) {
  const t = e - delay;
  if (t <= 0) return;
  const sweep = clamp01(t / (0.4 * c.D));
  const fadeOut = t > 0.55 * c.D ? clamp01(1 - (t - 0.55 * c.D) / (0.45 * c.D)) : 1;
  const R = c.r * 1.5 * scale;
  const centre = { x: c.to.x - c.dir.x * R + c.normal.x * offset, y: c.to.y - c.dir.y * R + c.normal.y * offset };
  const mid = Math.atan2(c.dir.y, c.dir.x);
  const span = 0.5 + c.arc * 1.5;
  const segments = graphicsBudget().arcSegments;
  const head = Math.floor(sweep * segments);
  const point = (i: number): Point => {
    const phi = mid + side * (-span + (2 * span * i) / segments);
    return { x: centre.x + Math.cos(phi) * R, y: centre.y + Math.sin(phi) * R };
  };
  const tailFade = 2.6 - 2 * c.trail;
  for (let i = 0; i < head; i++) {
    const age = (head - i) / segments;
    const taper = Math.sin((Math.PI * (i + 0.5)) / segments);
    streak(c.g, point(i), point(i + 1), Math.max(2, c.r * 0.42 * taper * scale), c.primary, c.secondary, Math.max(0, 1 - age * tailFade) * fadeOut);
  }
  if (head > 0 && fadeOut > 0) orb(c.g, point(head), c.r * 0.22 * scale, WHITE, c.primary, fadeOut);
}

/** `count` cuts side by side (spread apart), a beat after each other; a slash crosses them over. */
function cuts(scale: number, cross: boolean): ShapeSpec["make"] {
  return (c) => ({
    draw(e) {
      const step = Math.min(0.06, 0.35 / c.n) * c.D;
      for (let i = 0; i < c.n; i++) {
        const offset = (i - (c.n - 1) / 2) * c.r * (0.2 + c.spread * 1.2);
        cutArc(c, e, offset, i * step, scale, cross && i % 2 === 1 ? -c.side : c.side);
      }
    },
  });
}

// ---------- things that fly ----------

type FlyKind = "projectile" | "fireball" | "meteor" | "bolt";

/** Projectile, fireball, meteor and bolt: `count` of them, fanned by spread, all landing together. */
function flyer(kind: FlyKind): ShapeSpec["make"] {
  return (c) => {
    const charge = kind === "bolt" ? 0.25 * c.D : 0;
    const stagger = c.n > 1 ? Math.min(0.04 * c.D, ((c.L - charge) * 0.6) / (c.n - 1)) : 0;
    const lanes = Array.from({ length: c.n }, (_, i) => ({ off: c.n > 1 ? (i / (c.n - 1) - 0.5) * 2 * c.spread * c.r * 3 : 0, delay: i * stagger }));
    const lift = c.arc * Math.min(c.dist * 0.45, c.r * 7);
    const pathAt = (u: number, off: number): Point => {
      if (kind === "meteor") {
        // A meteor falls from high above the target, whoever cast it.
        const end = { x: c.to.x + c.normal.x * off, y: c.to.y + c.normal.y * off };
        return lerpPoint({ x: end.x - c.arc * c.r * 10, y: end.y - c.r * 11 }, end, u);
      }
      const p = c.along(u, off * u);
      const l = kind === "bolt" ? Math.sin(u * 22) * c.r * 0.32 * (1 - u * 0.4) * Math.sin(Math.PI * Math.min(1, u * 1.2)) : Math.sin(Math.PI * u) * lift * c.side;
      return { x: p.x + c.normal.x * l, y: p.y + c.normal.y * l };
    };
    return {
      draw(e) {
        if (kind === "bolt" && e < charge) {
          // A charging orb gathers at the attacker, with sparks spiralling in.
          const k = e / charge;
          orb(c.g, c.from, c.r * (0.15 + k * 0.4) * (1 + Math.sin(e * 45) * 0.12), c.primary, c.secondary, 0.7 + k * 0.3);
          for (let i = 0; i < 6; i++) {
            const a = e * (6 + c.spinRate * 0.6) + (i / 6) * TAU;
            const rad = c.r * (1.6 - k * 0.9);
            c.g.circle(c.from.x + Math.cos(a) * rad, c.from.y + Math.sin(a) * rad, Math.max(2, c.r * 0.07)).fill({ color: c.palette[i % 3]!, alpha: 0.9 });
          }
          return;
        }
        for (const lane of lanes) {
          const t0 = charge + lane.delay;
          if (e < t0) continue;
          const raw = (e - t0) / (c.L - t0);
          if (raw >= 1) continue;
          const u = easeIn(raw) * 0.6 + raw * 0.4;
          const head = pathAt(u, lane.off);
          if (kind === "bolt") {
            // A jagged line from the attacker to the head, redrawn every frame, with ghosts of the head behind it.
            lightning(c.g, c.from, head, 9, c.r * (0.1 + 0.6 * c.arc), Math.max(2, c.r * 0.13), c.primary, c.secondary, 0.9);
            const ghosts = Math.round(c.trail * 5);
            for (let k = 1; k <= ghosts; k++) {
              const f = 1 - k / (ghosts + 1);
              orb(c.g, pathAt(Math.max(0, u - k * 0.07), lane.off), c.r * 0.3 * f, c.primary, c.secondary, 0.55 * f);
            }
            orb(c.g, head, c.r * 0.42, c.primary, c.secondary);
            satellites(c, head, c.r * 0.7, e, 3, Math.max(2, c.r * 0.06));
            if (rnd() < 0.8) c.emit(head, 1, c.r * 1.6, 0.45);
          } else {
            // Fireballs and meteors are fatter and leave a longer, hotter tail.
            const heavy = kind !== "projectile";
            const steps = 4 + Math.round(c.trail * (heavy ? 30 : 24));
            for (let k = 0; k < steps; k++) {
              streak(c.g, pathAt(Math.max(0, u - k * 0.03), lane.off), pathAt(Math.max(0, u - (k + 1) * 0.03), lane.off), Math.max(2, c.r * (heavy ? 0.55 : 0.3) * (1 - k / steps)), c.primary, c.secondary, 1 - k / steps);
            }
            const radius = c.r * (kind === "meteor" ? 0.6 : heavy ? 0.5 : 0.3);
            orb(c.g, head, radius, c.primary, c.secondary);
            satellites(c, head, radius * 1.9, e, 3, Math.max(2, radius * 0.22));
            if (rnd() < 0.7) c.emit(head, 1, c.r * 1.2, 0.5);
          }
        }
      },
      after(k) {
        if (kind === "fireball" || kind === "meteor") rollingBall(c, k, kind === "fireball" ? 2.2 : 1.8);
        if (kind === "meteor") {
          // Debris thrown out of the crater.
          const e = easeOut(k);
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * TAU + 0.3;
            const d = c.r * (0.6 + e * 2.4);
            c.g.circle(c.to.x + Math.cos(a) * d, c.to.y + Math.sin(a) * d * 0.6 - Math.sin(Math.PI * e) * c.r, Math.max(2, c.r * 0.12 * (1 - k))).fill({ color: c.primary, alpha: 1 - k });
          }
        }
        if (kind === "bolt") {
          const e = easeOut(k);
          for (let i = 0; i < 7; i++) {
            const a = (i / 7) * TAU + 0.4 + c.spin * k;
            const tip = { x: c.to.x + Math.cos(a) * c.r * 1.8 * e, y: c.to.y + Math.sin(a) * c.r * 1.8 * e };
            lightning(c.g, c.to, tip, 4, c.r * 0.25, Math.max(2, c.r * 0.07), c.primary, c.secondary, 1 - k);
          }
        }
      },
    };
  };
}

/** `count` beams, fanned by spread and bowed by arc, that shoot out, hold and burn, then thin away. */
const beam: ShapeSpec["make"] = (c) => {
  const holdEnd = 0.4 + 0.45 * c.trail;
  const lift = c.arc * Math.min(c.dist * 0.3, c.r * 5);
  return {
    draw(e) {
      const reach = easeOut(clamp01(e / c.L));
      const hold = e < holdEnd * c.D ? 1 : clamp01(1 - (e - holdEnd * c.D) / ((1 - holdEnd) * c.D));
      if (hold <= 0) return;
      const flicker = 0.85 + 0.15 * Math.sin(e * 55);
      const width = Math.max(3, (c.r * 0.5 * flicker * hold) / (1 + (c.n - 1) * 0.3));
      for (let i = 0; i < c.n; i++) {
        const off = c.n > 1 ? (i / (c.n - 1) - 0.5) * 2 * c.spread * c.r * 2.5 : 0;
        const pts = Array.from({ length: 13 }, (_, j) => {
          const u = (reach * j) / 12;
          const p = c.along(u, off * u);
          const l = Math.sin(Math.PI * u) * lift * c.side;
          return { x: p.x + c.normal.x * l, y: p.y + c.normal.y * l };
        });
        polyline(c.g, pts, width, c.primary, c.secondary, hold, false);
        orb(c.g, c.from, c.r * 0.32 * hold, c.primary, c.secondary, hold);
        if (c.spin > 0.05) {
          // A sparkling helix winds along the beam.
          for (let j = 1; j < 9; j++) {
            const p = pts[Math.round((j / 9) * 12)]!;
            const o = Math.sin(j * 1.3 - e * c.spinRate) * c.r * 0.4;
            c.g.circle(p.x + c.normal.x * o, p.y + c.normal.y * o, Math.max(1.5, c.r * 0.07)).fill({ color: c.accent, alpha: 0.8 * hold });
          }
        }
        if (c.landed) {
          orb(c.g, pts[12]!, c.r * 0.45 * flicker * hold, c.primary, c.secondary, hold);
          if (rnd() < 0.9) c.emit(pts[12]!, 2, c.r * 2.5, 0.4);
        }
      }
    },
  };
};

// ---------- melee extras ----------

/** Spinning blades orbit a point that travels to the target, then keep sweeping it. */
const whirlwind: ShapeSpec["make"] = (c) => ({
  draw(e) {
    const t = clamp01(e / c.L);
    const k = c.landed ? clamp01((e - c.L) / c.impactLen) : 0;
    const centre = c.landed ? c.to : c.along(easeIn(t) * 0.7 + t * 0.3);
    const grow = c.landed ? 1 - easeIn(k) * 0.5 : 0.5 + 0.5 * t;
    const fade = c.landed ? 1 - k ** 1.5 : 1;
    const R = c.r * (0.9 + c.spread * 1.8) * grow;
    const phase = e * c.spinRate;
    const sweep = 0.35 + c.trail * 1.1;
    ring(c.g, centre, R, Math.max(1.5, c.r * 0.05), c.secondary, 0.25 * fade);
    for (let i = 0; i < c.n; i++) {
      const head = phase + (i / c.n) * TAU;
      const pts = arcPoints(centre, R, head - sweep, head, 8);
      polyline(c.g, pts, c.r * 0.4, c.primary, c.secondary, fade);
      blade(c.g, pts[8]!, head + Math.PI / 2 + 0.3, c.r * 0.45, c.r * 0.12, c.accent, fade);
    }
    if (rnd() < 0.4) c.emit({ x: centre.x + Math.cos(phase) * R, y: centre.y + Math.sin(phase) * R }, 1, c.r * 1.5, 0.4);
  },
});

/** The attacker leaps, lands, and cracks radiate across the ground. */
const slam: ShapeSpec["make"] = (c) => {
  const cracks = Array.from({ length: c.n }, (_, i) => ({ a: (i / c.n) * TAU + (rnd() - 0.5) * 0.5, len: 0.7 + rnd() * 0.6, jit: Array.from({ length: 7 }, () => (rnd() - 0.5) * 2) }));
  const air = (u: number): Point => {
    const p = c.along(u);
    return { x: p.x, y: p.y - Math.sin(Math.PI * u) * c.r * (2 + c.arc * 6) };
  };
  return {
    draw(e) {
      if (c.landed) return;
      const u = clamp01(e / c.L);
      const ground = c.along(u);
      const lift = Math.sin(Math.PI * u);
      c.top.ellipse(ground.x, ground.y, c.r * 0.7 * (1 - 0.35 * lift), c.r * 0.28 * (1 - 0.35 * lift)).fill({ color: 0x000000, alpha: 0.35 });
      const steps = 3 + Math.round(c.trail * 10);
      for (let k = 0; k < steps; k++) {
        streak(c.g, air(Math.max(0, u - k * 0.035)), air(Math.max(0, u - (k + 1) * 0.035)), Math.max(2, c.r * 0.5 * (1 - k / steps)), c.primary, c.secondary, 1 - k / steps);
      }
      orb(c.g, air(u), c.r * 0.55, c.primary, c.secondary);
    },
    after(k) {
      const grow = easeOut(clamp01(k * 2.5));
      const fade = 1 - clamp01((k - 0.45) / 0.55);
      const reach = c.r * (1.2 + c.spread * 3.2) * grow;
      ring(c.g, c.to, reach * 0.9, Math.max(2, c.r * 0.2), c.secondary, 0.3 * fade);
      for (const crack of cracks) {
        const a = crack.a + c.spin * k * 0.6;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const pts = crack.jit.concat(0).map((j, idx) => {
          const along = (reach * crack.len * idx) / 7;
          const side = idx === 0 ? 0 : j * c.r * 0.22;
          return { x: c.to.x + dx * along - dy * side, y: c.to.y + dy * along + dx * side };
        });
        polyline(c.g, pts, Math.max(2, c.r * 0.12), c.primary, c.secondary, fade, false);
      }
    },
  };
};

/** The attacker blurs to the target as a trail of dark afterimages, then crosses it with two cuts. */
const shadow: ShapeSpec["make"] = (c) => {
  const pos = (u: number): Point => {
    const p = c.along(u);
    const w = Math.sin(u * TAU) * c.arc * c.r * 0.6 * c.side;
    return { x: p.x + c.normal.x * w, y: p.y + c.normal.y * w };
  };
  return {
    draw(e) {
      const u = c.landed ? 1 : easeIn(clamp01(e / c.L));
      const fade = c.landed ? 1 - easeIn(clamp01((e - c.L) / c.impactLen)) : 1;
      const gap = 0.05 + c.trail * 0.1;
      for (let i = c.n - 1; i >= 0; i--) {
        const uu = u - i * gap;
        if (uu < 0 && i > 0) continue;
        const p = pos(Math.max(0, uu));
        const a = (1 - i / c.n) * fade * (i === 0 ? 1 : 0.75);
        c.top.circle(p.x, p.y, c.r * 0.58).fill({ color: 0x07030f, alpha: a * 0.85 });
        ring(c.g, p, c.r * 0.6, 2.5, i % 2 ? c.accent : c.primary, a);
        c.top.circle(p.x - c.r * 0.2, p.y - c.r * 0.1, c.r * 0.07).fill({ color: WHITE, alpha: a });
        c.top.circle(p.x + c.r * 0.2, p.y - c.r * 0.1, c.r * 0.07).fill({ color: WHITE, alpha: a });
      }
      if (!c.landed) c.emit(pos(u), 1, c.r * 0.8, 0.4);
    },
    after(k) {
      const s = easeOut(clamp01(k * 3));
      const a = 1 - clamp01((k - 0.35) / 0.65);
      const len = c.r * (1.6 + c.spread * 1.6);
      for (const ang of [-0.8 + c.spin * k, 0.8 - c.spin * k]) {
        const d = { x: Math.cos(ang), y: Math.sin(ang) };
        const A = { x: c.to.x - d.x * len, y: c.to.y - d.y * len };
        const B = { x: c.to.x + d.x * len, y: c.to.y + d.y * len };
        streak(c.g, A, lerpPoint(A, B, s), c.r * 0.22, c.primary, c.secondary, a);
      }
    },
  };
};

// ---------- ranged extras ----------

/** `count` arrows fanned by spread, arcing high and coming down together. */
const volley: ShapeSpec["make"] = (c) => {
  const stagger = c.n > 1 ? Math.min(0.035 * c.D, (c.L * 0.5) / (c.n - 1)) : 0;
  const arrows = Array.from({ length: c.n }, (_, i) => ({ off: c.n > 1 ? (i / (c.n - 1) - 0.5) * 2 * c.spread * c.r * 4 : 0, delay: i * stagger, hit: false }));
  const liftH = c.arc * Math.min(c.dist * 0.6, c.r * 10) + c.r * 1.5;
  const pos = (off: number, u: number): Point => {
    const p = c.along(u, off * u);
    return { x: p.x, y: p.y - Math.sin(Math.PI * u) * liftH };
  };
  return {
    draw(e) {
      const tail = 0.04 + c.trail * 0.2;
      for (const a of arrows) {
        const raw = (e - a.delay) / (c.L - a.delay);
        if (raw < 0) continue;
        if (raw >= 1) {
          const end = pos(a.off, 1);
          if (!a.hit) {
            a.hit = true;
            c.emit(end, 3, c.r * 2, 0.4);
          }
          // The arrow stays stuck in the ground until the end.
          const before = pos(a.off, 0.96);
          const len = Math.hypot(end.x - before.x, end.y - before.y) || 1;
          const shaft = { x: end.x - ((end.x - before.x) / len) * c.r * 1.3, y: end.y - ((end.y - before.y) / len) * c.r * 1.3 };
          streak(c.g, end, shaft, Math.max(2, c.r * 0.1), c.primary, c.secondary, 1 - clamp01((e - c.L) / c.impactLen));
          continue;
        }
        const head = pos(a.off, raw);
        streak(c.g, pos(a.off, Math.max(0, raw - tail)), head, Math.max(2, c.r * 0.12), c.primary, c.secondary, 1);
        orb(c.g, head, c.r * 0.14, c.accent, c.secondary);
      }
    },
  };
};

/** `count` thrown blades, spinning, on curved paths that fan out and meet at the target. */
const dagger: ShapeSpec["make"] = (c) => {
  const stagger = c.n > 1 ? Math.min(0.03 * c.D, (c.L * 0.4) / (c.n - 1)) : 0;
  const daggers = Array.from({ length: c.n }, (_, i) => {
    const f = c.n > 1 ? i / (c.n - 1) - 0.5 : 0;
    return { bend: f * 2 * c.spread, off: f * c.r * 0.6, delay: i * stagger, turn: i % 2 ? -1 : 1, index: i, hit: false };
  });
  const pos = (d: (typeof daggers)[number], u: number): Point => {
    const end = c.along(1, d.off);
    const mid = c.along(0.5);
    const bow = d.bend * c.dist * 0.9 + c.side * c.arc * c.dist * 0.2;
    const ctrl = { x: mid.x + c.normal.x * bow, y: mid.y + c.normal.y * bow };
    const o = 1 - u;
    return { x: o * o * c.from.x + 2 * o * u * ctrl.x + u * u * end.x, y: o * o * c.from.y + 2 * o * u * ctrl.y + u * u * end.y };
  };
  return {
    draw(e) {
      for (const d of daggers) {
        const raw = (e - d.delay) / (c.L - d.delay);
        if (raw < 0) continue;
        if (raw >= 1) {
          const end = pos(d, 1);
          if (!d.hit) {
            d.hit = true;
            c.emit(end, 4, c.r * 2, 0.4);
          }
          // The blade stays stuck in the target and fades.
          blade(c.g, end, Math.atan2(c.dir.y, c.dir.x) + d.index * 0.3, c.r * 0.6, c.r * 0.14, c.primary, 1 - clamp01((e - c.L) / c.impactLen));
          continue;
        }
        const rot = e * c.spinRate * d.turn + d.index * 1.7;
        const head = pos(d, raw);
        const ghosts = 2 + Math.round(c.trail * 6);
        for (let k = ghosts; k >= 1; k--) {
          blade(c.g, pos(d, Math.max(0, raw - k * 0.025 * (1 + c.trail))), rot - k * 0.5 * d.turn, c.r * 0.55, c.r * 0.14, c.primary, 0.35 * (1 - k / (ghosts + 1)));
        }
        streak(c.g, pos(d, Math.max(0, raw - 0.05 - c.trail * 0.15)), head, Math.max(2, c.r * 0.1), c.primary, c.secondary, 0.6);
        blade(c.g, head, rot, c.r * 0.7, c.r * 0.17, c.primary, 1);
      }
    },
  };
};

/** A bomb is lobbed, ticks on the target, then goes off in fire, smoke and flying debris. */
const explosion: ShapeSpec["make"] = (c) => {
  const chunks = Array.from({ length: c.n * 2 }, () => ({ a: rnd() * TAU, v: c.r * (5 + rnd() * 9) * (0.5 + c.spread), turn: (rnd() - 0.5) * 14, size: c.r * (0.1 + rnd() * 0.14), color: c.palette[Math.floor(rnd() * 3)]! }));
  const smoke = Array.from({ length: 5 }, () => ({ a: rnd() * TAU, d: c.r * (0.2 + rnd() * 0.9), s: 0.7 + rnd() * 0.8 }));
  const lobEnd = 0.55;
  return {
    draw(e) {
      if (c.landed) return;
      const t = clamp01(e / (c.L * lobEnd));
      const base = c.along(t);
      const pos = t < 1 ? { x: base.x, y: base.y - Math.sin(Math.PI * t) * c.arc * Math.min(c.dist * 0.5, c.r * 6) } : c.to;
      const pulse = clamp01((e - c.L * lobEnd) / (c.L * (1 - lobEnd)));
      orb(c.g, pos, c.r * (0.26 + 0.5 * pulse * pulse) * (1 + 0.12 * Math.sin(e * 40)), c.primary, c.secondary);
      if (t < 1 && rnd() < 0.6) c.emit(pos, 1, c.r * 1.2, 0.35);
      if (pulse > 0) ring(c.g, c.to, c.r * (2.8 - 1.8 * pulse), Math.max(2, c.r * 0.07), c.accent, 0.3 + 0.6 * pulse);
    },
    after(k) {
      const t = k * c.impactLen;
      const e = easeOut(k);
      const fade = 1 - k;
      c.g.circle(c.to.x, c.to.y, c.r * (0.5 + e * 2.2)).fill({ color: c.secondary, alpha: fade * 0.4 });
      c.g.circle(c.to.x, c.to.y, c.r * (0.35 + e * 1.5)).fill({ color: c.accent, alpha: fade * 0.6 });
      c.g.circle(c.to.x, c.to.y, c.r * (0.2 + e * 0.8)).fill({ color: WHITE, alpha: fade });
      for (const s of smoke) {
        const spread = 1 + k;
        c.top.circle(c.to.x + Math.cos(s.a) * s.d * spread, c.to.y + Math.sin(s.a) * s.d * spread - k * c.r * 1.2, c.r * s.s * (0.6 + k * 1.2)).fill({ color: 0x1c1917, alpha: 0.4 * fade * Math.min(1, k * 5) });
      }
      for (const ch of chunks) {
        const x = c.to.x + Math.cos(ch.a) * ch.v * t;
        const y = c.to.y + Math.sin(ch.a) * ch.v * t * 0.8 + 0.5 * c.G * t * t;
        c.top.poly(squarePoints(x, y, ch.size, ch.turn * t)).fill({ color: 0x2b1a12, alpha: fade * 0.9 });
        c.g.circle(x, y, ch.size * 1.6).fill({ color: ch.color, alpha: fade * 0.5 });
      }
    },
  };
};

// ---------- magic extras ----------

/** Lightning from the attacker to the target, then jumping `count` times to random spots nearby. */
const chain: ShapeSpec["make"] = (c) => {
  const nodes: Point[] = [c.from, c.to];
  const base = rnd() * TAU;
  for (let i = 0; i < c.n; i++) {
    const a = base + i * 2.4;
    const d = c.r * (1.8 + rnd() * 2.2) * (0.5 + c.spread * 1.5);
    nodes.push({ x: c.to.x + Math.cos(a) * d, y: c.to.y + Math.sin(a) * d });
  }
  const segs = nodes.length - 1;
  const stepT = Math.max(0.05, (0.85 * c.D - c.L) / Math.max(1, segs - 1));
  const linger = stepT * 0.6 + c.trail * 0.3 * c.D;
  const arrived = new Array<boolean>(segs).fill(false);
  return {
    draw(e) {
      for (let i = 0; i < segs; i++) {
        const t0 = i === 0 ? 0 : c.L + (i - 1) * stepT;
        const dur = i === 0 ? c.L : stepT * 0.6;
        const age = e - t0;
        if (age < 0) break;
        const a = nodes[i]!;
        const b = nodes[i + 1]!;
        const alpha = age < dur ? 1 : 1 - clamp01((age - dur) / linger);
        if (alpha <= 0) continue;
        const prog = clamp01(age / dur);
        const end = lerpPoint(a, b, prog);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        lightning(c.g, a, end, Math.max(4, Math.round(len / (c.r * 0.7))), c.r * (0.1 + 0.5 * c.arc), Math.max(2, c.r * 0.1), c.primary, c.secondary, alpha * 0.95);
        if (prog >= 1) {
          if (!arrived[i]) {
            arrived[i] = true;
            c.emit(b, 4, c.r * 2, 0.4);
          }
          orb(c.g, b, c.r * 0.3 * alpha, c.primary, c.secondary, alpha);
          ring(c.g, b, c.r * (0.3 + 0.8 * clamp01((age - dur) / 0.3)), 2, c.accent, alpha * 0.7);
        } else {
          orb(c.g, end, c.r * 0.22, c.primary, c.secondary);
        }
      }
    },
  };
};

/** An icy orb flies in, and `count` ice spikes burst out of the ground around the target, then shatter. */
const frost: ShapeSpec["make"] = (c) => {
  const spikes = Array.from({ length: c.n }, (_, i) => {
    const a = (i / c.n) * TAU + (rnd() - 0.5) * 0.4;
    const d = c.r * (0.4 + c.spread * 1.2) * (0.75 + rnd() * 0.5);
    return { base: { x: c.to.x + Math.cos(a) * d, y: c.to.y + Math.sin(a) * d * 0.6 }, h: c.r * (1.4 + rnd() * 1.3), w: c.r * (0.2 + rnd() * 0.12), lean: Math.cos(a) };
  }).sort((p, q) => p.base.y - q.base.y);
  let shattered = false;
  const lift = c.arc * Math.min(c.dist * 0.45, c.r * 7);
  const pos = (u: number): Point => {
    const p = c.along(u);
    const l = Math.sin(Math.PI * u) * lift * c.side;
    return { x: p.x + c.normal.x * l, y: p.y + c.normal.y * l };
  };
  return {
    draw(e) {
      if (c.landed) return;
      const raw = clamp01(e / c.L);
      const u = easeIn(raw) * 0.6 + raw * 0.4;
      const steps = 3 + Math.round(c.trail * 14);
      for (let k = 0; k < steps; k++) {
        streak(c.g, pos(Math.max(0, u - k * 0.03)), pos(Math.max(0, u - (k + 1) * 0.03)), Math.max(2, c.r * 0.28 * (1 - k / steps)), c.primary, c.secondary, 1 - k / steps);
      }
      const head = pos(u);
      orb(c.g, head, c.r * 0.38, c.primary, c.secondary);
      satellites(c, head, c.r * 0.8, e, 4, Math.max(2, c.r * 0.07));
      if (rnd() < 0.6) c.emit(head, 1, c.r, 0.5);
    },
    after(k) {
      const grow = easeOut(clamp01(k * 4));
      const shatter = clamp01((k - 0.7) / 0.3);
      const a = 1 - shatter;
      c.g.circle(c.to.x, c.to.y, c.r * (1 + c.spread * 1.4) * grow).fill({ color: c.primary, alpha: 0.14 * a });
      for (let i = 0; i < 6; i++) {
        const ang = (i * Math.PI) / 3 + c.spin * k * 3;
        const len = c.r * (1.1 + c.spread * 1.4) * grow;
        streak(c.g, c.to, { x: c.to.x + Math.cos(ang) * len, y: c.to.y + Math.sin(ang) * len }, Math.max(2, c.r * 0.06), c.secondary, c.accent, 0.55 * a);
      }
      for (const s of spikes) {
        const tip = { x: s.base.x + s.lean * s.h * 0.25 * grow, y: s.base.y - s.h * grow * (1 - shatter * 0.4) };
        c.top.poly([s.base.x - s.w, s.base.y, tip.x, tip.y, s.base.x + s.w, s.base.y]).fill({ color: mix(c.primary, WHITE, 0.25), alpha: 0.85 * a });
        streak(c.g, { x: s.base.x - s.w * 0.3, y: s.base.y }, tip, Math.max(1.5, s.w * 0.5), c.secondary, c.accent, 0.7 * a);
      }
      if (shatter > 0 && !shattered) {
        shattered = true;
        for (const s of spikes) c.emit({ x: s.base.x, y: s.base.y - s.h * 0.7 }, 3, c.r * 3, 0.7);
      }
    },
  };
};

/** A glob is lobbed in; `count` bubbles swell and pop in a green cloud that hangs over the target. */
const poison: ShapeSpec["make"] = (c) => {
  const puffs = Array.from({ length: c.n }, () => ({ a: rnd() * TAU, d: c.r * (0.1 + rnd() * (0.5 + c.spread * 1.3)), start: rnd() * 0.45, max: c.r * (0.4 + rnd() * 0.45), popped: false }));
  const lift = c.arc * Math.min(c.dist * 0.45, c.r * 7);
  const pos = (u: number): Point => {
    const p = c.along(u);
    const l = Math.sin(Math.PI * u) * lift * c.side;
    return { x: p.x + c.normal.x * l, y: p.y + c.normal.y * l };
  };
  return {
    draw(e) {
      if (c.landed) return;
      const raw = clamp01(e / c.L);
      const u = easeIn(raw) * 0.6 + raw * 0.4;
      const steps = 3 + Math.round(c.trail * 12);
      for (let k = 0; k < steps; k++) {
        streak(c.g, pos(Math.max(0, u - k * 0.03)), pos(Math.max(0, u - (k + 1) * 0.03)), Math.max(2, c.r * 0.3 * (1 - k / steps)), c.primary, c.secondary, 0.8 * (1 - k / steps));
      }
      const head = pos(u);
      orb(c.g, head, c.r * 0.35, c.primary, c.secondary);
      satellites(c, head, c.r * 0.7, e, 3, Math.max(2, c.r * 0.08));
      if (rnd() < 0.5) c.emit(head, 1, c.r * 0.6, 0.5);
    },
    after(k) {
      const cloud = Math.min(1, k * 3) * (1 - clamp01((k - 0.78) / 0.22));
      c.g.circle(c.to.x, c.to.y, c.r * (1 + c.spread * 1.6) * easeOut(k * 2)).fill({ color: c.primary, alpha: 0.2 * cloud });
      c.g.circle(c.to.x, c.to.y, c.r * (0.6 + c.spread) * easeOut(k * 2)).fill({ color: c.secondary, alpha: 0.12 * cloud });
      for (const pf of puffs) {
        const kk = (k - pf.start) / 0.5;
        if (kk <= 0) continue;
        const at = { x: c.to.x + Math.cos(pf.a) * pf.d, y: c.to.y + Math.sin(pf.a) * pf.d * 0.7 + c.d.gravity * c.r * 2.5 * Math.min(1, kk) };
        if (kk >= 1) {
          if (!pf.popped) {
            pf.popped = true;
            c.emit(at, 3, c.r * 1.5, 0.5);
          }
          continue;
        }
        const rad = pf.max * easeOut(kk);
        c.g.circle(at.x, at.y, rad).fill({ color: c.primary, alpha: 0.3 * (1 - kk * 0.5) });
        ring(c.g, at, rad, Math.max(1.5, c.r * 0.06), c.secondary, 1 - kk * 0.4);
        c.g.circle(at.x - rad * 0.35, at.y - rad * 0.35, rad * 0.18).fill({ color: WHITE, alpha: 0.7 * (1 - kk) });
      }
    },
  };
};

/** A pillar of light comes down from above; `count` pillars stand spread apart. */
const smite: ShapeSpec["make"] = (c) => {
  const topY = c.to.y - c.r * 22;
  const xs = Array.from({ length: c.n }, (_, i) => (c.n > 1 ? (i / (c.n - 1) - 0.5) * 2 * c.spread * c.r * 3.5 : 0));
  /** Four slices, brighter towards the ground. */
  const pillar = (x: number, width: number, alpha: number) => {
    for (let s = 0; s < 4; s++) {
      const y0 = lerp(topY, c.to.y, s / 4);
      const y1 = lerp(topY, c.to.y, (s + 1) / 4);
      streak(c.g, { x: c.to.x + x, y: y0 }, { x: c.to.x + x, y: y1 }, width, c.primary, c.secondary, (alpha * (s + 1)) / 4);
    }
  };
  return {
    draw(e) {
      if (c.landed) return;
      const k = e / c.L;
      orb(c.g, c.from, c.r * 0.3 * k, c.primary, c.secondary, k);
      for (const x of xs) {
        pillar(x, c.r * (0.06 + 0.5 * easeIn(k)), 0.25 + 0.6 * k);
        ring(c.g, { x: c.to.x + x, y: c.to.y }, c.r * (2.2 - 1.4 * k), 2.5, c.accent, k);
      }
    },
    after(k, e) {
      const f = 1 - clamp01(k / (0.3 + 0.7 * c.trail));
      if (f <= 0) return;
      for (const x of xs) {
        const base = { x: c.to.x + x, y: c.to.y };
        pillar(x, c.r * (0.9 + 0.2 * Math.sin(e * 40)) * (0.4 + 0.6 * f), f);
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4 + k * c.spin * 4;
          const len = c.r * (1.4 + easeOut(k) * 1.6);
          streak(c.g, base, { x: base.x + Math.cos(a) * len, y: base.y + Math.sin(a) * len }, Math.max(2, c.r * 0.08), c.accent, c.secondary, 0.6 * f);
        }
        if (rnd() < 0.8) c.emit({ x: base.x + (rnd() - 0.5) * c.r * 1.6, y: base.y }, 1, c.r * 0.8, 0.8);
      }
    },
  };
};

/** `count` expanding arcs from the attacker, fanning out as a cone towards the target. */
const sonic: ShapeSpec["make"] = (c) => ({
  draw(e) {
    const mid = Math.atan2(c.dir.y, c.dir.x);
    const half = 0.25 + c.spread * 0.9;
    const gap = (0.04 + c.trail * 0.07) * c.D;
    const R0 = c.r * 0.6;
    const segs = 22;
    ring(c.g, c.from, c.r * (0.5 + 0.4 * Math.sin(e * 20)), 2, c.accent, 0.6 * (1 - clamp01(e / c.L)));
    for (let i = 0; i < c.n; i++) {
      const t = e - i * gap;
      if (t <= 0) continue;
      const R = R0 + (c.dist - R0) * (t / c.L);
      const alpha = (1 - clamp01((R - c.dist) / (c.r * 3))) * (1 - (i / c.n) * 0.5);
      if (alpha <= 0) continue;
      const pts = Array.from({ length: segs + 1 }, (_, j) => {
        const ang = mid - half + (2 * half * j) / segs;
        const rad = R + Math.sin(j * 1.7 + e * c.spinRate) * c.r * 0.18 * c.spin;
        return { x: c.from.x + Math.cos(ang) * rad, y: c.from.y + Math.sin(ang) * rad };
      });
      for (let j = 0; j < segs; j++) {
        const w = Math.max(2, c.r * 0.38 * Math.sin((Math.PI * (j + 0.5)) / segs) * (1 - (i / c.n) * 0.4));
        streak(c.g, pts[j]!, pts[j + 1]!, w, c.primary, c.secondary, alpha);
      }
    }
  },
});

/** A funnel of turning rings travels to the target, then unwinds there. */
const tornado: ShapeSpec["make"] = (c) => {
  const height = c.r * 4.5;
  const layers = 10;
  const centreAt = (u: number): Point => {
    const p = c.along(u);
    const w = Math.sin(u * 9) * Math.sin(Math.PI * u) * c.arc * c.r * 1.2;
    return { x: p.x + c.normal.x * w, y: p.y + c.normal.y * w };
  };
  return {
    draw(e) {
      const t = clamp01(e / c.L);
      const k = c.landed ? clamp01((e - c.L) / c.impactLen) : 0;
      const foot = c.landed ? c.to : centreAt(easeIn(t) * 0.5 + t * 0.5);
      const scale = 1 - easeIn(k) * 0.85;
      const a = (1 - k * k) * easeOut(e / (0.2 * c.L));
      for (let j = 0; j < layers; j++) {
        const f = j / (layers - 1);
        const x = foot.x + Math.sin(e * 8 + f * 5) * c.r * 0.15;
        const y = foot.y - f * height * scale;
        const rad = c.r * (0.25 + f * (0.55 + c.spread * 0.9)) * scale;
        c.g.ellipse(x, y, rad, rad * 0.32).stroke({ width: Math.max(2, c.r * 0.1), color: mix(c.primary, c.secondary, f), alpha: a * (0.3 + 0.4 * f) });
        for (let q = 0; q < c.n; q++) {
          const ang = e * c.spinRate * (1 + f * 0.3) + (q / c.n) * TAU + f * 2;
          const front = Math.sin(ang) > 0;
          c.g.circle(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad * 0.32, c.r * (front ? 0.11 : 0.07)).fill({ color: front ? c.accent : c.secondary, alpha: a * (front ? 0.9 : 0.45) });
        }
      }
      if (rnd() < 0.2 + c.trail * 0.7) c.emit({ x: foot.x + (rnd() - 0.5) * c.r, y: foot.y }, 1, c.r * 1.5, 0.5);
    },
  };
};

/** When each shape lands, how big its impact is, and how it is drawn. */
export const STRIKE_SHAPES: Record<StrikeShape, ShapeSpec> = {
  slash: { land: 0.3, big: 1, impact: "light", make: cuts(1, true) },
  claw: { land: 0.3, big: 1, impact: "light", make: cuts(1.15, false) },
  whirlwind: { land: 0.5, big: 1.3, impact: "full", make: whirlwind },
  slam: { land: 0.45, big: 1.8, impact: "full", make: slam },
  shadow: { land: 0.5, big: 1, impact: "light", make: shadow },
  projectile: { land: 0.55, big: 1, impact: "full", make: flyer("projectile") },
  volley: { land: 0.6, big: 1, impact: "light", make: volley },
  dagger: { land: 0.5, big: 1, impact: "light", make: dagger },
  fireball: { land: 0.5, big: 2.2, impact: "full", make: flyer("fireball") },
  meteor: { land: 0.55, big: 1.8, impact: "full", make: flyer("meteor") },
  explosion: { land: 0.55, big: 2.4, impact: "full", make: explosion },
  bolt: { land: 0.6, big: 1.5, impact: "full", make: flyer("bolt") },
  chain: { land: 0.3, big: 1.2, impact: "full", make: chain },
  beam: { land: 0.25, big: 1, impact: "light", make: beam },
  frost: { land: 0.45, big: 1.3, impact: "light", make: frost },
  poison: { land: 0.5, big: 1.2, impact: "light", make: poison },
  smite: { land: 0.5, big: 1.4, impact: "full", make: smite },
  sonic: { land: 0.45, big: 1.3, impact: "full", make: sonic },
  tornado: { land: 0.55, big: 1.6, impact: "light", make: tornado },
};
