## Context

See proposal.md for motivation and specs/room-undo/spec.md for required behavior.

Current state that shapes the approach:

- `LiveRoom.submit` runs `decide(state, actor, command)`, then `commit` appends the returned events as one atomic batch (`store.append`), reduces each one, and broadcasts each one. A batch is exactly one command's output, but nothing in `CommittedEvent` (`seq`, `at`, `actorId`, `event`) records that. Once committed, the batch boundary is lost.
- `token.configure` (the token editor save) emits several events in one batch. It orders them so a hide goes first and a reveal goes last. ADR 0011 already warns that undo must reverse a command's events as one unit.
- Every event in the reversible set carries the value it replaced: `TokenMoved {from, to}`, `TokenHiddenSet {hidden, previous}`, `TokenConditionsSet {conditions, previous}`.
- `RoomState` is rebuilt on load by replaying the whole event log. No snapshots are persisted today, so anything derived by `reduce` survives a reload for free.
- `decide` and `reduce` are pure and see only `RoomState`, the actor, and the command or event (invariants 1 and 2).
- `filterEventForViewer` returns an event as-is, a redacted seq placeholder, or a resync. Players have no activity log; it is GM-only.

## Goals / Non-Goals

**Goals:**
- Undo is decided in `decide` and applied by `reduce`, like every other state change. No new side channel.
- A command's events are undone as one unit, including after a server restart.
- Existing event logs replay unchanged.
- The set of reversible event types is one list, so widening it later touches `decide`'s inverse table and that list, not the plumbing.

**Non-Goals:**
- Undoing across the history bound, or restoring history that was trimmed.
- Merging or collapsing rapid repeated moves into one undo step.

## Decisions

### D1. Group events by a server-assigned `commandId` on `CommittedEvent`

`LiveRoom.commit` generates one id (`randomUUID`) per batch and stores it on every event in the batch. It is pipeline metadata, like `seq` and `at`, so `decide` stays unaware of it. `NewEvent` and `CommittedEvent` gain an optional `commandId`. Postgres gets a nullable `command_id` column; the memory store keeps it on the stored object. System batches (room creation, joins) get an id too.

Events committed before this change have no `commandId`. They are keyed as `seq:<seq>` and are never undoable: their batch boundaries are unknown, so undoing one event could split an old Apply or editor save (sync review).

This is unrelated to the client's `clientCommandId`, which only matches acks to requests and never reaches the log.

Alternatives considered:
- **Undo per event.** Rejected: an editor save that moved and hid a token would need two undos, and ADR 0011's split-apply problem would come back once damage is reversible.
- **Group in `LiveRoom` memory only.** Rejected: the grouping is gone after a restart, so history would not survive a reload.
- **A marker event at the end of each undoable batch.** Rejected: it doubles the log for ordinary moves, and a player-visible marker next to a redacted event would reveal that a hidden change happened.
- **Infer batches from equal timestamps.** Rejected: fragile, and the memory store does not guarantee it.

### D2. Undo history lives in `RoomState`, built by `reduce`

`RoomState` gains `undo: UndoEntry[]`, oldest first, where `UndoEntry = { commandId, actorId, undoable, events, tokenNames, rollLabels }`. `events` holds only reversible events. The two label maps record token names and "Aria → Goblin" roll labels at the time of the action, for button labels and refusal messages after a rename or delete.

`reduce(state, event, meta?)` takes optional `meta = { commandId, actorId }`. A new helper `reduceCommitted(state, committed)` derives `meta` from a `CommittedEvent`, with the `seq:<seq>` fallback, and every caller that holds committed events uses it: room load, `commit`, the activity log replay, and the web client. Without `meta` (most existing unit tests), `reduce` changes state as before and records no history.

For each event with `meta`:
1. If the last entry has the same `commandId`, extend it. A reversible event is appended while `undoable` is true. Any other event sets `undoable = false` and clears `events`.
2. Otherwise a new batch starts. A trailing entry with `undoable = false` is dropped first, since its batch is over. Then a new entry is pushed, `undoable` only if this event is reversible.
3. When a new batch starts, keep the newest 20 closed entries, all of which can be undone, plus the new open one. Trimming never happens while an entry is open, so an undo's own brief entry never evicts a real action (sync review).

Whether an action can be undone is decided per whole action (`canUndo`), since an Apply commits its `TokenStatsSet` before its `RollDamageApplied`. An action containing `TokenStatsSet` is undoable only if it also contains `RollDamageApplied`. A manual HP/AC edit is therefore recorded but never offered, and it is dropped once the next batch starts.

Because an entry is created on a batch's first event, a batch that starts with a non-reversible event and then has a reversible one is still marked not undoable. No separate "tainted batch" state is needed.

Alternatives considered:
- **A read model in `LiveRoom` passed into `decide` through `DecideContext`.** Rejected: it adds a second source of room truth outside `reduce`, and the client would need its own copy to label the Undo button.
- **Scan the event log at undo time.** Rejected: `decide` has no store access, by design.

### D3. `history.undo` in `decide`: inverses plus one `ActionUndone`

