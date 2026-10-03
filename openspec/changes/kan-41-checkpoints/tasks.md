## 1. ADR

- [ ] 1.1 Write `docs/adr/00NN-checkpoints.md` (next free number at merge) covering decisions 1–5 of design.md, amend ADR 0001's checkpoint line to point to it, and get Real-Time Architecture owner sign-off; verify the ADR is linked from the change

## 2. Shared contract

- [ ] 2.1 Add `TableState`, `Checkpoint { id, name, seq }`, `RoomState.checkpoints`, commands `checkpoint.create` / `checkpoint.restore` (zod, name 1–60 chars), and events `CheckpointCreated` / `CheckpointRestored`; verify `npm run typecheck`
- [ ] 2.2 Extend `DecideContext` with optional `checkpointTable(id): TableState | null`, and handle both commands in `decide` (GM only first, then validation); verify with `packages/shared/test/checkpoints.test.ts` (`describe("checkpoints (KAN-41, FR-REC-02)")`): player forbidden for both, bad names rejected, unknown id rejected, `previous` equals the current table
- [ ] 2.3 Reduce both events: append metadata on create; swap the table on restore and leave participants, rolls, chat and name untouched; verify with unit tests
- [ ] 2.4 Add a pure `replayTo(events, seq)` helper and test that it reproduces the table at that seq for a log with creates, moves, deletes and a map change
- [ ] 2.5 Visibility: `checkpoints: []` for players in `filterStateForViewer`; `CheckpointCreated` → `redacted` and `CheckpointRestored` → `resync` for players; verify with tests asserting no player-visible payload contains a checkpoint name or a hidden token id
- [ ] 2.6 Add `CheckpointRestored` to the reversible set with its inverse, and add activity-log lines for both events; verify with undo and activity-log unit tests

## 3. Server

- [ ] 3.1 In `LiveRoom.submit`, for `checkpoint.restore` load events, replay to the checkpoint's seq inside the exclusive queue, and pass `checkpointTable` into `decide`; reject with a clear message if replay throws; verify with 3.2
- [ ] 3.2 Add `apps/server/test/checkpoints.test.ts`: GM saves, makes mixed changes (create, delete, move, hide, map, initiative), restores, and the GM and two players converge on the checkpoint table filtered for each; a hidden token in the checkpoint never appears in any player message; chat sent after the checkpoint survives; undo of the restore brings the pre-restore table back; verify with `npm test --workspace=@vtt/server -- -t "checkpoints"`

## 4. Web

- [ ] 4.1 Add a Checkpoints section to the GM panel: a name field with Save, and a list of saved checkpoints, newest first, each with Restore behind a confirm dialog that names the checkpoint; hidden for players; verify with a component test that it does not render for a player
- [ ] 4.2 Run `npm run lint && npm run typecheck && npm test`; verify all pass

## 5. Verification

- [ ] 5.1 In Playwright with a GM and a player context at desktop and mobile widths: save "Start", move and hide tokens, add a token, restore "Start", and confirm both boards match; then undo the restore from the activity log; take screenshots
- [ ] 5.2 Time the success metric in Playwright: from an accidental token reveal to the table restored (via undo, and via checkpoint), and record both durations (target under 15 s) on the KAN-41 ticket
