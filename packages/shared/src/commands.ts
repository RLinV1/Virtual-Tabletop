import { z } from "zod";
import { ConditionId, EMPTY_STATS, TokenStats } from "./conditions";
import { DiceVisibility } from "./dice";
import { GridSpec, Point } from "./geometry";
import { AreaShape, Id, MapImage } from "./state";

/**
 * Commands are REQUESTS from a client. The server validates and authorizes them,
 * then turns each accepted command into one or more committed events.
 * Naming: `noun.verb`, imperative.
 */
/** Colour of a new token when none is given; the Add token preview draws the same disc. */
export const DEFAULT_TOKEN_COLOR = "#c0392b";

/** Upper bound on tokens resolved in one `participant.resolveDeparture`. */
export const MAX_DEPARTURE_ACTIONS = 200;

/** One token's fate after its owner left. "Decide later" is simply not sending an action. */
export const DepartureAction = z.discriminatedUnion("action", [
  /** Replace the departed player with `to` in the owners; other co-owners stay. */
  z.object({ tokenId: Id, action: z.literal("reassign"), to: Id }),
  /** Drop the departed player from the owners. */
  z.object({ tokenId: Id, action: z.literal("unassign") }),
  z.object({ tokenId: Id, action: z.literal("delete") }),
]);
export type DepartureAction = z.infer<typeof DepartureAction>;

export const Command = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("scene.setMap"),
    map: MapImage,
    /** A library map's saved grid, copied into the room in the same event (ADR 0004). */
    grid: GridSpec.optional(),
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
    rotation: z.number().finite().default(0),
    stats: TokenStats.default(EMPTY_STATS),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(DEFAULT_TOKEN_COLOR),
    imageUrl: z.string().max(2048).nullable().default(null),
    assetId: Id.nullable().default(null),
    ownerIds: z.array(Id).default([]),
    hidden: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("token.move"),
    tokenId: Id,
    to: Point,
  }),
  /** GM edits the identity and footprint of a placed token in one event. */
  z.object({
    type: z.literal("token.setAppearance"),
    tokenId: Id,
    name: z.string().min(1).max(60),
    size: z.number().positive().max(10),
    rotation: z.number().finite(),
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
  /** Replace or remove a token's art (ADR 0008). GM only, like choosing it at creation. */
  z.object({
    type: z.literal("token.setImage"),
    tokenId: Id,
    imageUrl: z.string().min(1).max(2048).nullable(),
    /** Library asset the image came from, if any (ADR 0004). */
    assetId: Id.nullable().default(null),
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
  /** Place an area template for the table to see (FR-TAC-06, ADR 0007). Only the GM may make it GM-only. */
  z.object({
    type: z.literal("template.place"),
    shape: AreaShape,
    origin: Point,
    toward: Point,
    size: z.number().positive().max(1000),
    gmOnly: z.boolean().default(false),
  }),
  /** Remove a placed template. Its owner or the GM. */
  z.object({
    type: z.literal("template.remove"),
    templateId: Id,
  }),
  /** A player permanently gives up their seat (KAN-58, ADR 0006). The GM cannot leave. */
  z.object({
    type: z.literal("participant.leave"),
  }),
  /** GM removes a player from the room for good (FR-GM-20, ADR 0006). Tokens are left for the review. */
  z.object({
    type: z.literal("participant.revoke"),
    participantId: Id,
  }),
  /** GM decides, token by token, what happens to what a departed player owned (ADR 0006). */
  z.object({
    type: z.literal("participant.resolveDeparture"),
    participantId: Id,
    actions: z.array(DepartureAction).min(1).max(MAX_DEPARTURE_ACTIONS),
  }),
]);
export type Command = z.infer<typeof Command>;
/** Command as a client writes it (defaults not yet applied). */
export type CommandInput = z.input<typeof Command>;
export type CommandType = Command["type"];
