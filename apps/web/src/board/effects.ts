import type { ConditionId, DomainEvent, Participant, RoomState } from "@vtt/shared";

/**
 * What the board draws for attacks and conditions (KAN-76). Pure: no Pixi, no DOM beyond
 * `matchMedia`, so which events animate, and for whom, is unit-testable. `BoardView` turns
 * these descriptions into graphics.
 */

// ---------- attacks ----------

/** An attack animation, naming tokens by id so it follows them while it plays. */
export type AttackEffect =
  | { kind: "strike"; fromId: string; toId: string }
  | { kind: "hit" | "miss"; tokenId: string }
  | { kind: "damage"; tokenId: string; amount: number };

/**
 * The animation a live event should trigger for this viewer, or null. Only reads the viewer's own
 * copy of the room: a side that is null, a token that is absent, or a hidden token (for a player)
 * means nothing plays, so an animation can never point at something the viewer may not see (FR-GM-23).
 * `after` is the viewer's state with the event applied.
 */
export function attackEffectFor(event: DomainEvent, after: RoomState, viewer: Participant): AttackEffect | null {
  const visible = (tokenId: string) => {
    const token = after.tokens[tokenId];
    return token !== undefined && (viewer.role === "gm" || !token.hidden);
  };
  switch (event.type) {
    case "DiceRolled": {
      // The server never sends a player a GM-only roll; refuse one anyway if it ever did.
      if (viewer.role !== "gm" && event.roll.visibility === "gm") return null;
      const { actor, target } = event.roll.attack ?? {};
      if (!actor || !target || !visible(actor.tokenId) || !visible(target.tokenId)) return null;
      return { kind: "strike", fromId: actor.tokenId, toId: target.tokenId };
    }
    case "RollRuled": {
      if (!event.verdict) return null;
      const tokenId = targetOf(after, event.rollId, visible);
      return tokenId ? { kind: event.verdict, tokenId } : null;
    }
    case "RollDamageApplied": {
      const tokenId = targetOf(after, event.rollId, visible);
      // "−0" says nothing.
      return tokenId && event.amount > 0 ? { kind: "damage", tokenId, amount: event.amount } : null;
    }
    default:
      return null;
  }
}

/**
 * The target of an attack roll whose both sides this viewer can see, or null. A ruling on
 * "Unknown → Aria" plays nothing: the spec allows no attack animation once either side is hidden.
 */
function targetOf(state: RoomState, rollId: string, visible: (tokenId: string) => boolean): string | null {
  const attack = state.rolls.find((roll) => roll.id === rollId)?.attack;
  if (!attack?.actor || !attack.target || !visible(attack.actor.tokenId)) return null;
  return visible(attack.target.tokenId) ? attack.target.tokenId : null;
}

/** Attack effects playing at once; past this the oldest is dropped. */
export const MAX_ATTACK_EFFECTS = 8;

export interface AttackPlan {
  /** False: a static marker on the target, nothing travels (reduced motion). */
  motion: boolean;
  durationMs: number;
}

/** How long an effect lasts and whether it moves. Every effect is over in 1.2 s or less. */
export function attackPlan(effect: AttackEffect, reducedMotion: boolean): AttackPlan {
  if (reducedMotion) return { motion: false, durationMs: effect.kind === "damage" ? 1000 : 600 };
  switch (effect.kind) {
    case "strike": return { motion: true, durationMs: 700 };
    case "damage": return { motion: true, durationMs: 1200 };
    default: return { motion: true, durationMs: 600 };
  }
}

/** Share of a strike spent travelling; the rest is the impact on the target. */
export const STRIKE_TRAVEL = 0.6;

// ---------- reduced motion ----------

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const mediaQuery = () => (typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : null);

export function prefersReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false;
}

