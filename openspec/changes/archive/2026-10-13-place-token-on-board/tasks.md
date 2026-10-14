## 1. Placement

- [x] 1.1 `board/placement.ts`: `placementPoint`, `footprint`, `autoPlacementPoint`; verify with `test/placement.test.ts`
- [x] 1.2 `BoardView.setPlacement`: ghost token and footprint under the pointer, click or tap places, drag pans, right-click cancels, pings off; verify in the browser on desktop and at 375 px
- [x] 1.3 `Board`: draft state, the placing bar (Place automatically, Cancel, rejection message), Esc and rail tools cancel, one `token.create` per placement; verify the roster gains exactly one token per click and none on cancel

## 2. Form and wiring

- [x] 2.1 Add token ends in Choose a square and hands its draft to the board through `RoomPage → RoomPanel → TokenRoster`; `Modal.onAfterClose` so focus lands on Place automatically; verify a keyboard-only run three times in a row
- [x] 2.2 Update the `gm-add-token` tour step

## 3. Verify

- [x] 3.1 `npm run lint && npm run typecheck && npm test` clean
- [x] 3.2 Rebase onto KAN-12 (#41): keep its size, rotation and stats fields in Add token, drop Board X / Y, and draw the ghost with the chosen size, facing and HP bar
