# KAN-09 two-click grid anchors — verification

Verified on 2026-10-02 with headless Chromium against isolated local web/server processes and an in-memory room store. GM and player used separate contexts at 1366×768 and 1160×800. Chromium touch events covered 320×700, 390×700 and 1366×768. This record describes the implemented click placement, snapping, live Advanced values and Enter confirmation; previous drag-test claims do not verify this implementation.

## Automated coverage

Frontend geometry and interaction tests cover two-click placement, all four quadrants, dominant-axis square locking, fractional spacing, half-pixel cell and X/Y offset snapping and Shift freeform behavior, 1/3/5-square counts, image boundaries, partial edge cells, canonical offsets, invalid candidates, A translation, B resizing, keyboard geometry, movement thresholds, interruption recovery, and multi-touch suppression. Hover and gesture handling remain local to the editor.

`npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` passed on the final feature branch based on mainline `bb89754`. The PR #66 review suite passed 743 tests (268 shared, 133 server, 342 web), with 20 environment-dependent store tests skipped; 83 focused frontend cases cover sample geometry and interaction transitions. All 43 Chromium assertion groups passed against isolated processes on ports 5305/5306 using Chrome Headless Shell 151.0.7922.34. The original 39 groups also passed before the fixes, so the new regressions cover previously missing cases. Strict OpenSpec validation passed for the active `kan-10-grid-preview` change and the `room-grid-calibration` and `asset-library` contracts. The build reported the existing dependency annotation and bundle-size warnings, without failing.

The review suite ran with local socket access enabled. The 20 skipped tests require Postgres (`DATABASE_URL`); the room deletion Redis case additionally requires `REDIS_URL`. Browser QA used an in-memory store and temporary local uploads with MinIO autodetection disabled. No database migration or shared schema change was needed.

## Browser acceptance results

All 43 assertion groups passed in the review harness run, with no browser page errors:

- Two stationary clicks finalize a square, including fractional geometry while Shift is held; pauses and blur between clicks retain A. Live cell-size and X/Y readouts match provisional placement/repositioning geometry while the confirmed draft, save eligibility and network traffic remain unchanged. Accessible help identifies temporary values. The missing-map fallback also previews and restores without a render loop.
- Default placement and B resizing save exact half-pixel cell sizes, and anchor placement/adjustment saves exact half-pixel X/Y offsets. Normal A repositioning preserves existing fractional cell spacing while snapping its canonical offsets; Shift preserves arbitrary fractional offsets. The sample translates to match the snapped grid phase so both handles remain aligned within image bounds. Pressing/releasing Shift changes the preview and live readouts without changing the confirmed draft; Shift at commit preserves fractional cell size. Unit coverage includes 1×1, 3×3 and 5×5 snapping in every quadrant and at boundaries.
- Visible handles and labeled controls select/switch A and B; A translates with spacing preserved, B changes spacing, with any translation needed for snapped offsets applied to both anchors, and invalid attempts retain the last valid geometry for retry.
- Keyboard placement, focused-handle adjustment, larger Shift keyboard steps and count reinterpretation work. Normal B arrows change each cell by 0.5 px in all four directions, independent of sample count; default half-pixel A stays fixed. Advanced values match the rendered sample bounds and grid intersections. Offset values can change as cell size changes because they wrap within one cell; Advanced explains this. Unit/style edits preserve anchors; numeric edits invalidate them and invalid fields retain the last valid grid.
- Enter from the map, a focused handle, or Select A/B confirms and deselects the current valid placement, transfers focus to the map, and sends no save request. It also works with Pan enabled, retains invalid candidates for retry, and confirms the visible pending B candidate. Later hover leaves confirmed geometry unchanged. Shift B adjustment retains freeform 10-pixel sample movement; Enter after Shift release preserves that exact fractional geometry. Actual room command and library PATCH payloads retain keyboard-confirmed geometry through failure/retry.
- Focusing numeric fields or nudges restores confirmed values and clears the temporary preview. Empty and fractional text survives pointer movement and Shift changes while editing. Nudges use the confirmed draft. Room and library saves during a live preview submit confirmed geometry; intercepted command/PATCH payloads verify this directly.
- Equivalent map coordinates produce the same geometry after zoom. Swipes, Pan, Space-drag, middle-button navigation and Fit map preserve completed placement.
- A survives pointer cancellation, actual capture revocation, departure, blur, wheel navigation and window resizing during a pending press. These interruptions restore confirmed map geometry and field values, while retaining pending A and its recoverable keyboard corner. Interrupted releases do not place B; a later click retries successfully. An excursion above 6 CSS pixels remains a swipe after returning to the start.
- Start over retains draft, count and camera while clearing placement. Room Cancel, Escape, Close and backdrop paths discard unsaved edits without a command. All four library dismissal paths leave saved metadata unchanged without a PATCH.
- A rejected room Apply keeps the editor/draft available for retry. Repeated submit events issue one pending command; dismissal and editing remain locked. Replacing the scene resets geometry/units and ignores the obsolete Apply error.
- A failed library save retains completed anchors and its draft. A delayed retry locks controls and dismissal and suppresses duplicate submissions; exactly one successful retry writes the grid.
- A visible player token and board remain pixel-identical during the room draft. One successful room Apply reaches the player. Library edits leave the existing player room's grid/token pixels unchanged.
- Successful room/library uploads open setup, rejected room placement does not, and Set up later dismisses it. Explicit default grids can save in the library; configured placements skip setup and unconfigured placements open it.
- Touch taps, B repositioning, swipes and two-finger pinch/pan work at 320, 390 and 1366 pixels. The starting pinch midpoint remains attached to its map point when camera bounds allow movement. Releasing fingers one at a time never places an anchor; a subsequent tap can place A.
- Compact dialogs fit the viewport; A/B selection controls are reachable, content scrolls, and Cancel/Apply remain visible. Desktop and compact screenshots were visually inspected.

