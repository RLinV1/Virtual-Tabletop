import { z } from "zod";
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
    type: z.literal("participant.rename"),
    displayName: z.string().min(1).max(40),
  }),
]);
export type Command = z.infer<typeof Command>;
/** Command as a client writes it (defaults not yet applied). */
export type CommandInput = z.input<typeof Command>;
export type CommandType = Command["type"];
