# Tasks

## 1. Board font

- [x] 1.1 In `apps/web/src/board/boardView.ts`, add a module-level `BOARD_FONT = '"Helvetica Neue", Arial, sans-serif'` constant. Add a short comment explaining why `system-ui` is avoided: Pixi measures text on an `OffscreenCanvas` but draws it on a DOM canvas, and Firefox resolves `system-ui` differently in the two. Verify by reading the diff.
- [x] 1.2 Use `BOARD_FONT` as the `fontFamily` of the token name label, the `measureLabel` ruler/AoE distance label and the condition-marker abbreviation text. Verify that `grep -rn "system-ui" apps/web/src --include=*.ts --include=*.tsx` returns nothing.

## 2. Checks

- [x] 2.1 Run `npm run lint && npm run typecheck && npm test` and verify all three pass.
- [x] 2.2 Manual check in Firefox on macOS with `npm run dev`. Place tokens named "abcdefghijklmnopqrstuvwxyz" and a 60-character name on an empty board. Verify both labels show every character at the minimum, default and maximum zoom, and that a hidden token's " (hidden)" suffix is drawn in full for the GM. Verify a ruler measurement label and a condition marker abbreviation still show in full.
- [x] 2.3 Repeat the name checks from 2.2 in Safari and Chrome, and verify the labels are drawn in full and look as they did before, apart from the font.
