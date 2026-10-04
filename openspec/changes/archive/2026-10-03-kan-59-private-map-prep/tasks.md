## 1. Grid editor

- [x] 1.1 Keep the draft local: the overlay owns its own grid draft and passes it to `GridForm` (which already takes `draft`/`onChange` from its caller), never calling the room's `onGridDraftChange`, so the board preview never sees it. No new `GridForm` prop was needed; verify the existing `gridDraft` tests still pass

## 2. Prepare map overlay

- [x] 2.1 In `MapSection`, replace the commit-on-upload and commit-on-pick paths with a `prep` draft (pure helpers in `pages/mapPrep.ts`) that opens a Prepare map modal holding `GridForm` ("Apply map"); verify upload and pick send no command (unit tests on `mapPrep`, server test 3.1, Playwright 4.2)
- [x] 2.2 Apply sends exactly one `scene.setMap { map, grid }` and closes on success; on rejection the overlay stays open with the error and the draft is kept; verify `prepCommand` unit tests and Playwright
- [x] 2.3 Close paths (Cancel, Escape, close button, backdrop) discard the draft; when the grid changed, ask Discard / Keep editing first; verify `prepDirty` unit tests and Playwright
- [x] 2.4 Add `.prep-sheet` sizing (max 1120 px, 24 px desktop gap, near full viewport under 720 px); verify in Playwright at 1280×800 and 390×844 that the actions are reachable

## 3. Server-side check

- [x] 3.1 Add `apps/server/test/mapPreparation.test.ts` (`describe("private map preparation (KAN-59)")`): an `/api/uploads` upload produces no message to the player, and the following `scene.setMap` with a grid yields exactly one event; verify with `npm test --workspace=@vtt/server -- mapPreparation`

## 4. Verification

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test`; verify all pass
- [x] 4.2 In Playwright with a GM and a player context: GM uploads a map; the player still sees the old map; GM aligns and applies; the player sees the new map and grid at once; GM uploads again and presses Escape; the player sees no change; take screenshots

> Note: the web tests render static markup only (no DOM test environment), so the overlay's interactions are covered by the pure `mapPrep` helpers, the server test and Playwright, not component interaction tests.

> 4.2 result (Playwright script driving Chromium, GM + player, 2026-10-04): upload left the player at seq 5 with the old map; Apply map produced exactly one event (seq 6) and the player saw the new map; a clean draft closed on Escape with nothing sent and focus back on Upload map; an edited draft asked "Discard this map?", Keep editing kept it open, Discard closed it with nothing sent and focus back on Upload map; the GM socket received no new `welcome`; at 390×844 Apply map was reachable with no horizontal scroll. Two bugs found and fixed on the way: re-picking the same file after cancelling did nothing (the file input kept its value), and focus fell to the page body because the input is disabled while uploading.
