import type { ISourceOptions } from "@tsparticles/engine";
import type { ConditionId, Point } from "@vtt/shared";

/**
 * The look of every effect the overlay draws (board-effects-overlay). Pure data and arithmetic: no
 * React, no DOM, no Pixi, so the presets can be unit-tested. `EffectsOverlay` turns them into
 * framer-motion elements and tsparticles canvases. Sizes are in board pixels; the overlay's world
 * element carries the board's zoom and pan.
 */

/** Tokens that show condition particles at once; the rest keep their badges only. */
export const MAX_CONDITION_EMITTERS = 12;

/** How the overlay draws a condition on top of the token's own art change. */
export type ConditionVisual =
  | { kind: "particles" }
  | { kind: "ring"; color: string; dashed: boolean; pulse: boolean }
  | { kind: "text"; text: string; color: string }
  | { kind: "veil" };

/** Total record: a new ConditionId without a look fails typecheck. */
export const CONDITION_VISUALS: Record<ConditionId, ConditionVisual> = {
  blinded: { kind: "veil" },
  charmed: { kind: "particles" },
  frightened: { kind: "particles" },
  grappled: { kind: "ring", color: "#22d3ee", dashed: true, pulse: true },
  invisible: { kind: "particles" },
  paralyzed: { kind: "particles" },
  poisoned: { kind: "particles" },
  // The token art lies flattened on the canvas; the overlay adds a steady amber ring so the overlay has its own mark.
  prone: { kind: "ring", color: "#f97316", dashed: false, pulse: false },
  restrained: { kind: "ring", color: "#a78bfa", dashed: true, pulse: false },
  stunned: { kind: "particles" },
  unconscious: { kind: "text", text: "Zz", color: "#ffffff" },
  concentrating: { kind: "ring", color: "#3b82f6", dashed: false, pulse: true },
};

/** Particle conditions only: the colour of the glow behind the token's particles. */
export const CONDITION_GLOW: Partial<Record<ConditionId, string>> = {
  poisoned: "rgba(74, 222, 128, 0.35)",
  charmed: "rgba(244, 114, 182, 0.3)",
  paralyzed: "rgba(250, 204, 21, 0.3)",
};

/** The box a token's particles are drawn in: the token plus room for them to rise out of it. */
export function particleBox(radius: number): { width: number; height: number; offsetX: number; offsetY: number } {
  const width = radius * 3;
  const height = radius * 3.2;
  return { width, height, offsetX: -width / 2, offsetY: -radius * 2.2 };
}

type Particles = NonNullable<ISourceOptions["particles"]>;

const BASE = {
  fullScreen: { enable: false },
  fpsLimit: 30,
  detectRetina: true,
  pauseOnBlur: true,
  pauseOnOutsideViewport: true,
  background: { color: { value: "transparent" } },
} satisfies ISourceOptions;

function emitter(radius: number, particles: Particles): ISourceOptions {
  return { ...BASE, particles };
}

/**
 * The tsparticles options for a particle condition, or null for the others. Looks the same for
 * every viewer; `reduced` gives no options at all, because reduced motion draws no particles.
 */
