## 1. Fog colour

- [x] 1.1 Add a unit test in `apps/web/test` for the palette derivation (trimmed mean, lifted saturation, bank and mist within the contrast limits) and verify it fails first
- [x] 1.2 Change `averageColor` and `makeFogCanvas` in `board/fogTexture.ts` to use it; verify the test passes and the default blue-grey is still used for a null colour

## 2. Fog outline

- [x] 2.1 Replace the fixed `FOG_EDGE` stroke in `boardView.ts` with a thin line in the fog's tone and remove the visible frame; verify with a Playwright screenshot as GM on the stone map

- [x] 2.2 Draw fog regions into a low-resolution mask texture rebuilt only when fog changes, and show the cloud texture through it so borders feather and billow; verify with Playwright screenshots in GM and player views that fog reads as mist with soft borders and still hides the map right up to the edge
- [x] 2.3 Confirm drift stays smooth and there are no console errors; verify by watching the board for a few seconds and reading the console

## 3. Show menu

- [x] 3.1 Find which rule stacks the rows and fix `.board-filters-row` and `.board-filters-menu` in `styles.css`; verify with a Playwright screenshot that checkbox and label share a line and the menu hugs its content

## 4. Done

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test` and verify all pass
