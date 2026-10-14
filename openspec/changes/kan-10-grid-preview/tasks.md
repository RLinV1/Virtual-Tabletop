# Tasks

## 1. Manual grid draft

- [x] 1.1 Keep editable grid values as strings and validate positive size and units plus canonical offsets in `gridDraft.ts`; verify the form can hold an empty field and `npm run typecheck` passes.
- [x] 1.2 Put the correction form, one- and five-pixel nudges, current-grid label and validation message in Battle map → Adjust grid; verify the controls are present in `GmPanel.tsx` and `npm run lint` passes.

## 2. Private preview and application

- [x] 2.1 Share draft state between the modal and board, clear it on dismissal or scene change, and keep the preview GM-only; verify the flow in `RoomPage.tsx` and `npm run typecheck` passes.
- [x] 2.2 Draw a visually distinct grid and unapplied label without changing token layout, including the missing-map fallback and a line-count guard; verify `npm run build` passes.
- [x] 2.3 Submit only a valid changed grid through `scene.setGrid`, close on success and show a rejection in the modal; verify the existing shared/server tests and `npm run typecheck` pass.

## 3. Browser acceptance

- [x] 3.1 In separate GM and player browser sessions, edit a grid and verify that only the GM sees the draft while both clients retain the accepted grid and token positions until Apply; confirm one accepted change reaches both after Apply.
- [x] 3.2 In a GM browser session, verify blank and out-of-range fields disable Apply, a last valid preview remains visible, and Cancel, Escape, close button and backdrop discard the preview with no command; verify a rejected Apply keeps the modal open with an error.
- [x] 3.3 At 320px and 390px widths, verify the Adjust grid modal remains usable and the preview can be inspected; record any mobile visibility limitation for the team review.

### Browser QA record — 2026-09-25

Automated in headless Chromium with separate GM and player browser contexts. The desktop GM viewport was 1440 × 900; the player viewport was 1160 × 800. The player board screenshot was identical before and during the GM draft, then changed after one accepted Apply. The GM's uncovered board region was identical before and after clearing a field, confirming the last valid preview remained. A valid style edit updated the modal preview without changing the player view.

Blank and out-of-range fields disabled Apply. Cancel, Escape, Close, and backdrop dismissal cleared the draft without a grid command. A WebSocket-intercepted `rejected` response, sent without forwarding the attempted command to the server, kept the dialog open with its error and left the accepted grid unchanged. No browser page errors occurred.

At 320 × 700 and 390 × 700, the dialog and its controls stayed within the viewport width and remained reachable by scrolling. The modal obscures most of the board at these widths, so the board overlay cannot be inspected alongside the form; the map-and-grid preview inside Advanced remained visible.

## 4. PR review follow-up

- [x] 4.1 Enforce canonical offsets in the shared grid schema and return a matched rejection for malformed commands; verify shared and server tests reject noncanonical grids without changing room state.
- [x] 4.2 Share the board's line-count limit with draft validation, disable Apply with a map-specific minimum for excessive drafts, and retain the last valid preview; verify web tests and browser behavior.
- [x] 4.3 Merge the room top bar, persistent panel tabs, and board tool rail from main; keep grid calibration in Manage and the preview on the board; verify desktop and compact browser flows.

### Review QA record — 2026-09-26

The full suite passed with 250 tests and 8 environment-dependent skips. Typecheck, lint, build, and strict OpenSpec validation passed. A focused server WebSocket test confirmed that an invalid offset returns a matched rejection and leaves the room grid unchanged. Browser checks confirmed that a 0.05 px draft on the generic board disables Apply, shows a 0.07 px minimum, and keeps the last valid preview. The existing 13 KAN-10 browser acceptance checks also passed.

