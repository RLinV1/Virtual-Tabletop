import type { DiceRoll, Point } from "@vtt/shared";

/** How long a dice drop waits for its roll (ADR 0014). */
export const DROP_WAIT_MS = 5000;

/** Where someone let a die go over the map: the roll it belongs to is on its way. */
export interface DiceDrop {
  expression: string;
  from: Point;
  to: Point;
}

interface Waiting extends DiceDrop {
  at: number;
}

/**
 * Dice drops waiting for their rolls (throw-dice-on-board, ADR 0014): this viewer's own, and
 * those relayed from everyone else. Kept in order per thrower, because one person can let go of
 * several dice before the first roll comes back, and each roll must land at its own drop.
 *
 * A thrower's drops and rolls reach every viewer in the order they were sent, so a roll belongs
 * to its thrower's oldest waiting drop of the same expression. Any older drop before that one
 * made no roll (the server refused it) and is dropped.
 */
export class PendingDrops {
  private byThrower = new Map<string, Waiting[]>();

  /** Keep a drop until its roll arrives. Returns a function that forgets it, for a refused roll. */
  add(thrower: string, drop: DiceDrop, now: number): () => void {
    const waiting: Waiting = { ...drop, at: now };
    this.byThrower.set(thrower, [...this.live(thrower, now), waiting]);
    return () => this.byThrower.set(thrower, (this.byThrower.get(thrower) ?? []).filter((d) => d !== waiting));
  }

  /** The drop this roll was thrown with, if it is still waiting; it is used up. */
  take(roll: Pick<DiceRoll, "byParticipantId" | "expression">, now: number): DiceDrop | undefined {
    const waiting = this.live(roll.byParticipantId, now);
    const i = waiting.findIndex((d) => d.expression === roll.expression);
    this.byThrower.set(roll.byParticipantId, i < 0 ? waiting : waiting.slice(i + 1));
    if (i < 0) return undefined;
    const { expression, from, to } = waiting[i]!;
    return { expression, from, to };
  }

  /** A thrower's drops that haven't waited too long. */
  private live(thrower: string, now: number): Waiting[] {
    return (this.byThrower.get(thrower) ?? []).filter((d) => now - d.at <= DROP_WAIT_MS);
  }
}
