## 1. Failing integration test first

- [x] 1.1 Add `apps/server/test/roomLoadFailure.test.ts`. Create a room on server A over a shared `MemoryRoomStore`, close A, then append an event the reducer rejects (e.g. `{ type: "NotARealEvent" }`, cast past `NewEvent`) with `store.append`. Start server B on the same store. Verify the new test fails, or crashes the worker, before the fix.
- [x] 1.2 In that test, assert all of the following. Connecting the GM credential to the poisoned room rejects with `not_found`. `GET /health` responds 200 afterwards. A room created on server B still connects and receives a snapshot. `POST /api/invites/<poisoned invite>/join` responds 500 and leaves the server up. A second connect attempt to the poisoned room fails the same way, which shows the failed load was not cached. Name the suite after the room-load-isolation capability.

## 2. Server fixes

- [x] 2.1 In `apps/server/src/ws/socket.ts`, wrap the `io.use` middleware body in try/catch. On error, log `[vtt] room <id> failed to load` with the error and call `next(new Error("not_found"))`. Verify with test 1.2 (socket assertions).
- [x] 2.2 In `apps/server/src/http/routes.ts`, replace the repeated `.catch(() => res.status(500)…)` with a helper that logs method, path, and error, then sends 500 `{ error: "Internal error" }` unless headers were already sent. Verify the join assertion in 1.2 and the existing route tests still pass.
- [x] 2.3 In `apps/server/src/index.ts`, register `process.on("unhandledRejection", (reason) => console.error("[vtt] unhandled rejection", reason))`. Verify with `npm run typecheck`, then check by reading the code that `buildApp` and the tests are unaffected.

## 3. Share control in the top bar

- [x] 3.1 Restructure `apps/web/src/ui/ShareButton.tsx` into a split control. Keep the main button's copy behavior unchanged, including gesture clipboard, generation guard, and flash labels. Add a chevron `PopoverButton` (`align="right"`) whose panel holds one "Reset link" action that opens the existing confirmation modal. Verify that typecheck and lint pass.
- [x] 3.2 In `apps/web/src/pages/RoomPage.tsx`, render `<ShareButton>` for the GM as the last child of `.topbar-end`, and remove it and the empty `.panel-title-row` from the sidebar header. Verify in the browser preview that Share is at the top right with the sidebar shown and hidden, and that a player sees no Share control.
- [x] 3.3 Update `apps/web/src/styles.css`. Drop `margin-left: auto` from `.share-group`, style the split button to match top-bar `tool-button` sizing, and give the chevron the danger hover only on the reset item. Verify by screenshot at desktop and mobile widths.
- [x] 3.4 Update the `share` step in `apps/web/src/ui/guide.ts` to say that Share is at the top right and reset is in its menu. Verify that the tour spotlights the new control when the sidebar is collapsed.
- [x] 3.5 In the preview, verify that choosing Reset link from the menu and confirming issues a new code (the next Share copies a different link) and does not open or switch any panel tab.

## 4. Wrap-up

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test` and confirm that all pass.