Browser checks found and fixed two interruption issues: capture revocation can be visible before the browser dispatches `lostpointercapture`, and window resizing can leave the fixed-width modal unchanged. The editor now checks capture at release and handles window resize independently of its SVG ResizeObserver.

Scene/accepted-grid resets were checked over the wire. The review harness also covers a delayed upload replacing a library target during an outstanding request, followed by another save, for both obsolete success and rejection. It includes reopening the same asset before its old save responds. GM-role reassignment remains inspected in the parent keys/role guards but is not simulated by the harness.

## PR #66 bugs reproduced and fixed — 2026-10-02

| Reproduction | Cause and correction |
| --- | --- |
| Place A with a 70 px seed, hover B at a 100 px cell size, then press an outward arrow. The field jumped to 70.5 instead of 100.5 and could change quadrant. | Pending B arrows used the original seed. They now adjust the visible sample. Chromium checks every count and quadrant, then interrupts and confirms the keyboard result. |
| Place A with a 70 px-wide one-cell seed, change to 3×3, then press Enter. The side grew to 70.5 px and cells became 23.5 rather than 70/3. Pending Shift keyboard geometry was also resnapped on Shift release. | Only a corner survived; rendering and confirmation quantized it again. Pending geometry now retains the complete sample and exact side, with validation on confirmation. Unit and Chromium coverage checks preserved bounds, freeform keyboard geometry and Pan-mode Enter. |
| Tab to an unselected A/B handle or control and press Enter. It became selected, allowing later hover to change the displayed values. | The Enter branch activated selection instead of confirming. Enter now leaves selection cleared and returns focus to the map, including with Pan enabled, without sending a save. |
| Start a slow library upload, open an existing map's editor and submit a delayed grid save, then complete the upload. The new setup editor remained locked by the old save. | Save state lived in the parent without cleanup or request-lifetime protection. Replacement now clears the lock; obsolete responses cannot affect the current editor or its pending save, even after reopening the same asset. Successful obsolete saves still refresh the library list. |

Numeric regression coverage also types an incomplete exponent (`1e`), moves over the map and toggles Shift, then completes it as `1e2`. The text survives and remains unsaveable until valid. An untouched seed still snaps normally after placing A with Shift and releasing it before confirming B. Existing save payloads, rejected-save retry, duplicate suppression, locked controls, upload/setup, player grid/token isolation, touch navigation, capture loss and compact layouts still pass. The 320px, 390px and desktop screenshots were visually inspected. Physical trackpad testing was **not performed**.

## Reproducible Chromium harness

`apps/web/scripts/grid-anchors-qa.mjs` adapts the existing room/library acceptance harness. It uses separate GM/player contexts, creates deterministic PNG test maps, observes outgoing room traffic, and intercepts rejected or delayed saves. Playwright is a QA dependency; it is not added to the production application.

Start isolated local servers in two terminals from the repository root:

```sh
env -u DATABASE_URL -u REDIS_URL PORT=5294 UPLOAD_DIR=/private/tmp/kan09-two-click-uploads npm run start --workspace=@vtt/server
VTT_SERVER=http://127.0.0.1:5294 npm run dev --workspace=@vtt/web -- --port 5293 --host 127.0.0.1
```

With Playwright available to Node, run:

```sh
node apps/web/scripts/grid-anchors-qa.mjs
```

