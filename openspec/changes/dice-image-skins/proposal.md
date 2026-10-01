# Proposal

## Why

Since `add-3d-dice-animation` and `throw-dice-on-board`, every roll is thrown as the same rust dice. Players at a real table bring their own dice, and wanted theirs to look like theirs here too, from dice they paint themselves or have an image AI paint. The 3D dice are already drawn face by face from the dice's real geometry, so a picture can be laid on each face exactly.

This change records the feature as built on branch `feat/dice-image-skins`.

## What Changes

- **Dice looks.** A dice look is a named set of pictures, one per die type (d4, d6, d8, d10, d12, d20). A die type without a picture keeps the classic look.
- **Made in the asset library, in a new Dice tab** (`/library?tab=dice`), laid out like the other tabs:
  - the toolbar has name search and **New dice look**;
  - each look is a card with a preview, **Use**, **Edit** and **Delete** (with the inline delete confirm).
  - The Dice tab opens for any browser, players included: looks involve no GM data. The other tabs keep the GM entry rule.
- **The look editor** has the look's name and **Copy AI prompt**, then a card per die with a single **Edit** menu:
  - **Copy template:** puts the die's template image on the clipboard, or saves it as a file where the clipboard won't take an image.
  - **Upload picture** / **Replace picture.**
  - **Reset to classic.**
  - Changes save as they are made.
- **Templates for every die.** Each is a 1536 × 1024 sheet with a grid of cells, one face per cell, numbered as on a standard die. Each cell shows:
  - the face's exact outline, centred;
  - where the app prints the number, which should be kept calm;
  - which way is up.
- **One AI prompt** covers every die: give it with a die's template for a painted template, or alone for one square picture that goes on every face.
- **Uploads:** PNG, JPEG or WebP up to 5 MB, either 3:2 (a painted template, any size) or 1:1 (one picture on every face). The picture is redrawn in the browser and kept as plain pixels.
- **Picked in the room.** The Dice panel gains a **Dice look** selector (Classic or a saved look) and an **Edit looks** link that opens the library in a new tab. A look saved in the library shows up in an open room at once.
- **Your own dice only.** The look draws your own public rolls on the board, both when they're thrown in the centre (`board-dice-rolls`) and when you drop a die on the map (`throw-dice-on-board`), and on the die you drag. The Dice panel tray and the attack card now only show GM-only rolls, which keep the private look.
  - Each face shows its part of the picture under the die's shading, and the app still prints the numbers, so a look changes how a die looks, never what it reads.
  - GM-only rolls keep the private slate look.
  - Other people's rolls stay classic on your screen.
- **Kept in the browser, seen only by you.** Looks live in IndexedDB, and which one is in use is a small local setting. Nothing is sent to the server or to other players, and there is no contract change and no ADR. The one-skin d6 prototype's picture is moved into a look once.

## Capabilities

### New Capabilities
- `dice-looks`: making dice looks from templates and pictures, what a look may and may not change about a die, where it is drawn, and that it stays in the viewer's browser.

### Modified Capabilities
- `asset-library`: the library page gains a Dice tab beside Maps, Token Art and Creatures, searchable by name like them.
- `gm-dashboard`: the entry rule for GM surfaces gains one exception: `/library?tab=dice` opens the Dice tab alone for a browser that isn't recognised, instead of sending it to sign-in.

## Impact

- **apps/web, new files:**
  - `ui/diceSkin.ts`: templates, face mapping, upload checks, the prompt;
  - `ui/diceSkinStore.ts`: IndexedDB store, active look, clipboard;
  - `pages/DiceLooks.tsx`: the library tab and editor;
  - `panels/DiceLookPicker.tsx`: the room selector;
  - `test/diceSkin.test.ts`.
- **apps/web, changed files:**
  - `ui/Die3D.tsx`: draws a face's picture, clipped, under the shading;
  - `ui/DiceTray.tsx`, `board/ThrownDice.tsx`, `pages/RoomPage.tsx`, `panels/DiceThrowHandle.tsx`, `panels/AttackPanel.tsx`, `panels/DicePanel.tsx`: pass your look for your own rolls;
  - `pages/LibraryPage.tsx`, `panels/RoomPanel.tsx`, `ui/diceGeometry.ts` (exports the standard numbering), `styles.css`.
- **docs:** `docs/DICE-SKINS.md` (how the dice look is built, the image-look format, the prompt), `docs/dice-templates/` (snapshots of the six templates).
- **packages/shared, apps/server:** none.
- **Dependencies:** none.