/** Calls `listener` whenever the preference changes; returns the unsubscribe. */
export function watchReducedMotion(listener: (reduced: boolean) => void): () => void {
  const query = mediaQuery();
  if (!query) return () => {};
  const onChange = (e: MediaQueryListEvent) => listener(e.matches);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// ---------- conditions ----------

/** One piece of a condition effect, in token-local coordinates (the token's centre is 0,0). */
export type EffectShape =
  | { kind: "circle"; x: number; y: number; r: number; fill?: number; stroke?: number; width?: number; alpha: number }
  | { kind: "poly"; points: number[]; closed: boolean; fill?: number; stroke?: number; width?: number; alpha: number };

/** How a condition changes the token's art (the wrapper inside the token, never its position). */
export interface ArtStyle {
  alpha: number;
  /** Degrees, on top of the token's own rotation. */
  tilt: number;
  /** Vertical squash of the art; 1 is none. */
  squash: number;
  greyscale: boolean;
  /** Jitter amplitude as a share of the radius; 0 is none. */
  tremble: number;
}

export interface ConditionEffectSpec {
  /** Whether `draw` changes with time; false means a single static drawing. */
  loops: boolean;
  art: Partial<ArtStyle>;
  /** The decoration at `t` seconds for a token of radius `r`; `REST_TIME` is the static pose. */
  draw(t: number, r: number): EffectShape[];
}

/** The time at which a looping effect is drawn when it may not move: a pose that reads well still. */
export const REST_TIME = 0.6;

const TAU = Math.PI * 2;
const frac = (n: number) => n - Math.floor(n);

/** Points along an arc, for an open stroked polyline. */
function arcPoints(radius: number, from: number, to: number, steps = 10): number[] {
  const points: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    points.push(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  return points;
}

const arc = (radius: number, from: number, to: number, color: number, width: number, alpha: number): EffectShape => ({
  kind: "poly", points: arcPoints(radius, from, to), closed: false, stroke: color, width, alpha,
});

/** A heart of width `s` whose centre is at x, y. */
function heart(x: number, y: number, s: number, color: number, alpha: number): EffectShape[] {
  return [
    { kind: "circle", x: x - s * 0.25, y: y - s * 0.15, r: s * 0.27, fill: color, alpha },
    { kind: "circle", x: x + s * 0.25, y: y - s * 0.15, r: s * 0.27, fill: color, alpha },
    { kind: "poly", points: [x - s * 0.5, y - s * 0.05, x + s * 0.5, y - s * 0.05, x, y + s * 0.5], closed: true, fill: color, alpha },
  ];
}

/** A five-pointed star of outer radius `s` centred on x, y. */
function star(x: number, y: number, s: number, fill: number, stroke: number, alpha: number): EffectShape {
  const points: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 === 0 ? s : s * 0.45;
    points.push(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  return { kind: "poly", points, closed: true, fill, stroke, width: 1, alpha };
}

const NONE: EffectShape[] = [];

/**
 * The one fixed effect of each condition (FR-TAC-08 badges are separate and unchanged). Typed as a
 * total record: a new ConditionId without an effect fails typecheck. Colour and motion are
 * decoration; each effect also differs in shape and place.
 */
export const CONDITION_EFFECTS: Record<ConditionId, ConditionEffectSpec> = {
  blinded: {
    loops: false,
    art: {},
    // A dark veil over the upper half of the token.
    draw: (_t, r) => [{ kind: "poly", points: arcPoints(r, Math.PI, TAU, 16), closed: true, fill: 0x000000, alpha: 0.55 }],
  },
  charmed: {
    loops: true,
    art: {},
    draw: (t, r) => [0, 1, 2].flatMap((i) => {
      const p = frac(t * 0.4 + i / 3);
      return heart(r * (-0.45 + i * 0.45) + Math.sin(t * 2 + i) * r * 0.06, r * 0.4 - p * r * 1.3, r * 0.3, 0xf472b6, Math.sin(p * Math.PI) * 0.9);
    }),
  },
  frightened: {
    loops: true,
    art: { tremble: 0.03 },
    // Sweat drops at the temples; the token itself trembles.
    draw: (t, r) => [-1, 1].map((side): EffectShape => {
      const x = side * r * 0.75;
      const y = -r * 0.55 + Math.sin(t * 6 + side) * r * 0.03;
      const s = r * 0.14;
      return { kind: "poly", points: [x, y - s * 1.6, x + s, y, x, y + s, x - s, y], closed: true, fill: 0x93c5fd, stroke: 0x1e3a8a, width: 1, alpha: 0.9 };
    }),
  },
  grappled: {
    loops: true,
    art: {},
    // Four ring segments that tighten and loosen.
    draw: (t, r) => [0, 1, 2, 3].map((i) => {
      const a = (i * TAU) / 4 + t * 0.4;
      return arc(r + 2 - (0.5 + 0.5 * Math.sin(t * 3)) * r * 0.08, a, a + TAU / 6, 0x22d3ee, 4, 0.9);
    }),
  },
  invisible: {
    loops: true,
    art: { alpha: 0.35 },
    // A shimmering broken edge around the faded token.
    draw: (t, r) => [0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i * TAU) / 6 + t * 0.6;
      return arc(r + 1, a, a + TAU / 14, 0xe2e8f0, 2, 0.35 + 0.35 * Math.sin(t * 3 + i * 1.7));
    }),
  },
  paralyzed: {
    loops: false,
    art: {},
    // Static yellow sparks round the rim.
    draw: (_t, r) => [0.3, 1.9, 3.6, 5.2].map((a): EffectShape => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const at = (d: number, off: number) => [c * d - s * off, s * d + c * off];
      return { kind: "poly", points: [...at(r * 0.75, 0), ...at(r * 0.92, r * 0.08), ...at(r * 0.98, -r * 0.05), ...at(r * 1.18, r * 0.06)], closed: false, stroke: 0xfacc15, width: 2.5, alpha: 1 };
    }),
  },
  poisoned: {
    loops: true,
    art: {},
    // Green bubbles rising and fading.
    draw: (t, r) => [0, 1, 2, 3, 4].map((i): EffectShape => {
      const p = frac(t * 0.5 + i / 5);
      return {
        kind: "circle",
        x: r * (((i * 0.37) % 1) * 1.2 - 0.6) + Math.sin(t * 2 + i * 2) * r * 0.05,
        y: r * 0.6 - p * r * 1.4,
        r: r * (0.07 + 0.025 * (i % 3)),
        fill: 0x4ade80, stroke: 0x166534, width: 1,
        alpha: Math.sin(p * Math.PI) * 0.85,
      };
    }),
  },
  prone: {
    loops: false,
    // Knocked over: the art lies tilted and flattened.
    art: { tilt: 70, squash: 0.8 },
    draw: () => NONE,
  },
  restrained: {
    loops: false,
    art: {},
    // A ring of chain links.
    draw: (_t, r) => Array.from({ length: 10 }, (_, i): EffectShape => {
      const a = (i * TAU) / 10;
      return { kind: "circle", x: Math.cos(a) * r * 0.92, y: Math.sin(a) * r * 0.92, r: Math.max(2.5, r * 0.09), stroke: 0xa78bfa, width: 2.5, alpha: 0.95 };
    }),
  },
  stunned: {
    loops: true,
    art: {},
    // Stars circling above the token.
    draw: (t, r) => [0, 1, 2].map((i) => {
      const a = t * 2.5 + (i * TAU) / 3;
      return star(Math.cos(a) * r * 0.6, -r * 0.95 + Math.sin(a) * r * 0.15, r * 0.17, 0xfde047, 0xa16207, 1);
    }),
  },
  unconscious: {
    loops: false,
    art: { greyscale: true },
    // A drifting "Zz", drawn still.
    draw: (_t, r) => {
      const z = (x: number, y: number, s: number): EffectShape => ({
        kind: "poly", points: [x - s, y - s, x + s, y - s, x - s, y + s, x + s, y + s], closed: false, stroke: 0xffffff, width: Math.max(2, s * 0.35), alpha: 0.95,
      });
      return [z(r * 0.55, -r * 0.55, r * 0.17), z(r * 0.85, -r * 0.95, r * 0.11)];
    },
  },
  concentrating: {
    loops: true,
    art: {},
    draw: (t, r) => [{ kind: "circle", x: 0, y: 0, r: r + 4 + Math.sin(t * 3) * 3, stroke: 0x3b82f6, width: 3, alpha: 0.65 + 0.3 * Math.sin(t * 3) }],
  },
};

