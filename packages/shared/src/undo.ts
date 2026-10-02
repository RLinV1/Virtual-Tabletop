import { formatAttackParties } from "./dice";
import type { CommittedEvent, DomainEvent } from "./events";
import type { RoomState } from "./state";

/**
 * Undo for reversible actions (FR-REC-02, FR-REC-03, ADR 0013).
 *
 * An action is one command's batch of events, grouped by the server-assigned `commandId`.
 * `reduce` keeps a short history of recent undoable actions in `RoomState.undo`. The GM
 * picks one from the activity log, and `decide` turns `history.undo` into its inverse events
 * plus an `ActionUndone`.
 *
 * To make another event type reversible: add it to REVERSIBLE_EVENT_TYPES, give it an
 * inverse in `inverseOf`, a conflict check in `undoConflict`, and a phrase in `describeUndo`.
 */

/** How many undoable actions a room keeps. Older ones can no longer be undone. */
export const UNDO_HISTORY_LIMIT = 20;

export const REVERSIBLE_EVENT_TYPES = [
  "TokenMoved",
  "TokenHiddenSet",
  "TokenConditionsSet",
  "TokenStatsSet",
  "RollRuled",
  "RollDamageApplied",
] as const;

export type ReversibleEvent = Extract<DomainEvent, { type: (typeof REVERSIBLE_EVENT_TYPES)[number] }>;

export interface UndoEntry {
  /** The action's `commandId` (or `seq:<n>` for an event from before undo existed). */
  commandId: string;
  /** Who performed the action; null for system batches. */
  actorId: string | null;
  /** False once the batch contains any event outside the reversible set. */
  undoable: boolean;
  /** The action's reversible events, in commit order. Empty when not undoable. */
  events: ReversibleEvent[];
  /** Token names as they were when the action happened, for labels and refusals. */
  tokenNames: Record<string, string>;
  /** "Aria → Goblin" for each attack roll the action touched, for labels. */
  rollLabels: Record<string, string>;
}

/** What `reduce` needs to group an event into an action. */
export interface EventMeta {
  /**
   * Groups the event into an action for undo. Absent for player clients, whose events carry no
   * `commandId` (ADR 0013): they pass only `at` and keep no history.
   */
  commandId?: string;
  actorId?: string | null;
  /** The committed ISO timestamp, so `reduce` can stamp it without reading a clock (ADR 0015). */
  at?: string | null;
  /**
   * Committed before undo existed, so its batch boundaries are unknown. Never undoable: undoing
   * one event of an old Apply would restore the roll but not the HP (sync review).
   */
  legacy?: boolean;
}

/** Whether an event type can take part in an undoable action. */
export function isReversible(event: DomainEvent): event is ReversibleEvent {
  return (REVERSIBLE_EVENT_TYPES as readonly string[]).includes(event.type);
}

/**
 * Grouping metadata for a committed event. Events from before undo existed have no
 * `commandId`: each is its own action, and none can be undone.
 */
export function eventMeta(committed: CommittedEvent): EventMeta {
  return committed.commandId
    ? { commandId: committed.commandId, actorId: committed.actorId, at: committed.at }
    : { commandId: `seq:${committed.seq}`, actorId: committed.actorId, at: committed.at, legacy: true };
}

/**
 * Adds one event to the undo history. Batches are contiguous, so an event either extends
 * the last entry (same `commandId`) or starts a new one. An entry is created on a batch's
 * first event, so a batch that mixes in any non-reversible event is never undoable, in
 * whichever order its events came. A closed non-undoable entry is dropped when the next
 * batch starts; it only existed to track its own batch.
 *
 * The history bound is applied to closed entries only, when the next batch starts. An undo's
 * own inverse events open an entry that its `ActionUndone` removes again, so trimming while
 * that entry is open would evict an unrelated action (sync review).
 */
export function recordUndo(state: RoomState, event: DomainEvent, meta: EventMeta & { commandId: string }): UndoEntry[] {
  const history = state.undo;
  const last = history.at(-1);
  const reversible = !meta.legacy && isReversible(event);
  if (last && last.commandId === meta.commandId) {
    if (!last.undoable) return history;
    const updated: UndoEntry = reversible && isReversible(event)
      ? { ...last, events: [...last.events, event], ...withLabels(last, state, event) }
      : { ...last, undoable: false, events: [], tokenNames: {}, rollLabels: {} };
    return [...history.slice(0, -1), updated];
  }
  // Every closed entry left can be undone; keep the newest UNDO_HISTORY_LIMIT of them.
  const closed = (last && !canUndo(last) ? history.slice(0, -1) : history).slice(-UNDO_HISTORY_LIMIT);
  const empty = { tokenNames: {}, rollLabels: {} };
  const entry: UndoEntry = reversible && isReversible(event)
    ? { commandId: meta.commandId, actorId: meta.actorId ?? null, undoable: true, events: [event], ...withLabels(empty, state, event) }
    : { commandId: meta.commandId, actorId: meta.actorId ?? null, undoable: false, events: [], ...empty };
  return [...closed, entry];
}

/** Records the name of the token, or the label of the roll, that `event` touches. */
function withLabels(
  labels: Pick<UndoEntry, "tokenNames" | "rollLabels">,
  state: RoomState,
  event: ReversibleEvent,
): Pick<UndoEntry, "tokenNames" | "rollLabels"> {
  const { tokenNames, rollLabels } = labels;
  if ("tokenId" in event) {
    const token = state.tokens[event.tokenId];
    return token ? { tokenNames: { ...tokenNames, [token.id]: token.name }, rollLabels } : { tokenNames, rollLabels };
  }
  const roll = state.rolls.find((r) => r.id === event.rollId);
  return roll?.attack
    ? { tokenNames, rollLabels: { ...rollLabels, [roll.id]: formatAttackParties(roll.attack) } }
    : { tokenNames, rollLabels };
}

