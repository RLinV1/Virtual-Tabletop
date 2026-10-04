## Context

`RoomState` is folded from the event log by the pure `reduce`. `decide` is pure and receives a `DecideContext` (`newId`, `random`). `filterEventForViewer` can already answer `resync`, which makes the server send that viewer a fresh `filterStateForViewer` snapshot instead of the event. Undo (ADR 0013) keeps a GM-only `undo` list in state and reverses events that carry their replaced values. Postgres has an unused `checkpoints(id, room_id, name, seq, created_by)` table from `0001_init`.

## Goals / Non-Goals

**Goals:**
- One command that returns the board to a saved moment, whatever happened since.
- No history rewriting, no new persistence path, `reduce` and `decide` stay pure.
- No hidden data reaches players through the new events.

**Non-Goals:**
- Renaming or deleting checkpoints. Possible later, not needed for the fallback.
- Restoring participants, chat, dice history or seats.
- Late-joiner replay (KAN-51). It will reuse the replay-to-seq helper this change adds.

## Decisions

### 1. Checkpoint = name + seq in the log; state by replay
`CheckpointCreated` records `{ id, name, seq }`, where `seq` is the last committed seq before it. Nothing else is stored. To restore, the server loads the room's events, folds them with `reduce` up to that `seq`, and takes the table portion. Replay is deterministic, so this always reproduces the saved table exactly.

*Alternative:* store a snapshot (the `snapshots` table, or the state inside `CheckpointCreated`). Faster for long logs, but it is a second copy that can drift from the log, and putting the full table in `CheckpointCreated` bloats every reload. Room logs here are small (hundreds to low thousands of events). If replay becomes slow, a snapshot can be added as a cache later with no protocol change.

### 2. Table state is passed into `decide` via context
`liveRoom.submit` sees `checkpoint.restore`, loads and replays inside its exclusive queue, and calls `decide` with `ctx.checkpointTable(checkpointId)` returning the table or `null`. `decide` authorises first (GM only), then checks the checkpoint exists in `state.checkpoints`, then emits `CheckpointRestored { checkpointId, name, restored, previous }` with `previous` taken from the current state (invariant 6). `decide` does no I/O.

*Alternative:* have `reduce` compute the restored table itself. Impossible: `reduce` only has the current state, not the history.

### 3. What "table" means
`TableState = { scene, tokens, templates, fog, initiative }`. These five describe what is on the board. `participants`, `rolls`, `chat`, `name`, `undo` and `checkpoints` are records of the session and are untouched. A restored token whose owners have since left keeps its `ownerIds`. That is harmless, because ownership by an inactive participant grants nothing.

### 4. Players get a resync, never the event
`filterEventForViewer` returns `resync` for `CheckpointRestored` for every non-GM viewer. The payload holds hidden tokens and GM-only templates in both `restored` and `previous`, and filtering two nested states inside an event is error-prone. A full filtered snapshot is simpler and provably safe. `CheckpointCreated` is `redacted` for players (seq only). `filterStateForViewer` sets `checkpoints: []` for players.

### 5. Restore is reversible
Add `CheckpointRestored` to `REVERSIBLE_EVENT_TYPES`. Its inverse is another `CheckpointRestored`-shaped table swap with `restored` and `previous` exchanged (emitted as an undo, with the same event type and `checkpointId`). It is one event, so one undo entry.

### 6. Activity log
"GM restored checkpoint *Before the ambush*" and "GM saved checkpoint *Before the ambush*". Both are GM-only lines, because players never receive the events.

## Risks / Trade-offs

- [Replay cost grows with the log] → Load once per restore, not per command. Add a snapshot cache if a benchmark ever shows a restore over 500 ms.
- [An event later in the log cannot be replayed (bad legacy data)] → Replay uses the same `reduceCommitted` the room load uses, so a room that loads can replay. Reject the restore with a clear message if replay throws.
- [A large `CheckpointRestored` event, with two full tables] → Bounded by the token and template caps. It is sent only to GMs.
- [Schema change in `packages/shared`] → New ADR and Real-Time Architecture owner review before merge, per CLAUDE.md.