/** The shapes for a token's conditions at `t` seconds, in condition order. */
export function conditionShapes(conditions: readonly ConditionId[], t: number, r: number): EffectShape[] {
  return conditions.flatMap((id) => CONDITION_EFFECTS[id].draw(t, r));
}

/** Conditions whose effect changes over time. */
export function loopingConditions(conditions: readonly ConditionId[]): ConditionId[] {
  return conditions.filter((id) => CONDITION_EFFECTS[id].loops || CONDITION_EFFECTS[id].art.tremble);
}

/** The combined art style for a token's conditions. Under reduced motion nothing trembles. */
export function artStyleFor(conditions: readonly ConditionId[], reducedMotion: boolean): ArtStyle {
  const style: ArtStyle = { alpha: 1, tilt: 0, squash: 1, greyscale: false, tremble: 0 };
  for (const id of conditions) {
    const art = CONDITION_EFFECTS[id].art;
    style.alpha = Math.min(style.alpha, art.alpha ?? 1);
    style.tilt = art.tilt ?? style.tilt;
    style.squash = Math.min(style.squash, art.squash ?? 1);
    style.greyscale ||= art.greyscale ?? false;
    style.tremble = Math.max(style.tremble, art.tremble ?? 0);
  }
  if (reducedMotion) style.tremble = 0;
  return style;
}

// ---------- render budget ----------

/** Condition loops draw at most this often: 30 frames a second, whatever the display's rate. */
export const LOOP_INTERVAL_MS = 1000 / 30;

/** Whether the condition loop should be running at all (design Decision 6). */
export function conditionLoopWanted(input: { loopingTokens: number; pageVisible: boolean; reducedMotion: boolean }): boolean {
  return input.loopingTokens > 0 && input.pageVisible && !input.reducedMotion;
}

/** True when enough time has passed since `last` for the next loop frame. */
export function loopFrameDue(now: number, last: number): boolean {
  return now - last >= LOOP_INTERVAL_MS;
}
