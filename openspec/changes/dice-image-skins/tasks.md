# Tasks

## 1. Templates and mapping

- [x] 1.1 Export the standard numbering (`standardLabels`) from `ui/diceGeometry.ts`, so template cells follow the numbers on a standard die. Verify: `diceGeometry.test.ts` passes unchanged.
- [x] 1.2 Add `ui/diceSkin.ts`:
  - `templateSpec` (grid, scale and per-face offsets on a 1536 × 1024 canvas);
  - `tileForFace`, `faceArt` and `faceImageTransform`;
  - `skinLayoutFor` and `keptSize`;
  - `templateSvg` (outlines, numeral zones, up marks, captions);
  - `DICE_PROMPT`.
  
  Verify: `test/diceSkin.test.ts` checks, for all six dice, that the grid fits, each face has its own cell, each outline sits centred in its cell, and every face corner lands on the rendered face. It also checks that the d6 keeps the prototype's grid.
- [x] 1.3 Export the six templates to `docs/dice-templates/` (PNG and SVG) and review them by eye. Verify: the files render with centred outlines, numbers and up marks.

## 2. Storage

- [x] 2.1 Add `ui/diceSkinStore.ts`. It holds:
  - looks in IndexedDB;
  - the look in use in `localStorage`;
  - a `BroadcastChannel` to other tabs;
  - `createDiceLook`, `saveDiceLook`, `deleteDiceLook`, `setActiveDiceLook`;
  - `readSkinFile` (type, size and shape checks; redraw to plain pixels);
  - `copyTemplate` (clipboard image, or a saved file) and `copyText`.
  
  Verify: in the browser, looks survive a reload, and a rename in the library reaches an open room tab without a reload.
- [x] 2.2 Move the prototype's `vtt.diceSkin.d6` picture into a look once, removing the key before anything waits. Verify: the migrated look appeared once; the duplicate from the first version was traced to a hot-reload race and fixed.

## 3. Drawing

- [x] 3.1 `Die3D` draws the look's picture for its die type: clipped to each face on a wrapping group, with the shading and result highlight as tints over it and outlined numerals. Verify: in the browser, a per-cell colour test sheet put each cell on its own face, with the up mark above the numeral, on the d6 and the d20.
- [x] 3.2 Pass the look only for the viewer's own public rolls: the centred board throw (`board-dice-rolls`), dice dropped on the map, and the held die. Verify: in the browser, a Roll of 1d20 is thrown in the centre in the look, a dropped 2d6 lands in the look, a GM-only roll stays slate, and dice without a picture stay classic.

## 4. Library and room UI

- [x] 4.1 Add the Dice tab to `LibraryPage`. It uses the shared toolbar (search, New dice look), `asset-card`s with Use, Edit and Delete (inline confirm), and an empty state. Verify: in the browser, search filters, the delete confirm cancels, and New dice look makes "Dice look 3" and opens it.
- [x] 4.2 Build the look editor in `pages/DiceLooks.tsx`:
  - the name field;
  - Copy AI prompt;
  - a card per die with an Edit menu (Copy template, Upload/Replace picture, Reset to classic) on `PopoverButton`;
  - a short note over the preview after an action.
  
  Verify: in the browser, with a stand-in clipboard:
  - Copy template gives a 1536 × 1024 PNG;
  - Copy AI prompt copies the prompt;
  - upload then reset works;
  - Escape closes the menu and returns focus;
  - a die without a picture has no Reset item.
- [x] 4.3 Open `/library?tab=dice` on its own for a browser that isn't recognised. Verify: typecheck, and the page's code path reviewed.
- [x] 4.4 Add the Dice look selector and Edit looks link to the room's Dice panel (`panels/DiceLookPicker.tsx`). Verify: in the browser, choosing Classic removes the look from the held die and the library card shows Use again.
- [x] 4.5 Styles in `styles.css` for the cards, menu and note, with motion only under `prefers-reduced-motion: no-preference`. Verify: screenshots of the tab, the editor and the open menu.

## 5. Docs and checks

- [x] 5.1 Document the image looks, the templates and the prompt in `docs/DICE-SKINS.md`. Verify: the examples validate against the JSON Schema in the same file.
- [x] 5.2 `npm run lint && npm run typecheck && npm test` pass.
- [ ] 5.3 In a browser that has never been a GM here, open `/library?tab=dice` from a room's Edit looks link. Verify: the Dice tab opens with no sign-in and no GM tabs.
- [ ] 5.4 In real Chrome, Safari and Firefox (127 or later), choose Copy template and paste into an image AI. Verify: the template image pastes. Where it can't be copied, the template is saved as a file and the card says so.

## 6. Combine with board-dice-rolls

- [x] 6.1 Merge the updated `throw-dice-on-board` branch (now built on `board-dice-rolls`, #61). Take #61's compact Attack section whole: its tray only shows GM-only rolls, so it needs no look. Give `ui/BoardDice.tsx` the viewer's id so their own centred throws wear their look. Verify: lint, typecheck and all tests pass; the browser checks in 3.2.

