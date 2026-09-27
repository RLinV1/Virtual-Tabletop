# Tasks

## 1. Server limit check

- [x] 1.1 In `PATCH /api/library/:id`, reject a grid with 400 when `!canRenderGrid(grid.cellSize, existing)`, after the ownership and kind checks and before `updateAsset`. Verify that renames without a grid are not checked, and that `npm run typecheck` passes.
- [x] 1.2 Add an integration test in `apps/server/test/library.test.ts` (`describe("... (asset-library, FR-GM-04)")`). Saving a grid with cell size 0.1 to a 4000×3000 map returns 400 and a GET shows the old grid. A drawable grid still saves. Verify with `npm test --workspace=@vtt/server -- -t "library"`.

## 2. Shared grid line geometry

- [x] 2.1 Add `gridLines(grid, rect)` in `apps/web/src/board/gridLines.ts`, with no Pixi imports. It returns vertical x and horizontal y positions inside a board-pixel rectangle, starting at the offset and including the far edge. Unit tests in `apps/web/test/gridLines.test.ts` cover offset 0, a nonzero offset, a rectangle that doesn't start at 0, and a line exactly on the far edge.
- [x] 2.2 Switch `BoardView.syncGrid` to `gridLines` without changing its output. Verify in a room that the committed grid and the Adjust grid preview draw as before, and that `npm run typecheck` passes.

## 3. Shared grid form

- [x] 3.1 Move `GridForm`, `GridLineFields` and `GridLinePreview` from `GmPanel.tsx` to `apps/web/src/pages/GridForm.tsx`. Add `submitLabel`/`busyLabel` props that default to "Apply grid"/"Applying…", and make `GridLinePreview` use `gridLines`. Verify that `npm run lint && npm run typecheck` pass and that the room's Adjust grid modal looks and behaves the same (Apply, Cancel, invalid-draft messages, Advanced line style).

## 4. Library map grid preview

- [x] 4.1 Build `MapGridPreview` (SVG). It shows the map `<image>` at its pixel size and a grid `<path>` from `gridLines` for the visible viewBox only. Lines use the draft's colour and opacity and are at least one screen pixel wide. Verify in the browser that lines land on the map's printed squares for a correctly set grid.
- [x] 4.2 Add zoom and pan by changing the viewBox: wheel or pinch zooms around the cursor, dragging pans, and buttons zoom in, zoom out and fit. Zoom stays between fit and about 8× and the view stays over the map. Verify with mouse, keyboard (buttons) and touch emulation.

## 5. Library Edit grid flow

- [x] 5.1 In `LibraryPage.tsx`, add an **Edit grid** link to `AssetCard` for owned maps only, with no change to `BuiltinCard` or token cards. Verify in the browser that built-in maps and tokens show no Edit grid action.
- [x] 5.2 Add the editor modal, with its state in `Library`. The draft starts from `normalizeLegacyGridForBoard(asset.grid ?? DEFAULT_GRID, asset)`. The modal shows `MapGridPreview` (last valid draft) beside `GridForm` with "Save grid"/"Saving…", plus the note that rooms keep their grid. Saving calls `api.library.update` and replaces the asset in the list. A failure keeps the modal open with the error, and Cancel, Escape, close and backdrop discard the draft. Verify each path in the browser, and check that the card's "· N px grid" label updates after saving.
- [x] 5.3 Style the modal so the preview and form sit side by side on wide screens and stack at 320 px and 390 px, with no horizontal page scroll. Verify at 1440, 390 and 320 px widths.

## 6. Acceptance

- [x] 6.1 In the browser, walk through each scenario in `specs/asset-library/spec.md`: edit and save with no room opened; preview without saving; cancel; invalid draft blocked; no action on built-ins or tokens; a map placed in a room keeps its room grid after a library edit, and a new placement uses the edited grid. Record the results in this file.
- [x] 6.2 Run `npm run lint && npm run typecheck && npm test` and `openspec validate library-map-grid-editor --strict`, and verify that all pass.

### Browser QA record — 2026-09-27

Automated in headless Chromium (Playwright) against `npm run dev` with the in-memory store. The test GM uploaded `map-jungle.webp` (2740×1604) as an owned map, plus one token.

- **Library (1440×900), 27 checks passed.**
  - Edit grid appears on the owned map only, not on built-in maps or tokens.
  - Changing the offset to 21/36 moved the preview lines (the path starts at `M21`) while the stored grid stayed at 0. The lines sat on the map's printed paving at fit.
  - Zoom: the buttons went from 25% to 84%, the wheel went up to the 800% cap and back down to fit, and Fit reset the view. The page never scrolled. At 800% only 2 lines were computed for the visible area.
  - Dragging panned the view by the expected number of board pixels.
  - A blank cell size, or 0.05 px (below this map's 0.09 px minimum), disabled Save and kept the last valid preview.
  - Cancel and Escape discarded the draft, and reopening started from the saved grid.
  - Save stored 70/21/36 and the card showed "70px grid".
  - A save intercepted with a 400 kept the modal open with the server's message.
- **Narrow layouts.** At 390 and 320 px the dialog fits inside the viewport with no horizontal scroll, and Save can be scrolled into view. At 320 px the zoom bar covers a noticeable part of the small preview but stays usable.
- **Touch (390 px, `hasTouch`).** Tapping the zoom buttons zoomed. A CDP touch drag panned about 383 board px for 100 screen px at 26% without scrolling the modal.
- **Room, 9 checks passed.**
  - Placing the library map in room "Crypt" copied 70/21/36.
  - The room's Adjust grid still shows "Apply grid" and "Save grid to library".
  - A 90 px draft showed the blue "Preview · Not applied" overlay on the board, and Cancel cleared it. The committed grid through `gridLines` lines up with the map as before.
  - After the library grid was changed to 64/5/6 through the API, "Crypt" still had 70/21/36 after a reload. A newly created room that placed the map got 64/5/6.
- **No page errors** in any run.

`npm run lint`, `npm run typecheck` and `npm test` pass (web 179, shared 119, server 102 plus 15 environment-dependent skips). `openspec validate library-map-grid-editor --strict` passes.
