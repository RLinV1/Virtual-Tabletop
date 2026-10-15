## Context

See proposal.md - Why. ADR 0019 stores a checkpoint as `{ id, name, seq }` in `RoomState.checkpoints`; no snapshot is kept. A restore folds the room log to the checkpoint's seq with `replayTo`, takes the table, and `LiveRoom.checkpointTables()` hands it to `decide` through `DecideContext.checkpointTable`. Players never see checkpoints: `filterStateForViewer` empties the list, `filterEventForViewer` answers `redacted` for `CheckpointCreated` and `resync` for `CheckpointRestored`. The replay-points route (`GET /api/rooms/:roomId/replay/:pointId`) already serves a filtered historical view over REST and logs a warning past 500 ms.

## Goals / Non-Goals

**Goals:**
- Delete and preview follow the existing command pipeline and visibility rules with the least new surface.
- Preview reuses the restore replay, so it shows exactly what a restore would produce.

**Non-Goals:**
- Undo of a delete. A checkpoint is metadata over an append-only log, so a deleted one can be re-saved only from the current board, not recovered. The confirm dialog says so.
- A rendered Pixi board in the preview, a snapshot cache, or renaming checkpoints.
- Dropping the unused Postgres `checkpoints` table (still left to a cleanup migration, per ADR 0019).

## Decisions

**Delete is a command and an event.** `checkpoint.delete { checkpointId }` is authorized first (`can.administer`), then looks the id up in `state.checkpoints` (not found otherwise) and emits `CheckpointDeleted { checkpoint }` with the full removed entity (invariant 6). `reduce` filters it out of the list. Alternative: a `previous` list on the event. Rejected: one entity is the replaced value; the list is derivable.

**`CheckpointDeleted` is `redacted` for players.** Same rule as `CheckpointCreated`: the event carries a checkpoint name, so players get a redacted placeholder and keep a consistent seq. `filterStateForViewer` already gives them an empty list.

**Delete is not in `REVERSIBLE_EVENT_TYPES`.** It removes only a bookmark, and the existing undo "still current" machinery assumes board data. `reduce` of `CheckpointDeleted` leaves `undo` untouched. A deleted checkpoint's replay point in `replay.ts` is unaffected: replay points come from the log's `CheckpointCreated` events.

**Preview is a read, not a command.** It must not take a seq or enter history (invariant 4 spirit; it is not ephemeral relay but a pure read). `GET /api/rooms/:roomId/checkpoints/:checkpointId/preview`, GM-only (403 otherwise, 404 for an unknown or deleted id). The server loads the log, calls `replayTo(roomId, events, checkpoint.seq)`, takes `tableOf`, and returns a `CheckpointPreviewResponse` zod schema holding that `TableState`. The payload passes through the same viewer filter (`filterStateForViewer`-based, GM identity) so invariant 3 holds structurally, not by the route's own check alone. Alternative: a socket command with a reply. Rejected: it would look like a command and invite a seq; REST matches the replay precedent.

**Reuse the replay.** `LiveRoom` already owns `checkpointTables()` inside its exclusive queue. Add one small `previewCheckpoint(checkpointId)` method that calls it, so the route does not rebuild event loading and the 500 ms warning stays in one place. It returns `null` for an unknown checkpoint or a log that will not replay (route answers 404 / 500-class "can't be previewed right now", mirroring restore's message).

**Preview UI is a summary, not a board.** A modal lists the map name and grid, tokens (name, hidden marker), area count, fog region count, and initiative order, with Restore and Close buttons. Restore from the preview reuses the existing confirm-and-restore path. Alternative: render the saved table on a second Pixi board. Rejected: `board/` ties the view to live room state and the cost is large for a "what is this" check; it can be added later without a protocol change.

**Delete UI mirrors Restore.** A Delete button per row opens a confirm modal (`Modal`), same busy-guard and `status` live region as `CheckpointsPanel` today.

## Risks / Trade-offs

- [Preview replays the whole log per click] → Same cost and 500 ms warning as restore; GM-only, one request per click. Add the snapshot cache ADR 0019 already names if it warns.
- [A preview shows a table older than the live schema] → Replay uses the same `reduceCommitted` as room load, so it is as valid as a restore; a log that will not replay returns a clear error, not a crash.
- [Delete cannot be undone] → Confirm dialog states it; the log still holds the original board history.
- [Old clients fail `assertNever` on the new event] → Web and server deploy together, as with every event addition.
- [Shared schema change] → New ADR amending 0019 and Real-Time Architecture owner review before merge.

## Migration Plan

No data migration: events are append-only and the new type only appears after a delete. Deploy web and server together. Rollback: reverting leaves `CheckpointDeleted` events in logs that an old server cannot reduce, so roll back only before any delete is used, or accept that rooms with one will not load on the old build.