`history.undo { commandId }` names the action to undo. `decide`:
1. Refuses non-GM actors as `forbidden`.
2. Finds the entry named by `command.commandId` that can still be undone. If there is none (already undone, trimmed, never existed, or a manual stats edit), it rejects as `invalid` with "That action can no longer be undone."
3. Checks each event against the current state (spec: refuse when state has changed since). For token events, the token must exist and its `position`, `hidden`, `conditions` (compared as sets) or `stats` must equal what the event set. For roll events, the roll must still be in the 30-roll window, with the ruling the event set, or still `damageApplied`. The first mismatch rejects as `invalid` with, for example, "Can't undo: Goblin has changed since.", "Can't undo: Orc no longer exists." or "Can't undo: Aria → Goblin is no longer in the roll log."
4. Emits the inverse of each event, in reverse order, then `ActionUndone { commandId }`, where `commandId` is the undone entry's id.

The inverses are the existing event types with the values swapped: `TokenMoved {from: to, to: from}`, `TokenHiddenSet`, `TokenConditionsSet`, `TokenStatsSet` and `RollRuled` with value and `previous` exchanged. The exception is `RollDamageApplied`, which carries no `previous` because it always replaces `false` (ADR 0011). Its inverse is a new `RollDamageUnapplied { rollId, amount }`, which clears the mark and is filtered exactly like `RollDamageApplied`. An Apply is `[TokenStatsSet, RollDamageApplied]`, so its undo is `[RollDamageUnapplied, TokenStatsSet]`, and the roll can be applied again afterwards. They go through existing `reduce` branches and existing visibility filters, so a hidden token's undo is redacted for players exactly as its original change was. Reverse order also keeps `token.configure`'s rule: a reveal that came last is undone first, as a hide, before the moves.

`ActionUndone` comes last. `reduce` for it removes two entries: the undone entry, and the entry the inverse events of this same batch just opened. So an undo never becomes undoable itself, and there is no redo.

`ActionUndone` carries only the id. The activity log's formatter already receives the `before` state, and the undone entry is still in `before.undo` when `ActionUndone` is formatted. The formatter reads the entry to write "Raymond undid Mara's move of Goblin". Invariant 6 holds: the event replaces no stored value, and the entry it removes is derived state that a replay rebuilds.

Alternatives considered:
- **One `ActionUndone { reverted: DomainEvent[] }` that `reduce` inverts.** Rejected: every visibility rule for the reversible events would have to be re-implemented inside one composite event.
- **Dedicated `TokenMoveUndone`-style events.** Rejected: they duplicate existing semantics and filters for no gain.

### D4. Visibility

- `filterStateForViewer`: players get `undo: []`.
- `filterEventForViewer`: `ActionUndone` is always redacted for players. They have no activity log, and the effects already reach them through the inverse events.
- `filterEventForViewer` strips `commandId` from every event sent to players. A shared id between a visible event and a redacted one would tell a player that a hidden change was part of the same editor save. Without it, player clients record no history, which matches their empty `undo`.
- The GM receives events as-is, so the GM client's `reduceCommitted` builds the same history as the server's.

### D5. Web: undo lives in the activity log

`RoomConnection` calls `reduceCommitted` for events that carry a `commandId` (the GM's), and plain `reduce` otherwise. The activity log's REST entries already carry each event's `commandId` for the GM. For every action on the page, its newest entry gets an Undo button when `undoableAction(state.undo, commandId)` accepts it, labelled from `describeUndo` ("Undo move Goblin"). Entries whose action has an `ActionUndone` on the page are marked Undone. A refusal shows the server message on that entry. After a successful undo the log refreshes, so the undo's own entry appears.

There is no top-bar Undo button and no keyboard shortcut. A blind "undo the latest" hides what is being reversed, and in a shared room the latest action may not be the one the GM means.

### D6. ADR 0013

`docs/adr/0013-undo.md` records D1 to D4: the `commandId` contract change, history in `RoomState`, the refusal rule, and the redaction choices. It also lists how to widen the reversible set: add the type to the list, add an inverse, add a conflict check.

## Risks / Trade-offs

- [Contract change touches every `reduce` caller] → `meta` is optional and `reduceCommitted` is additive. Existing tests keep calling `reduce(state, event)`. Server and client callers switch to `reduceCommitted` in one change.
- [Deploy skew: an old web client receives `ActionUndone`] → Its `assertNever` would throw, as with every earlier event addition (ADR 0011). Deploy web and server together.
- [History lost past 20 actions] → This is accepted and stated in the spec. Checkpoints (a later change) are the fallback for bigger rewinds.
- [Undo can pass over a non-undoable action that touched the same token] → The conflict check compares current values, so a later edit to the same field refuses the undo. A later edit to a different field (a rename after a move) does not block undoing the move. That is intended: the move is still exactly reversible.
- [A player's own move is undone by the GM while the player is dragging] → The drag commit then fails or lands as a new move, as with any concurrent GM move today (FR-SYNC-04 ordering).
- [Replay cost of history on load] → History is at most 21 small entries. This is negligible next to replaying the log itself.

## Migration Plan

1. Prisma migration `0005_event_command_id`: `ALTER TABLE events ADD COLUMN command_id uuid NULL`. No backfill, since legacy rows use the `seq:` fallback.
2. Deploy server and web together.
3. Rollback: revert the code. The nullable column can stay, since older code ignores it. `ActionUndone` rows written in the meantime would break an older reducer, so rolling back after undo has been used also needs those rooms' `ActionUndone` rows handled. This is acceptable for a class project and is noted in the ADR.
