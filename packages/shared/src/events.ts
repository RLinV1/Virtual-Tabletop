import { z } from "zod";
import { GridSpec, Point } from "./geometry";
import { Id, MapImage, Participant, Token } from "./state";

/**
 * Events are FACTS the server has committed. They are append-only and never edited.
 * Naming: PastTense.
 *
 * Rule: every event that changes existing data carries the value it replaced
 * (`previous`, `from`, the full deleted entity, ...). That makes the log
 * human-readable (FR-REC-01) and lets undo be a compensating event (FR-REC-02/03)
 * without re-reading older history.
 */
export const DomainEvent = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("RoomCreated"),
    name: z.string(),
  }),
  z.object({
    type: z.literal("ParticipantJoined"),
    participant: Participant,
  }),
  z.object({
    type: z.literal("ParticipantRenamed"),
    participantId: Id,
    displayName: z.string(),
    previous: z.string(),
  }),
  z.object({
    type: z.literal("MapSet"),
    map: MapImage,
    previous: MapImage.nullable(),
  }),
  z.object({
    type: z.literal("GridSet"),
    grid: GridSpec,
    previous: GridSpec,
  }),
  z.object({
    type: z.literal("TokenCreated"),
    token: Token,
  }),
  z.object({
    type: z.literal("TokenMoved"),
    tokenId: Id,
    from: Point,
    to: Point,
  }),
  z.object({
    type: z.literal("TokenDeleted"),
    token: Token,
  }),
  z.object({
    type: z.literal("TokenOwnersSet"),
    tokenId: Id,
    ownerIds: z.array(Id),
    previous: z.array(Id),
  }),
  z.object({
    type: z.literal("TokenHiddenSet"),
    tokenId: Id,
    hidden: z.boolean(),
    previous: z.boolean(),
  }),
]);
export type DomainEvent = z.infer<typeof DomainEvent>;
export type DomainEventType = DomainEvent["type"];

/** An event after the server has ordered and persisted it. */
export const CommittedEvent = z.object({
  /** Per-room, gap-free, strictly increasing, starting at 1 (FR-SYNC-04). */
  seq: z.number().int().positive(),
  /** ISO-8601 server timestamp. */
  at: z.string(),
  /** Participant who caused it; null for system events. */
  actorId: Id.nullable(),
  event: DomainEvent,
});
export type CommittedEvent = z.infer<typeof CommittedEvent>;
