import { z } from "zod";
import { ConditionId, TokenStats } from "./conditions";
import { DiceVisibility } from "./dice";
import { GridSpec, Point } from "./geometry";
import { Id, MapImage } from "./state";

/**
 * Commands are REQUESTS from a client. The server validates and authorizes them,
 * then turns each accepted command into one or more committed events.
 * Naming: `noun.verb`, imperative.
 */
export const Command = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("scene.setMap"),
    map: MapImage,
  }),
  z.object({
    type: z.literal("scene.setGrid"),
    grid: GridSpec,
  }),
  z.object({
    type: z.literal("token.create"),
    name: z.string().min(1).max(60),
    position: Point,
    size: z.number().positive().max(10).default(1),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#c0392b"),
    imageUrl: z.string().max(2048).nullable().default(null),
    ownerIds: z.array(Id).default([]),
    hidden: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("token.move"),
    tokenId: Id,
    to: Point,
  }),
  z.object({
    type: z.literal("token.delete"),
    tokenId: Id,
  }),
  z.object({
    type: z.literal("token.setOwners"),
    tokenId: Id,
    ownerIds: z.array(Id),
  }),
  z.object({
    type: z.literal("token.setHidden"),
    tokenId: Id,
    hidden: z.boolean(),
  }),
  z.object({
    type: z.literal("token.setStats"),
    tokenId: Id,
    stats: TokenStats,
  }),
  z.object({
    type: z.literal("token.setConditions"),
    tokenId: Id,
    conditions: z.array(ConditionId).max(12),
  }),
  /** Start or replace the turn order (FR-GM-21). Entries are sorted by score, descending. */
  z.object({
    type: z.literal("initiative.start"),
    entries: z
      .array(z.object({ tokenId: Id, score: z.number().int().min(-99).max(999) }))
      .min(1)
      .max(60),
  }),
  z.object({
    type: z.literal("initiative.advance"),
  }),
  z.object({
    type: z.literal("initiative.end"),
  }),
  /** Roll dice (FR-TAC-09). `gm` visibility is GM-only and never reaches players (FR-GM-22). */
  z.object({
    type: z.literal("dice.roll"),
    expression: z.string().min(1).max(32),
    visibility: DiceVisibility.default("public"),
  }),
  z.object({
    type: z.literal("participant.rename"),
    displayName: z.string().min(1).max(40),
  }),
]);
export type Command = z.infer<typeof Command>;
/** Command as a client writes it (defaults not yet applied). */
export type CommandInput = z.input<typeof Command>;
export type CommandType = Command["type"];