After merging mainline, the full suite passed with 352 tests and 9 environment-dependent skips. Typecheck, lint, build, and strict OpenSpec validation passed again. The 13 GM/player browser checks passed in the new Manage tab, including one Apply reaching both boards, private preview, invalid drafts, four dismissal paths, and 320 px and 390 px modal layout. Six focused browser checks covered excessive line count, resizing with the dialog open, dismissal, locked style controls during Apply, and late command results.


## 5. KAN-09 two-click grid anchors

- [x] 5.1 Replace dragging with two qualified click/tap releases, provisional editor-only previews, durable A/B placement and valid-only draft updates.
- [x] 5.2 Add A/B selection and repositioning, count reinterpretation, Start over, accessible status/help and keyboard placement/adjustment.
- [x] 5.3 Implement movement qualification, swipe/pan navigation, pinch midpoint anchoring and multi-touch placement suppression; preserve anchors through transient interruptions and camera changes.
- [x] 5.4 Add frontend geometry and transition coverage for fractional values, reverse quadrants, bounds, invalid attempts, selection, count changes, thresholds and interruption recovery.
- [x] 5.5 Update room/library contracts and active design to describe the implemented click behavior; replace obsolete drag QA claims.
- [x] 5.6 Complete room/library browser acceptance, including GM/player isolation, saves/retries, dismissal, setup flows, touch and compact layouts; record actual results in docs/QA-grid-sample.md.
- [x] 5.7 Run lint, full typecheck, tests, production build and strict OpenSpec validation; record actual results and environment skips.
- [ ] 5.8 Manually test macOS Safari and Chromium with physical trackpad tap-to-click, clicks, pauses, two-finger navigation, repositioning and accidental movement.

## 6. Requested side snapping

- [x] 6.1 Snap placement and pointer resizing to 0.5 image-pixel cell increments while Shift enables freeform; preserve A, quadrants, edge limits and exact saved cell size.
- [x] 6.2 Add geometry/transition coverage for snapped counts, fractional A, boundaries, zero-sized attempts, freeform overrides, translation and count reinterpretation.
- [x] 6.3 Verify snapped placement, B resizing and Shift preview/commit behavior in the Chromium harness, rerun required checks and record final results.

### KAN-09 verification record — 2026-09-30

Final lint, typecheck, tests and production build passed. There were 536 passing tests and 19 environment-dependent store skips, including 52 frontend geometry/transition cases. All 30 final Chromium room/library assertion groups passed with separate GM/player contexts, a visible token, rejected/delayed saves, actual capture loss, pending presses, keyboard controls, snapped/freeform placement, touch gestures and 320×700/390×700 layouts. Strict validation passed for this change and the updated room/library contracts. See `docs/QA-grid-sample.md` for the reproducible harness, exact scope, skips, lifecycle paths inspected in code, and physical-trackpad checklist. Task 5.8 remains manual; the original drag interruption cause is unconfirmed.

## 7. Requested X/Y offset snapping

- [x] 7.1 Snap anchor placement and adjustment offsets to 0.5 image pixels, preserve Shift freeform behavior, align sample handles and maintain spacing within image bounds.
- [x] 7.2 Cover snapped canonical offsets, fractional cell sizes, all quadrants/boundaries, exact zero normalization and freeform overrides in frontend tests.
- [x] 7.3 Verify room/library browser acceptance, rerun required checks, validate the updated contracts and record final results.

### Offset snapping verification — 2026-10-01

Final lint, typecheck, build and strict contract validation passed. The full suite passed 550 tests with 19 environment-dependent store skips; 66 frontend sample/interaction cases include canonical offset snapping, fractional spacing, quadrant boundaries and Shift-equivalent freeform overrides. All 31 Chromium acceptance groups passed, including exact default X/Y values and fractional Shift repositioning, plus the existing room/library save, isolation, keyboard and compact touch checks. Physical Safari/Chromium trackpad testing remains the manual follow-up in task 5.8.

## 8. Live Advanced geometry values

