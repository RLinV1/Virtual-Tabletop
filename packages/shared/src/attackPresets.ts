import { z } from "zod";
import { MAX_ATTACK_LABEL } from "./dice";

/** Named rolls copied from a creature into a placed token (KAN-70). */
export const MAX_TOKEN_ATTACKS = 8;
export const AttackDice = z.object({
  count: z.number().int().min(1).max(20),
  sides: z.number().int().refine((s) => [4, 6, 8, 10, 12, 20, 100].includes(s), { message: "Choose a supported die" }),
  modifier: z.number().int().min(-99).max(99),
});
export type AttackDice = z.infer<typeof AttackDice>;
export const AttackPreset = z.object({
  name: z.string().trim().min(1).max(MAX_ATTACK_LABEL),
  toHit: AttackDice.nullable(),
  damage: AttackDice.nullable(),
}).refine((a) => a.toHit !== null || a.damage !== null, { message: "An attack needs a to-hit or damage roll" });
export type AttackPreset = z.infer<typeof AttackPreset>;
export const TokenAttacks = z.array(AttackPreset).max(MAX_TOKEN_ATTACKS).refine(
  (attacks) => new Set(attacks.map((a) => a.name.toLowerCase())).size === attacks.length,
  { message: "Attack names must be unique" },
);
