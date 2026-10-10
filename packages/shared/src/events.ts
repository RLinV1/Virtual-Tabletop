import { z } from "zod";
import { ConditionId, TokenStats } from "./conditions";
import { DiceRoll, Verdict } from "./dice";
import { GridSpec, Point } from "./geometry";
import { AreaTemplate, ChatMessage, Checkpoint, DiceLookOnTable, FogRegion, Id, Initiative, InitiativeScore, MapImage, Participant, TableState, Token, Wall } from "./state";

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
  /** A participant's dice look on the table changed; `previous` is what it replaced (invariant 6, ADR 0018). */
  z.object({
    type: z.literal("ParticipantDiceLookSet"),
    participantId: Id,
    look: DiceLookOnTable.nullable(),
    previous: DiceLookOnTable.nullable(),
  }),
  /** Carries the whole participant as it was before leaving (invariant 6, ADR 0006). */
  z.object({
    type: z.literal("ParticipantLeft"),
    participant: Participant,
  }),
  /** The GM removed this participant. Whole pre-revoke participant (invariant 6, ADR 0006). */
  z.object({
    type: z.literal("ParticipantRevoked"),
    participant: Participant,
  }),
  z.object({
    type: z.literal("MapSet"),
    map: MapImage,
    previous: MapImage.nullable(),
    /**
     * Present when the map came with its grid (a library placement, ADR 0004). One object,
     * not two optional fields, so the contract cannot express a grid change without the
     * grid it replaced (invariant 6).
     */
    gridChange: z.object({ grid: GridSpec, previous: GridSpec }).optional(),
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
    type: z.literal("TokenAppearanceSet"),
    tokenId: Id,
    name: z.string().min(1).max(60),
    size: z.number().positive().max(10),
    rotation: z.number().finite(),
    previous: z.object({ name: z.string(), size: z.number(), rotation: z.number() }),
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
  z.object({
    type: z.literal("TokenStatsSet"),
    tokenId: Id,
    stats: TokenStats,
    previous: TokenStats,
  }),
  /** A token's art changed. Carries the art it replaced, so undo can restore it (invariant 6). */
  z.object({
    type: z.literal("TokenImageSet"),
    tokenId: Id,
    imageUrl: z.string().nullable(),
    assetId: Id.nullish(),
    previous: z.object({ imageUrl: z.string().nullable(), assetId: Id.nullish() }),
  }),
  z.object({
    type: z.literal("TokenConditionsSet"),
    tokenId: Id,
    conditions: z.array(ConditionId),
    previous: z.array(ConditionId),
  }),
  z.object({
    type: z.literal("InitiativeStarted"),
    initiative: Initiative,
    previous: Initiative.nullable(),
    /**
     * The scores the GM entered, saved on their tokens, each with the value it replaced.
     * Absent on events from before scores were saved.
     */
    scores: z
      .array(z.object({ tokenId: Id, score: InitiativeScore, previous: InitiativeScore.nullable() }))
      .optional(),
  }),
  z.object({
    type: z.literal("InitiativeAdvanced"),
    initiative: Initiative,
    previous: Initiative,
  }),
  z.object({
    type: z.literal("InitiativeEnded"),
    previous: Initiative,
  }),
  z.object({
    type: z.literal("DiceRolled"),
    roll: DiceRoll,
  }),
  /** The GM ruled on a to-hit roll; `null` clears it. Carries the verdict it replaced (ADR 0011). */
  z.object({
    type: z.literal("RollRuled"),
    rollId: Id,
    verdict: Verdict.nullable(),
    previous: Verdict.nullable(),
  }),
  /**
   * The GM applied a damage roll. Follows the `TokenStatsSet` that changed the target's HP, which
   * carries the stats it replaced. No token id here, so it can pass to players (ADR 0011).
   */
  z.object({
    type: z.literal("RollDamageApplied"),
    rollId: Id,
    amount: z.number().int().min(0),
  }),
  /**
   * Undo of a damage apply (ADR 0013): the roll no longer reads Applied. Only undo emits it,
   * just before the `TokenStatsSet` that puts the HP back. The inverse of `RollDamageApplied`,
   * which carries no `previous` because it always replaces `false` (ADR 0011).
   */
  z.object({
    type: z.literal("RollDamageUnapplied"),
    rollId: Id,
    amount: z.number().int().min(0),
  }),
  /**
   * Someone sent a chat message (KAN-75, ADR 0015). The sender is the acting participant, set by
   * `decide`. Replaces nothing, so there is no `previous`; the time is the commit's `at`.
   */
  z.object({
    type: z.literal("ChatMessageSent"),
    message: ChatMessage.omit({ at: true }),
  }),
  z.object({
    type: z.literal("TemplatePlaced"),
    template: AreaTemplate,
  }),
  /** Carries the whole template as it was, so undo can restore it (invariant 6). */
  z.object({
    type: z.literal("TemplateRemoved"),
    template: AreaTemplate,
  }),
  /** The GM fogged a region of the map (FR-GM-17, ADR 0016). */
  z.object({
    type: z.literal("FogAdded"),
    region: FogRegion,
  }),
  /** Carries the whole region as it was, so undo can restore it (invariant 6). */
  z.object({
    type: z.literal("FogRemoved"),
    region: FogRegion,
  }),
  /** The GM applied walls (FR-GM-11, ADR 0027). The inverse of `WallsRemoved`. */
  z.object({
    type: z.literal("WallsAdded"),
    walls: z.array(Wall).min(1),
  }),
  /** Walls were removed. Carries each one whole, so undo can restore them (invariant 6). */
  z.object({
    type: z.literal("WallsRemoved"),
    walls: z.array(Wall).min(1),
  }),
  /** The GM saved a named restore point (FR-REC-02, ADR 0019). */
  z.object({
    type: z.literal("CheckpointCreated"),
    checkpoint: Checkpoint,
  }),
  /**
   * The GM put the board back as it was at a checkpoint (ADR 0019). Carries the board it
   * replaced (invariant 6), so the restore itself can be undone. GM-only: players resync.
   */
  z.object({
    type: z.literal("CheckpointRestored"),
    checkpointId: Id,
    name: z.string(),
    restored: TableState,
    previous: TableState,
  }),
  /**
   * The GM replaced the board with a saved encounter template (FR-GM-13, ADR 0024). `applied` is
   * the new board, with fresh token ids; `previous` is the board it replaced (invariant 6), so
   * the apply can be undone. GM-only: players resync.
   */
  z.object({
    type: z.literal("EncounterApplied"),
    templateId: Id,
    name: z.string(),
    applied: TableState,
    previous: TableState,
  }),
  /**
   * The GM undid one earlier action (FR-REC-02, ADR 0013). Comes last in its batch, after the
   * compensating events that restored the old values. `commandId` names the undone action; its
   * details are in the undo history of the state just before this event.
   */
  z.object({
    type: z.literal("ActionUndone"),
    commandId: Id,
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
  /**
   * The server's id for the command (or system batch) that produced this event, shared by every
   * event of that batch, so undo reverses a command as one unit (ADR 0013). Absent on events
   * committed before undo existed, and on events sent to players.
   */
  commandId: Id.optional(),
  event: DomainEvent,
});
export type CommittedEvent = z.infer<typeof CommittedEvent>;