- [x] 8.1 Show temporary cell size and X/Y preview values in Advanced, with snapped/Shift geometry and accessible confirmation help, without changing the confirmed draft, save eligibility or player state.
- [x] 8.2 Restore confirmed values on preview interruption and give numeric focus, typing and nudges precedence while retaining existing placement recovery and validation.
- [x] 8.3 Verify live placement/repositioning, confirmation, interruptions, numeric editing and actual submitted geometry in room/library browser QA; run required checks and update contracts and the QA record.

### Live geometry verification — 2026-10-02

Lint, full typecheck, tests, build and strict OpenSpec validation passed. The suite passed 550 tests with 19 environment-dependent store skips; all 35 Chromium assertion groups passed without page errors. New browser checks verify live snapped/freeform geometry, seed/keyboard placement, interruption restoration, numeric focus/typing/nudges, confirmed-only room command and library PATCH payloads, and the missing-map fallback. Existing player isolation, retries, locked saves, dismissal/reset flows and compact touch checks also passed. The manual physical-trackpad follow-up in task 5.8 remains outstanding. See `docs/QA-grid-sample.md` for results and reproduction steps.

## 9. Keyboard B snapping and Enter confirmation

- [x] 9.1 Investigate third-pixel cell changes and apparent offset movement; use half-pixel cell steps for normal B arrows at every count, retain Shift freeform steps, and explain canonical offsets while keeping readouts aligned with geometry.
- [x] 9.2 Make Enter confirm/deselect the current A/B adjustment from map, handles and selection controls without submitting; preserve freeform geometry and disable subsequent hover changes until reselection.
- [x] 9.3 Cover direction/count/quadrant/boundary geometry, Enter recovery, stable post-confirmation hover and actual room/library save payloads; run required checks and update contracts and QA results.

### Keyboard confirmation verification — 2026-10-02

Lint, full typecheck, build, tests and strict validation passed. There were 563 passing tests and 19 environment-dependent store skips, including 79 sample/interaction cases. All 39 Chromium assertion groups passed without page errors. New checks cover half-pixel B arrows in all directions, A/grid/readout alignment, map/handle/control Enter, Pan-mode confirmation, Shift geometry retention, invalid candidate retry, visible provisional B confirmation, stable hover after deselection, and keyboard-adjusted room/library save payloads through failure/retry. Canonical offsets change with spacing to preserve A; Advanced now explains this rather than hiding the values. Physical-trackpad task 5.8 remains manual.

### Mainline pull-request verification — 2026-10-02

The feature branch starts from mainline `bb89754`. Final lint, full typecheck, tests and build passed with 739 tests and 20 environment-dependent store skips. All 39 Chromium assertion groups passed against fresh isolated mainline-based processes, with no page errors. Strict validation passed for this change and both updated contracts. The 79 focused sample/interaction cases and the physical-trackpad follow-up in task 5.8 remain as recorded above.

## 10. PR #66 correctness review

- [x] 10.1 Reproduce and fix pending B arrows jumping to the seed; cover every count and quadrant, with recovery after interruption.
- [x] 10.2 Preserve exact pending sample bounds through count reinterpretation, Shift keyboard adjustment and Enter, including Pan mode.
- [x] 10.3 Confirm focused unselected A/B handles and controls without selecting or submitting; return focus to the map and keep hover stable.
- [x] 10.4 Reset library save locks on editor replacement and prevent obsolete success/rejection from affecting newer editors/saves, including reopening the same asset.
- [x] 10.5 Run lint, typecheck, full tests, build, expanded Chromium QA and strict OpenSpec validation; record results and remaining environment/manual gaps in `docs/QA-grid-sample.md`.

The review passed 743 tests with 20 Postgres/Redis-dependent skips, 83 focused sample/interaction cases, and 43 Chromium assertion groups. Lint, typecheck, production build and strict validation of this change and both affected contracts passed. The existing dependency annotation and bundle-size warnings remain. Physical-trackpad task 5.8 and browser simulation of GM-role reassignment remain unverified.
