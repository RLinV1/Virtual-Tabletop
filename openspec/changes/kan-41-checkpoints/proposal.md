## Why

KAN-41 (FR-REC-02) shipped undo for recent actions (PR #59, ADR 0013): token moves, hide/reveal, conditions, stats and rulings, each reversed by a compensating event. One acceptance criterion is still missing: **"Named checkpoint save/restore available as the universal fallback."** Undo only covers the reversible set and only recent actions. A GM who wants the table back to "before the ambush" after a dozen mixed changes (new tokens, a map swap, a reset initiative) has no way to get there.

The plan already exists on paper but was never built. ADR 0001 says "Checkpoints = named `seq` + snapshot; restore appends a `CheckpointRestored`-style event rather than truncating." Postgres has an unused `checkpoints` table. README §4 workflow step 7 has the GM create a named checkpoint.

The ticket's success metric ("GM reverses an accidental reveal/move/condition change in under 15 seconds") was never measured either.

## What Changes

- New commands (GM only): `checkpoint.create { name }` and `checkpoint.restore { checkpointId }`.
- New events: `CheckpointCreated { checkpoint: { id, name, seq } }` and `CheckpointRestored { checkpointId, name, restored, previous }`, where `restored` and `previous` are the full **table state**: scene, tokens, area templates, fog and initiative.
- A restore resets the table only. Participants, chat, dice history and the activity log stay as they are, because they record what happened rather than what is on the board.
- The server computes a checkpoint's table state by replaying the log up to its `seq` (pure `reduce`, no snapshot needed) and hands it to `decide` through `DecideContext`. `decide` stays pure.
- `RoomState.checkpoints`: metadata list (id, name, seq), GM-only, stripped for players by `filterStateForViewer`.
- Players never receive `CheckpointRestored` itself. Their filter returns `resync`, so each player gets a freshly filtered snapshot and hidden tokens never travel in an event payload.
- A restore is itself undoable (it carries `previous`), so restoring the wrong checkpoint is one click to reverse.
- GM UI: a Checkpoints section in the GM panel to name and save the current table, and a list with Restore (confirm dialog naming the checkpoint).
- Measure the 15-second success metric in a Playwright run and record it.
- **Schema change** in `packages/shared`: needs a new ADR and Real-Time Architecture owner review.

## Capabilities

### New Capabilities

- `checkpoints`: naming a restore point and returning the table to it, with who may do it and what players see.

### Modified Capabilities

None. Undo's behaviour is unchanged; `CheckpointRestored` joins its reversible set, which ADR 0013 already allows ("add it to REVERSIBLE_EVENT_TYPES").

## Impact

- `packages/shared`: `commands.ts`, `events.ts`, `state.ts` (`checkpoints`), `decide.ts`, `reducer.ts`, `visibility.ts`, `undo.ts`, `activityLog.ts`.
- `apps/server/src/domain/liveRoom.ts`: loads the checkpoint's table state before calling `decide` for `checkpoint.restore`.
- `apps/web`: a Checkpoints section in the GM panel.
- `docs/adr/`: new ADR 0017 for checkpoints; amends ADR 0001's one-line note.
- The existing Postgres `checkpoints` table stays unused. The event log is the source of truth, and dropping the table is left to a later cleanup.
