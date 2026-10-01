# Tasks

## 1. Matching a throw to its roll

- [x] 1.1 In `net/roomConnection.ts`, keep a bounded map (last 32) from committed seq to the roll id of each applied `DiceRolled` event, cleared on `welcome`. Expose a `rollForSeq(seq): Promise<string | null>` that resolves at once if the event has been applied, waits for it otherwise, and resolves null on a `welcome` or after 5 s. Verify: unit tests for event-before-ack, event-after-ack, a resync in between, and eviction.

## 2. Board mapping (inside `board/`)

- [x] 2.1 Add a public `clientToBoard(clientX, clientY): Point | null` to `BoardView`. Verify: a unit test round-trips through a known world transform.
- [x] 2.2 Add `onViewChange(fn)` to `BoardView`, fired from the render path when the world's scale or position changes. Verify: panning and zooming in the browser logs one notification per rendered frame, and none while idle.

## 3. Shared dice rendering

- [x] 3.1 Factor the per-die DOM and `layoutDice` out of `ui/DiceTray.tsx` into a shared `Die3D` renderer that the tray keeps using. Verify: `diceGeometry.test.ts` passes, and the tray and home-page demo look unchanged in the browser.
- [x] 3.2 Add a travelling-throw keyframe builder in `diceGeometry.ts`. Its input is `(rollId, dice, from, to)`. It moves from `from` to `to` with two bounces and seeded per-die landing offsets, ends exactly on the seeded rest pose, and takes `throwDuration(count)` in total. Verify: unit tests check that the last frame equals the rest transform, that the path starts at `from` and ends within the landing spread of `to`, and that the output is identical for the same inputs.

## 4. Board overlay and drag

- [x] 4.1 Create `board/ThrownDice.tsx` (React, no Pixi objects; CSS `thrown-dice`): a `pointer-events: none` layer over the canvas whose container follows `onViewChange`. It plays a `BoardThrow { rollId, from, to }` for a roll's dice, holds them 3 s, fades them over 400 ms and removes them, with at most 3 rolls on screen. Verify: in the browser, dice stay on the same map spot while panning and zooming, and board clicks pass through.
- [x] 4.2 Use the room page's throw state (`rollThrow`, from `board-dice-rolls`) for dropped dice: `hold` when the die is let go, `release` once its roll is matched, and `onLanded` when the dropped dice land. `landRoll` ignores a stale landing, and a full snapshot clears the hold and the drop. (Replaces this change's earlier `diceLanding` reducer.) Verify: in the browser, a drag shows no centred throw and the popup appears when the dropped dice land; a Roll right after is thrown in the centre as usual.
- [x] 4.3 Route a matched throw to the drop point, or release it to the ordinary centred throw when a fallback applies: reduced motion, no `Element.animate`, or no board mounted. Verify: tests on the routing function, plus a manual check with reduced motion emulated.
- [x] 4.4 The Dice panel row and the board popup hold the result until the dropped dice land; the centred overlay shows only the popup for a dropped roll (`droppedId`). Verify: in the browser, the total and the popup appear as the dropped dice land, with no centred dice.
- [x] 4.5 Add the drag handle (`panels/DiceThrowHandle.tsx`) to `DicePanel`, using pointer capture and `touch-action: none`. It is disabled, with a hint saying why, on an invalid expression, with no map, or when the expression rolls more than `BOARD_THROW_MAX_DICE` (10) dice. Unit tests cover the enable rule: `10d6` is allowed, `11d6` and `12d6` are not. While held, a spinning ghost die follows the pointer, and Esc or a release off the canvas cancels. Verify: in the browser, with a mouse and with the mobile viewport preset.
- [x] 4.6 On release, compute `from` and a clamped `to` from the last ~80 ms of pointer velocity, then send the plain `dice.roll`. Resolve the roll id via `rollForSeq(ack.seq)` and hand the `BoardThrow` to the overlay. The ghost spins at the release point until then. On a rejection, a 5 s timeout or a null match, it fades, and the panel shows the error or the roll at rest. Verify: tests on the velocity→landing function (clamping, slow vs fast); a manual check with the server stopped shows the timeout message.
- [x] 4.7 Styles in `styles.css` for the handle, ghost, overlay and fade (the room is dark-only, per `theme.ts`). Verify: screenshots of a throw.

## 5. Fallback

