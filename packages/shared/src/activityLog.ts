import { z } from "zod";
import { CommittedEvent, type DomainEvent } from "./events";
import { reduce } from "./reducer";
import { emptyRoomState, type Participant, type RoomState } from "./state";
import { filterEventForViewer, filterStateForViewer } from "./visibility";

const Sequence = z.number().int().positive().safe();
const QueryInteger = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(Sequence);

/** New REST contracts; existing event and sync contracts are unchanged. */
export const HistoryQuery = z.object({
  before: QueryInteger.optional(),
  limit: QueryInteger.pipe(z.number().max(100)).default(50),
  player: z.string().trim().max(40).default(""),
}).strict();
export type HistoryQuery = z.infer<typeof HistoryQuery>;

export const ActivityLogEntry = z.object({
  committed: CommittedEvent,
  actorName: z.string(),
  sentence: z.string(),
});
export type ActivityLogEntry = z.infer<typeof ActivityLogEntry>;

export const HistoryResponse = z.object({
  entries: z.array(ActivityLogEntry).max(100),
  nextBefore: Sequence.nullable(),
});
export type HistoryResponse = z.infer<typeof HistoryResponse>;

/** A board point for a sentence: at most 2 decimals, so float noise like 829.1000000000001 reads 829.1. */
const formatPoint = (p: { x: number; y: number }) => `(${Number(p.x.toFixed(2))}, ${Number(p.y.toFixed(2))})`;

/** Pure, exhaustive sentence formatter. Context must already be viewer-filtered. */
export function formatActivity(event: DomainEvent, actorName: string, before: RoomState): string {
  /** A token's name as it was just before this event. */
  const tokenName = (id: string) => before.tokens[id]?.name ?? "an unknown token";
  /** A participant's name as it was just before this event. */
  const participantName = (id: string) => before.participants[id]?.displayName ?? "an unknown participant";
  /** "20 ft cone", in the room grid's units. */
  const templateLabel = (t: { shape: string; size: number }) =>
    `${Number(t.size.toFixed(2))} ${before.scene.grid.unitLabel} ${t.shape}`;
  switch (event.type) {
    case "RoomCreated": return `${actorName} created room ${event.name}`;
    case "ParticipantJoined": return `${actorName} joined the room as ${event.participant.role === "gm" ? "GM" : "a player"}`;
    case "ParticipantLeft": return `${event.participant.displayName} left the table`;
    case "ParticipantRenamed": return `${actorName} renamed ${event.previous} to ${event.displayName}`;
    case "MapSet": return `${actorName} ${event.previous ? "replaced" : "set"} the map${event.gridChange ? " and grid" : ""}`;
    case "GridSet": return `${actorName} updated the grid`;
    case "TokenCreated": return `${actorName} created ${event.token.name}${event.token.hidden ? " (hidden)" : ""}`;
    case "TokenMoved": return `${actorName} moved ${tokenName(event.tokenId)} from ${formatPoint(event.from)} to ${formatPoint(event.to)}`;
    case "TokenDeleted": return `${actorName} deleted ${event.token.name}`;
    case "TokenOwnersSet": return `${actorName} assigned ${tokenName(event.tokenId)} to ${event.ownerIds.length ? event.ownerIds.map(participantName).join(", ") : "no players"}`;
    case "TokenHiddenSet": return `${actorName} ${event.hidden ? "hid" : "revealed"} ${tokenName(event.tokenId)}`;
    case "TokenStatsSet": return `${actorName} updated ${tokenName(event.tokenId)}'s stats: HP ${event.stats.hp ?? "unset"}/${event.stats.maxHp ?? "unset"}, AC ${event.stats.ac ?? "unset"}`;
    case "TokenConditionsSet": return `${actorName} set ${tokenName(event.tokenId)}'s conditions to ${event.conditions.length ? event.conditions.join(", ") : "none"}`;
    case "InitiativeStarted": return `${actorName} started initiative: ${event.initiative.order.map(tokenName).join(", ") || "no tokens"}`;
    case "InitiativeAdvanced": return `${actorName} advanced to round ${event.initiative.round}, ${tokenName(event.initiative.order[event.initiative.activeIndex] ?? "")}'s turn`;
    case "InitiativeEnded": return `${actorName} ended initiative`;
    case "DiceRolled": return `${actorName} rolled ${event.roll.expression}: ${event.roll.total}${event.roll.visibility === "gm" ? " (GM only)" : ""}`;
    case "TemplatePlaced": return `${actorName} placed a ${templateLabel(event.template)}${event.template.gmOnly ? " (GM only)" : ""}`;
    case "TemplateRemoved": return `${actorName} removed a ${templateLabel(event.template)}${event.template.gmOnly ? " (GM only)" : ""}`;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

/**
 * Read-only GM history projection (FR-REC-01). Replay uses pre-event state, not today's
 * state: deleted tokens and former names remain meaningful. Never enable players by
 * removing this guard: historical visibility needs a separate disclosure policy.
 * Input is the store's ascending committed log. No ephemeral payloads enter it.
 */
export function activityHistory(
  roomId: string,
  events: readonly CommittedEvent[],
  viewer: Participant,
  query: HistoryQuery,
): HistoryResponse {
  if (viewer.role !== "gm") return { entries: [], nextBefore: null };
  const initialNames = new Map<string, string>();
  for (const { event } of events) {
    if (event.type === "ParticipantJoined") initialNames.set(event.participant.id, event.participant.displayName);
  }
  let state = emptyRoomState(roomId);
  const entries: ActivityLogEntry[] = [];
  const search = query.player.toLowerCase();
  for (const committed of events) {
    if (query.before !== undefined && committed.seq >= query.before) break;
    const filtered = filterEventForViewer(committed, state, viewer);
    if (filtered.kind === "event") {
      const visible = filterStateForViewer(state, viewer);
      const actorName = committed.actorId === null ? "System"
        : visible.participants[committed.actorId]?.displayName
          ?? initialNames.get(committed.actorId) ?? "Unknown participant";
      if (actorName.toLowerCase().includes(search)) {
        entries.push({
          committed: filtered.committed,
          actorName,
          sentence: formatActivity(filtered.committed.event, actorName, visible),
        });
      }
    }
    state = reduce(state, committed.event);
  }
  entries.reverse();
  const page = entries.slice(0, query.limit);
  return { entries: page, nextBefore: entries.length > query.limit ? page.at(-1)!.committed.seq : null };
}