/** The action with this `commandId`, if it is still in the history and can be undone. */
export function undoableAction(history: readonly UndoEntry[], commandId: string): UndoEntry | undefined {
  const entry = history.find((e) => e.commandId === commandId);
  return entry && canUndo(entry) ? entry : undefined;
}

/**
 * Whether a whole action can be undone. HP and AC edits on their own are not undoable: the
 * GM just edits them again. A stats change is undone only as part of an Apply, together
 * with the roll's Applied mark. Decided per action, since an Apply's stats change comes first.
 */
function canUndo(entry: UndoEntry): boolean {
  if (!entry.undoable || entry.events.length === 0) return false;
  const statsEdit = entry.events.some((e) => e.type === "TokenStatsSet");
  return !statsEdit || entry.events.some((e) => e.type === "RollDamageApplied");
}

/** The compensating event that restores what `event` replaced (invariant 6). */
export function inverseOf(event: ReversibleEvent): DomainEvent {
  switch (event.type) {
    case "TokenMoved":
      return { type: "TokenMoved", tokenId: event.tokenId, from: event.to, to: event.from };
    case "TokenHiddenSet":
      return { type: "TokenHiddenSet", tokenId: event.tokenId, hidden: event.previous, previous: event.hidden };
    case "TokenConditionsSet":
      return { type: "TokenConditionsSet", tokenId: event.tokenId, conditions: event.previous, previous: event.conditions };
    case "TokenStatsSet":
      return { type: "TokenStatsSet", tokenId: event.tokenId, stats: event.previous, previous: event.stats };
    case "RollRuled":
      return { type: "RollRuled", rollId: event.rollId, verdict: event.previous, previous: event.verdict };
    case "RollDamageApplied":
      return { type: "RollDamageUnapplied", rollId: event.rollId, amount: event.amount };
  }
}

/**
 * Why undoing `entry` would clobber a newer change, or null when every value it set is
 * still current. Conditions compare as sets: order carries no meaning.
 */
export function undoConflict(state: RoomState, entry: UndoEntry): string | null {
  for (const event of entry.events) {
    if (!("tokenId" in event)) {
      // Rulings and applications only exist on rolls still in the state window (ADR 0011).
      const roll = state.rolls.find((r) => r.id === event.rollId);
      const label = entry.rollLabels[event.rollId] ?? "that roll";
      if (!roll) return `Can't undo: ${label} is no longer in the roll log.`;
      const current = event.type === "RollRuled" ? (roll.verdict ?? null) === event.verdict : roll.damageApplied === true;
      if (!current) return `Can't undo: ${label} has changed since.`;
      continue;
    }
    const token = state.tokens[event.tokenId];
    const name = token?.name ?? entry.tokenNames[event.tokenId] ?? "That token";
    if (!token) return `Can't undo: ${name} no longer exists.`;
    const current =
      event.type === "TokenMoved" ? token.position.x === event.to.x && token.position.y === event.to.y
      : event.type === "TokenHiddenSet" ? token.hidden === event.hidden
      : event.type === "TokenStatsSet" ? sameStats(token.stats, event.stats)
      : sameSet(token.conditions, event.conditions);
    if (!current) return `Can't undo: ${name} has changed since.`;
  }
  return null;
}

/** Order-insensitive equality for condition lists. */
function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

type Stats = RoomState["tokens"][string]["stats"];
/** Whether two stat blocks hold the same HP, Max HP and AC. */
function sameStats(a: Stats, b: Stats) {
  return a.hp === b.hp && a.maxHp === b.maxHp && a.ac === b.ac;
}

/**
 * Phrases for an undoable action: `verb` for the Undo button ("move Goblin"), `noun` for the
 * activity log ("the move of Goblin"). Names are current ones where the token still exists.
 */
export function describeUndo(entry: UndoEntry, tokens: RoomState["tokens"]): { verb: string; noun: string } {
  const nameOf = (id: string) => tokens[id]?.name ?? entry.tokenNames[id] ?? "a token";
  const rollOf = (id: string) => entry.rollLabels[id] ?? "a roll";
  // An Apply is a stats change plus the roll's mark; it reads as the damage, not the HP edit.
  const applied = entry.events.find((e) => e.type === "RollDamageApplied");
  if (applied) {
    return { verb: `damage ${rollOf(applied.rollId)}`, noun: `the ${applied.amount} damage applied from ${rollOf(applied.rollId)}` };
  }
  const first = entry.events[0];
  if (!first) return { verb: "last action", noun: "an action" };
  if (first.type === "RollRuled" || first.type === "RollDamageApplied") {
    return { verb: `ruling on ${rollOf(first.rollId)}`, noun: `the ruling on ${rollOf(first.rollId)}` };
  }
  const name = nameOf(first.tokenId);
  if (entry.events.length > 1) return { verb: `edit ${name}`, noun: `the edit to ${name}` };
  switch (first.type) {
    case "TokenMoved":
      return { verb: `move ${name}`, noun: `the move of ${name}` };
    case "TokenHiddenSet":
      return first.hidden
        ? { verb: `hide ${name}`, noun: `hiding ${name}` }
        : { verb: `reveal ${name}`, noun: `revealing ${name}` };
    case "TokenConditionsSet":
      return { verb: `conditions on ${name}`, noun: `the condition change on ${name}` };
    case "TokenStatsSet":
      return { verb: `stats on ${name}`, noun: `the stats change on ${name}` };
  }
}