- [ ] 5.1 If touch drag from the panel proves unreliable on the phone layout, add a "Throw on map" tap on the handle that throws from the centre of the visible map with a seeded direction. Verify: a manual check in the mobile viewport.

## 6. Wrap-up

- [x] 6.1 Confirm the throw adds nothing to the wire: a test that a drag-throw sends exactly one `dice.roll` command, equal to the Roll button's, and no ephemeral message. Verify: the test passes.
- [ ] 6.2 Run the sync-reviewer agent on the diff (it touches `RoomConnection`) and address any findings. Verify: it reports no violations.
- [x] 6.3 `npm run lint && npm run typecheck && npm test` pass, and a two-viewer run (GM + player) matches every scenario in `specs/board-dice-throw/spec.md`: the thrower sees the board throw, and the other viewer receives only the usual roll. (The second viewer was a socket client: the Playwright browser was shared with another session.)

## 7. Combine with board-dice-rolls

- [x] 7.1 Merge `main` (with `board-dice-rolls`, #61) and resolve `roomConnection.ts` (keep both the snapshot count and the roll-by-seq record), `RoomPanel.tsx` and `DicePanel.tsx` (#61's version plus the drag die). Verify: lint, typecheck and all tests pass.
- [x] 7.2 Disable the drag die for private rolls (`throwBlocker`), since `board-dice-rolls` keeps them off the board. Verify: a unit test, and the hint in the browser.
- [x] 7.3 Rename the overlay to `ThrownDice` / `thrown-dice` so it no longer shares #61's `BoardDice` / `board-dice` names, and drop the tray's unused waiting state. Verify: no `board-dice` rules apply to the dropped dice.

## 8. Replay for everyone, and the corner card

- [x] 8.1 Add the `diceDrop` ephemeral payload (`packages/shared/src/protocol.ts`) and ADR 0014. The server relays it only when both points are on the map. Verify: `apps/server/test/sync.test.ts` checks a drop is relayed to everyone else unsequenced, and a drop off the map is not relayed.
- [x] 8.2 Send the drop just before the roll (`DicePanel`). Receivers keep the latest drop per sender for 5 s and replay the throw at those points when that sender's matching roll arrives, instead of the centred throw (`RoomPage`). Verify: in two browser tabs, the other tab's dice land at the same board positions as the thrower's, with no centred dice.
- [x] 8.3 Move the result card to the board's bottom-right corner, sliding in from the right and back out over 4 s (`ui/BoardDice.tsx`, `styles.css`), still under reduced motion. Verify: in the browser, the card sits 12 px from the board's right and bottom edges, after both a dropped roll and a Roll.
- [ ] 8.4 Review of ADR 0014 by the Real-Time Architecture owner (with section 9's changes).


## 9. Each roll on its own, no centred broadcast

- [x] 9.1 Replace the room page's single roll in the air (`rollThrow` with hold and release, the stale-landing guard, `net/rollsBySeq.ts`) with one decision per roll as it arrives (`RoomConnection.onRolled`, `RoomPage`): at its drop, in the middle of the roller's own board, in the GM's panel tray, or card only. Rolls in the air are a set (`airborne`) read by the Dice panel, the Attack card and the Rulings list, which drops its own timer. Verify: in the browser, three drags with a Roll in between each land at their own spot (release (192,320) → dice (200,323), (384,486) → (392,489), Roll → board centre (376,410), (614,294) → (622,297)), with no centred dice.
- [x] 9.2 Keep dice drops in order per thrower, the thrower's own included (`board/diceDrops.ts`); a refused throw forgets its drop. Verify: `apps/web/test/diceDrops.test.ts`.
- [x] 9.3 Throw a roll made with Roll into the middle of the roller's visible board (`BoardHandle.centreAim`, `centreThrow`), also with no map; others get only the card. Remove `board-dice-rolls`' centred overlay (`ui/BoardDice.tsx` becomes `ui/RollCard.tsx`). Verify: `diceThrow.test.ts`; in the browser, a second participant's Roll shows only the card on the GM's board.
- [x] 9.4 Relay dice drops reliably instead of volatile (`liveRoom.ts`, ADR 0014 updated). Verify: `sync.test.ts` checks two drops sent back to back both arrive; it fails with the volatile relay. In the browser, a second participant's two back-to-back drops replay at their own spots.
