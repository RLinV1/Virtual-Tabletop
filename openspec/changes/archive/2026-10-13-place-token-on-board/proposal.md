## Why

Add token put every new token at a spot fanned out around the map's centre, so the GM had to drag each one to where it belongs afterwards. The GM asked to choose where a token spawns by pointing at the square on the grid.

## What Changes

- Add token's form now ends in **Choose a square** instead of creating the token. The dialog closes and the board enters a placing mode. KAN-12's size, rotation and HP / Max HP / AC fields stay in the form; its Board X / Board Y fields are removed, since the square is picked on the board.
- While placing, a faded copy of the token (colour, image, name, size, facing, HP bar, hidden look) follows the pointer. It is snapped to the square it would occupy, and that square is highlighted. Alt places freely, as it does for moving.
- A click or tap on the board creates the token there with one `token.create`. A drag still pans, and the wheel and pinch still zoom.
- A bar over the board names the token and offers **Place automatically** (the old fan-out, and the keyboard path, which gets focus) and **Cancel**. Esc, right-click and choosing a rail tool also cancel. A rejection keeps placing mode and shows the server's message.
- `Modal` gains an `onAfterClose` callback, so the board takes focus only after the dialog has returned it to its opener.
- **No contract change.** `token.create` already carries `position`. Commands, events, state, visibility and the server are untouched, and nothing is sent until the GM picks a square.

## Capabilities

### New Capabilities
- `token-placement`: how the GM chooses where a new token is created.

### Modified Capabilities
- None.

## Impact

- `apps/web`: new `board/placement.ts` (pure snapping, footprint and auto-placement), `test/placement.test.ts`; `board/boardView.ts` (placing mode, ghost and footprint), `board/Board.tsx` (draft state, bar, command); `panels/AddToken.tsx`, `TokenRoster.tsx`, `RoomPanel.tsx`, `pages/RoomPage.tsx` (passing the draft from the form to the board); `ui/Modal.tsx`; `ui/guide.ts`; `styles.css`.
- **KAN-12 (#41):** its fields describe the token and this change picks the square. The token editor keeps its Board X / Y fields for exact moves of a placed token.
