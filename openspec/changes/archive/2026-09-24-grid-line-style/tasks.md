## 0. Architecture review

- [x] 0.1 Real-Time Architecture owner reviews and accepts ADR 0005 (`docs/adr/0005-grid-line-style.md`) before any `packages/shared` change.

## 1. Contract

- [x] 1.1 `GridSpec`: optional `lineColor`, `lineWidth` and `lineOpacity`; export `GRID_LINE_WIDTHS` and `gridLineStyle()`.
- [x] 1.2 Shared unit tests: schema accept/reject, defaults, `grid.set` → `GridSet` carries style and previous style, `reduce`, replay of an old event.

## 2. Board

- [x] 2.1 `syncGrid` draws with `gridLineStyle(grid)` and invalidates.

## 3. Grid modal

- [x] 3.1 `ui/color.ts` helpers with unit tests; `ui/ColorWheel.tsx` (canvas wheel, brightness, hex field, swatches, keyboard).
- [x] 3.2 `GridForm` Advanced disclosure (closed by default; the row shows just its label and arrow): preview, colour wheel, preset thickness slider, opacity slider (5–100%); Apply sends the style with the grid. Restyled with the redesign, taste and high-end frontend skills.

## 4. Verification

- [x] 4.1 Server integration: the GM's styled grid reaches a second client; a player's `grid.set` is rejected.
- [x] 4.2 Browser: GM and player boards show a white, Thick, 80% grid; it survives a reload; wheel click and arrow keys pick colours. Saving to the library and re-placing the map is covered by `library.test.ts` (the built-in maps have no library row to save to).
- [x] 4.3 `npx openspec validate grid-line-style`, then `npm run lint && npm run typecheck && npm test`.
