## Why

A GM can save and restore named checkpoints (FR-REC-02, ADR 0019) but cannot remove one, and cannot see what a checkpoint holds before restoring it. The list fills with stale entries (capped at 50), and a restore is a leap of faith: the name is the only clue to what the board will become.

## What Changes

- New GM-only command `checkpoint.delete { checkpointId }` that removes a checkpoint from the list.
- New domain event `CheckpointDeleted { checkpoint }` carrying the full deleted checkpoint (id, name, seq), per invariant 6. Players receive it as `redacted`, like `CheckpointCreated`.
- New GM-only read `GET /api/rooms/:roomId/checkpoints/:checkpointId/preview` that returns the table as it was at the checkpoint, built by the same log replay a restore uses. Read-only: no command, no event, no seq.
- Checkpoints panel: a Preview button and a Delete button on each row. Preview opens a read-only summary of the saved board (map, tokens with hidden ones marked, areas, fog regions, initiative order) with a Restore action. Delete asks for confirmation first.
- `docs/adr/0019-checkpoints.md` is amended by a new ADR for the added command and event (shared schema change).
- Deleting a checkpoint is not undoable and does not touch history: the log keeps the `CheckpointCreated` event, and replay points and restores of other checkpoints are unaffected.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `checkpoints`: adds requirements for deleting a checkpoint and previewing one, and extends "Checkpoints never reveal hidden information" to cover both.

## Impact

- `packages/shared`: `commands.ts`, `events.ts`, `decide.ts`, `reducer.ts`, `visibility.ts`, `activityLog.ts`, `replay.ts` exhaustive switches; new unit tests.
- `apps/server`: `domain/liveRoom.ts` exposes the checkpoint replay for reads; `http/routes.ts` gets the preview route; integration tests.
- `apps/web`: `panels/CheckpointsPanel.tsx`, `net` client call for the preview, styles; component test.
- `docs/adr`: new ADR amending 0019. Needs review by the Real-Time Architecture owner (CLAUDE.md).
- Old clients fail the reducer's `assertNever` on `CheckpointDeleted`; web and server deploy together, as with every event addition.
