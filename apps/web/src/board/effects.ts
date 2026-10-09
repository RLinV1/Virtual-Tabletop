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

/** How long an effect lasts and whether it moves. Every effect is over in 1.5 s or less. */
export function attackPlan(effect: AttackEffect, reducedMotion: boolean): AttackPlan {
  if (reducedMotion) return { motion: false, durationMs: effect.kind === "damage" ? 1000 : 600 };
  switch (effect.kind) {
    case "strike": return { motion: true, durationMs: 1150 };
    case "damage": return { motion: true, durationMs: 1500 };
    default: return { motion: true, durationMs: 900 };
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
  /** The change to the token's own art, drawn on the board canvas. */
  art: Partial<ArtStyle>;
}

/**
 * The art change of each condition (FR-TAC-08 badges are separate and unchanged). Typed as a total
 * record: a new ConditionId without an entry fails typecheck. The particles and motion that go with
 * a condition are drawn by the React overlay from `effectPresets.ts`.
 */
export const CONDITION_EFFECTS: Record<ConditionId, ConditionEffectSpec> = {
  blinded: { art: {} },
  charmed: { art: {} },
  frightened: { art: { tremble: 0.03 } },
  grappled: { art: {} },
  invisible: { art: { alpha: 0.35 } },
  paralyzed: { art: {} },
  poisoned: { art: {} },
  // Knocked over: the art lies tilted and flattened.
  prone: { art: { tilt: 70, squash: 0.8 } },
  restrained: { art: {} },
  stunned: { art: {} },
  unconscious: { art: { greyscale: true } },
  concentrating: { art: {} },
};

/** Conditions whose art moves over time, so the board must keep redrawing. */
export function loopingConditions(conditions: readonly ConditionId[]): ConditionId[] {
  return conditions.filter((id) => CONDITION_EFFECTS[id].art.tremble);
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
