# ADR 0036: Deleting and previewing checkpoints

**Status:** Proposed — needs review by the Real-Time Architecture owner (Raymond) · **Amends:** `docs/adr/0019-checkpoints.md`
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/checkpoint-delete-preview` · **Requirement:** FR-REC-02

## Context

ADR 0019 lets the GM save and restore named checkpoints. Two gaps remain. The list fills with stale entries (capped at 50) and cannot be pruned. And a restore is a leap of faith: only the name says what the board will become.

## Decision

### Delete is a command and an event

`checkpoint.delete { checkpointId }` (GM only) emits `CheckpointDeleted { checkpoint }`, where `checkpoint` is the whole removed entity `{ id, name, seq }` (invariant 6). `reduce` removes it from `RoomState.checkpoints`. An unknown id is `not_found`. Nothing else in the state changes; the log keeps the original `CheckpointCreated`, so history stays append-only and replay points are unaffected.

`filterEventForViewer` answers `redacted` for `CheckpointDeleted` to non-GM viewers, like `CheckpointCreated`: the event names a checkpoint and players never learn those. `filterStateForViewer` already gives them an empty list.

A delete is not in `REVERSIBLE_EVENT_TYPES`. It removes a bookmark, not board data, and a checkpoint can be saved again from the current board. The panel's confirm dialog says so.

### Preview is a read, not a command

`GET /api/rooms/:roomId/checkpoints/:checkpointId/preview` answers `{ name, table }`, the `TableState` at the checkpoint's seq. It is GM-only (403 for anyone else, 404 for an unknown or deleted checkpoint). The server builds the table with the same log replay a restore uses (`LiveRoom.checkpointTables`), so the preview shows exactly what a restore would produce. The route appends no event and takes no seq. The response is parsed with `CheckpointPreviewResponse` before it is sent.

A GM sees every token, so the table needs no per-viewer redaction; the 403 is the filter. This matches the replay route's precedent of serving a historical view over REST rather than the socket.

The web panel shows the preview as a read-only summary (map, tokens with hidden ones marked, areas, fog regions, initiative order) with a Restore action, not as a second Pixi board.

## Consequences

- A new command and event: web and server deploy together, as with every event addition. An old server cannot reduce `CheckpointDeleted`, so roll back only before a delete is used.
- A preview costs one log replay, with the same 500 ms warning as a restore. Add the snapshot cache ADR 0019 names if it warns.
- A deleted checkpoint cannot be recovered; its board is still in the log but there is no path back to it.

## Alternatives considered

- **Make delete undoable.** Needs a `CheckpointCreated`-shaped inverse and an undo entry for a bookmark. Not worth it: re-saving covers the case.
- **Preview over the socket as a command with a reply.** It would look like a command and invite a seq. A read does not.
- **Render the preview on a second Pixi board.** `board/` is tied to live room state, and the cost is high for a "what is this" check. It can be added later without a protocol change.
