## 1. Contract

- [x] 1.1 Write `docs/adr/0036-checkpoint-delete-preview.md` amending ADR 0019 (command, event, preview read, not undoable) and mark 0019 "Amended by"; verify the ADR names the Real-Time Architecture owner review
- [x] 1.2 Add `checkpoint.delete` to `commands.ts` and `CheckpointDeleted { checkpoint }` to `events.ts`, plus a `CheckpointPreviewResponse` schema; verify `npm run typecheck` flags every exhaustive switch to update
- [x] 1.3 Handle `checkpoint.delete` in `decide.ts` (authorize, then not found, then accept with the full entity) and `CheckpointDeleted` in `reducer.ts`; verify with unit tests in `packages/shared/test/checkpoints.test.ts` (GM deletes, player forbidden, unknown id not found, other checkpoints kept, restore of another checkpoint still works, reduce is deterministic) referencing FR-REC-02
- [x] 1.4 Make `visibility.ts` answer `redacted` for `CheckpointDeleted` to non-GM viewers; update `activityLog.ts` ("deleted checkpoint") and `replay.ts` switches; verify with visibility and activity-log unit tests that no player-facing payload carries the id or name

## 2. Server

- [x] 2.1 Add `LiveRoom.previewCheckpoint(checkpointId)` reusing `checkpointTables()`; verify it returns the saved table, and `null` for an unknown or deleted id
- [x] 2.2 Add `GET /api/rooms/:roomId/checkpoints/:checkpointId/preview` (GM only, 403 for players, 404 unknown, response parsed with the zod schema and passed through the viewer filter); verify with integration tests in `apps/server/test/checkpoints.test.ts`: preview reflects the board at the checkpoint after later edits, appends no event, player gets 403, deleted id gets 404
- [x] 2.3 Add a multi-client integration test: GM deletes a checkpoint, player stream carries only a redacted event and no id or name; verify it passes

## 3. Web

- [x] 3.1 Add a preview fetch to the web net client with zod parsing; verify with a unit test against a fixture response
- [x] 3.2 Add Preview and Delete buttons to each row in `CheckpointsPanel.tsx`; Delete opens a confirm `Modal` (busy guard, status live region), Preview opens a read-only summary modal (map, tokens with hidden marked, areas, fog, initiative) with Restore and Close; verify with component tests in `apps/web/test/checkpointsPanel.test.tsx`
- [ ] 3.3 Style the new buttons and modal in `styles.css` to match existing panel rows; verify visually in the running app

## 4. Verification

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test` and verify all pass
- [ ] 4.2 Exercise the flow in the browser with Playwright (save, preview, delete, restore, player view) and verify behavior; if the Playwright MCP is unavailable, say so and use the built-in browser

## 5. Sidebar resize (added at the GM's request)

- [x] 5.1 Let the viewer drag, or arrow-key, the room sidebar's inner edge to resize it (272 px to 60% of the window, saved per browser, double-click resets); verify with `apps/web/test/panelResize.test.tsx`