For a separately installed Playwright, set `VTT_PLAYWRIGHT_MODULE` to its `index.mjs`. If its browser download uses a custom location, set `PLAYWRIGHT_BROWSERS_PATH` too. `VTT_QA_URL` selects another test origin and `VTT_QA_ARTIFACTS` selects the screenshot directory; both are optional. Use an isolated server because the harness creates rooms and library uploads.

## Manual browser and physical-trackpad checklist

Open http://127.0.0.1:5293, create a test room as GM, place a map and a visible token, and open Manage → Battle map → Adjust grid. Join the invite in a private window as a player. Repeat the shared editor checks in Library → an owned map → Edit grid.

1. Open Advanced, click/tap A at an intersection, and move the pointer without clicking: a provisional square/grid and temporary cell-size/X/Y readouts should match inside the editor. Save eligibility and the player's board should stay unchanged. Wait several seconds, switch applications, and return: the fields/map should restore confirmed values while A survives. Click B to finalize. Without Shift, cell size and X/Y offsets from placement should be exact multiples of 0.5 image pixels. Hold Shift when placing or repositioning anchors to retain arbitrary fractions; the preview and readouts should change as Shift is pressed/released.
2. Repeat in all four directions and near image borders. Choose 1 square, 3×3, and 5×5; changing count after placement should reinterpret the same bounds. Invalid candidates should retain the last valid grid and permit retry.
3. Select A using its handle and Select A, then move the pointer: live X/Y readouts should match its translation preview with spacing preserved. Click to confirm. Select B and move: cell size and offsets should track its resize preview; click to confirm. Snapping offsets can slightly translate both anchors to align them with the rounded grid; Shift retains the exact freeform A position. Switching between A and B should switch selection; a successful map placement should clear it. Try very small samples where the handles overlap.
4. Swipe/drag more than 6 CSS pixels, including out and back to the starting point: this should pan and never place an anchor. Test Pan, Space-drag, and the middle mouse button. Zoom, pan, Fit map, leave the preview, and resize the window between A and B: the next stationary click should still place B.
5. Use only the keyboard: focus the map, Enter to place A at the view center, arrows to adjust B, Enter to confirm. At 1×1, 3×3 and 5×5, normal B arrows should change each cell by 0.5 px, with A staying fixed for half-pixel geometry. A arrows translate by 1 image pixel. Shift uses freeform 10-pixel sample movement. Offsets wrap within a cell and may change during resizing even when A is fixed; the readouts should match the grid. Focus Select A/B or their handles, adjust, and press Enter: selection should clear and subsequent mouse movement toward Apply/Save should leave values unchanged. Repeat with Pan on and with a Shift-adjusted fractional sample after releasing Shift; Enter must preserve its geometry. Apply/Save should retain the keyboard-confirmed values. With no anchor selected/focused, arrows should pan.
6. Start over should clear handles, selection, provisional previews/readouts, and placement errors while preserving the last valid draft, camera, sample count, units, and style. During a preview, focus a numeric field or nudge: confirmed values should return and the preview should clear. Clear or type a fractional value and move the pointer over the map while the field stays focused: typed text should remain. Numeric geometry edits should clear handles; distance units and style edits should preserve them.
7. Before Apply, verify the player's map grid and token stay unchanged. Apply should commit once and update both clients. Reopen and try Cancel, Escape, Close, and backdrop dismissal: saved values should remain unchanged. Clear numeric fields or enter invalid values: save should be disabled and the last valid grid retained.
8. Upload a new room/library map: successful uploads should open setup; Set up later should close it without saving a grid. Save a library map's grid, place it in a room, and verify setup is skipped. Later library edits should affect future placements while existing rooms retain their grid.
9. At 320×700 and 390×700, use touch taps for A/B, single-finger swipes to pan, and two fingers to pan/pinch. Lifting fingers one at a time should never place an anchor. Check that A/B controls, scrolling, units, Cancel, and Apply/Save grid are reachable. Repeat on desktop.

Physical testing remains a manual follow-up in macOS Safari and Chromium: use both trackpad tap-to-click and physical clicks, pauses between anchors, two-finger navigation, selection/repositioning, and accidental finger movement. Browser touch simulation does not verify physical trackpad behavior. The original drag interruption cause remains unconfirmed.

Record failures with browser/version, pointer type, viewport, exact actions, expected/actual behavior, and a screenshot or short recording. Automated save rejection/delay checks are handled by the Chromium harness; do not modify production saved data to force a failure.

## Usability study still to run

First-use success and completion-time targets remain hypotheses. Recruit first-time GMs, counterbalance equivalent tasks against Roll20 and Foundry core, and measure help requests, unaided completion, grid setup time and full board preparation separately. Include printed grids, borders, large images, and gridless maps with a scale reference. Exact alignment supports axis-aligned square grids; rotated or distorted printed grids require approximation.
