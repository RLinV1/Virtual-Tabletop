# Tasks

## 1. Manual grid draft

- [x] 1.1 Keep editable grid values as strings and validate positive size and units plus canonical offsets in `gridDraft.ts`; verify the form can hold an empty field and `npm run typecheck` passes.
- [x] 1.2 Put the correction form, one- and five-pixel nudges, manual-confidence label and validation message in Battle map → Adjust grid; verify the controls are present in `GmPanel.tsx` and `npm run lint` passes.

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

### Review QA record — 2026-09-26

The full suite passed with 250 tests and 8 environment-dependent skips. Typecheck, lint, build, and strict OpenSpec validation passed. A focused server WebSocket test confirmed that an invalid offset returns a matched rejection and leaves the room grid unchanged. Browser checks confirmed that a 0.05 px draft on the generic board disables Apply, shows a 0.07 px minimum, and keeps the last valid preview. The existing 13 KAN-10 browser acceptance checks also passed.