export function conditionParticleOptions(id: ConditionId, radius: number, reduced: boolean): ISourceOptions | null {
  if (reduced || CONDITION_VISUALS[id].kind !== "particles") return null;
  const r = Math.max(radius, 8);
  const move = (direction: "top" | "bottom" | "none", speed: number) => ({
    enable: true,
    direction,
    speed,
    straight: false,
    outModes: { default: "destroy" as const },
  });
  switch (id) {
    case "poisoned":
      // Bubbles that swell as they rise and burst.
      return emitter(r, {
        number: { value: 14, limit: { value: 18, mode: "delete" } },
        color: { value: ["#4ade80", "#86efac", "#22c55e", "#bef264"] },
        shape: { type: "circle" },
        opacity: { value: { min: 0.35, max: 0.9 }, animation: { enable: true, speed: 0.9, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.05, max: r * 0.14 }, animation: { enable: true, speed: r * 0.12, startValue: "min", destroy: "none", sync: false } },
        stroke: { width: 1, color: "#14532d", opacity: 0.6 },
        move: move("top", r * 0.1),
      });
    case "charmed":
      return emitter(r, {
        number: { value: 8, limit: { value: 10, mode: "delete" } },
        color: { value: ["#f472b6", "#fb7185", "#f9a8d4"] },
        shape: { type: "star", options: { star: { sides: 5 } } },
        opacity: { value: { min: 0.4, max: 1 }, animation: { enable: true, speed: 0.7, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.08, max: r * 0.17 } },
        move: move("top", r * 0.07),
      });
    case "frightened":
      // Cold sweat drops running down.
      return emitter(r, {
        number: { value: 6, limit: { value: 8, mode: "delete" } },
        color: { value: ["#93c5fd", "#bfdbfe"] },
        shape: { type: "circle" },
        opacity: { value: { min: 0.5, max: 0.9 }, animation: { enable: true, speed: 0.9, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.04, max: r * 0.09 } },
        move: move("bottom", r * 0.12),
      });
    case "paralyzed":
      // Short, fast yellow crackles.
      return emitter(r, {
        number: { value: 16, limit: { value: 20, mode: "delete" } },
        color: { value: ["#facc15", "#fde047", "#ffffff"] },
        shape: { type: "star", options: { star: { sides: 4 } } },
        opacity: { value: { min: 0.5, max: 1 }, animation: { enable: true, speed: 4, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.04, max: r * 0.1 } },
        move: { ...move("none", r * 0.5), random: true },
      });
    case "stunned":
      return emitter(r, {
        number: { value: 6, limit: { value: 8, mode: "delete" } },
        color: { value: ["#fde047", "#fbbf24"] },
        shape: { type: "star", options: { star: { sides: 5 } } },
        opacity: { value: { min: 0.6, max: 1 }, animation: { enable: true, speed: 0.6, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.08, max: r * 0.15 } },
        rotate: { value: { min: 0, max: 360 }, animation: { enable: true, speed: 30 } },
        move: { ...move("top", r * 0.06), random: true },
      });
    case "invisible":
      // Faint shimmer.
      return emitter(r, {
        number: { value: 10, limit: { value: 12, mode: "delete" } },
        color: { value: ["#e2e8f0", "#ffffff"] },
        shape: { type: "circle" },
        opacity: { value: { min: 0.1, max: 0.6 }, animation: { enable: true, speed: 1.2, startValue: "max", destroy: "min", sync: false } },
        size: { value: { min: r * 0.03, max: r * 0.07 } },
        move: { ...move("none", r * 0.08), random: true },
      });
    default:
      return null;
  }
}

/** The condition ids on `conditions` the overlay draws as particles. */
export function particleConditions(conditions: readonly ConditionId[]): ConditionId[] {
  return conditions.filter((id) => CONDITION_VISUALS[id].kind === "particles");
}

/**
 * Which tokens get condition particles: the `limit` nearest `centre`, so a crowded board keeps the
 * effects the viewer is looking at. Ties keep input order.
 */
export function pickEmitterTokens<T extends { position: Point }>(tokens: readonly T[], centre: Point, limit = MAX_CONDITION_EMITTERS): T[] {
  const dist = (t: T) => Math.hypot(t.position.x - centre.x, t.position.y - centre.y);
  return tokens
    .map((token, index) => ({ token, index, d: dist(token) }))
    .sort((a, b) => a.d - b.d || a.index - b.index)
    .slice(0, limit)
    .map((e) => e.token);
}

/** Unit vectors for `count` sparks, spread evenly and nudged by `seed` so bursts differ. */
export function sparkVectors(count: number, seed: number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 + (seed % 7) * 0.31;
    return { x: Math.cos(a), y: Math.sin(a) };
  });
}

/** Spark distance multipliers, so a burst has long and short rays. */
export const SPARK_REACH = [1, 0.7, 1.15, 0.8, 1.05, 0.65, 1.2, 0.75];

/** Seconds of the strike's flight and of the burst that follows, for the full-motion version. */
export const STRIKE_FLIGHT_S = 0.5;
export const IMPACT_S = 0.5;
