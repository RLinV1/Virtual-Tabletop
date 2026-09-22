import { z } from "zod";

/**
 * Dice expressions of the form `NdX + M` (FR-TAC-09).
 *
 * Deliberately small: the tabletop rolls people actually make in an encounter are
 * `1d20+5`, `2d6`, `4d6-1`. Anything larger is a calculator, not a VTT feature.
 *
 * Parsing is pure and lives here so the client can validate the input box before
 * sending, while the server re-parses and rolls — the client's parse is a hint, the
 * server's is authoritative (FR-GM-15).
 */

export const MAX_DICE = 20;
export const MAX_SIDES = 1000;

export const DiceExpression = z.object({
  /** Number of dice; 1 when the expression omits it (`d20`). */
  count: z.number().int().min(1).max(MAX_DICE),
  /** Faces per die. */
  sides: z.number().int().min(2).max(MAX_SIDES),
  /** Flat modifier, may be negative or zero. */
  modifier: z.number().int().min(-999).max(999),
});
export type DiceExpression = z.infer<typeof DiceExpression>;

export const DiceVisibility = z.enum(["public", "gm"]);
export type DiceVisibility = z.infer<typeof DiceVisibility>;

export const DiceRoll = z.object({
  id: z.string().min(1).max(64),
  /** The expression as typed, echoed back so the log reads the way the roller wrote it. */
  expression: z.string().min(1).max(32),
  /** Who rolled. */
  byParticipantId: z.string().min(1).max(64),
  /** Individual die results, in roll order. */
  dice: z.array(z.number().int().positive()).min(1).max(MAX_DICE),
  modifier: z.number().int(),
  total: z.number().int(),
  /** `gm` rolls are never sent to players (FR-GM-22). */
  visibility: DiceVisibility,
});
export type DiceRoll = z.infer<typeof DiceRoll>;

const PATTERN = /^\s*(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?\s*$/i;

export type ParseResult =
  | { ok: true; expression: DiceExpression }
  | { ok: false; message: string };

/** `NdX`, `NdX+M`, `NdX-M`, or `dX`. Whitespace and case are ignored. */
export function parseDiceExpression(input: string): ParseResult {
  const match = PATTERN.exec(input);
  if (!match) return { ok: false, message: "Use NdX, NdX+M or NdX-M — for example 1d20+5" };

  const count = match[1] === "" ? 1 : Number(match[1]);
  const sides = Number(match[2]);
  const modifier = match[3] ? Number(match[4]) * (match[3] === "-" ? -1 : 1) : 0;

  if (count < 1 || count > MAX_DICE) return { ok: false, message: `Roll between 1 and ${MAX_DICE} dice` };
  if (sides < 2 || sides > MAX_SIDES) return { ok: false, message: `Dice need 2 to ${MAX_SIDES} sides` };

  const parsed = DiceExpression.safeParse({ count, sides, modifier });
  if (!parsed.success) return { ok: false, message: "That expression is out of range" };
  return { ok: true, expression: parsed.data };
}

/**
 * Rolls an expression. `random` must return a float in [0, 1) — it is injected rather than
 * taken from `Math.random` so `decide` stays deterministic and testable (CLAUDE.md §2).
 */
export function rollDice(expression: DiceExpression, random: () => number): { dice: number[]; total: number } {
  const dice = Array.from({ length: expression.count }, () => 1 + Math.floor(random() * expression.sides));
  const total = dice.reduce((sum, d) => sum + d, 0) + expression.modifier;
  return { dice, total };
}

/** Canonical text form, for the roll log. */
export function formatExpression(e: DiceExpression): string {
  const mod = e.modifier === 0 ? "" : e.modifier > 0 ? `+${e.modifier}` : `${e.modifier}`;
  return `${e.count}d${e.sides}${mod}`;
}
