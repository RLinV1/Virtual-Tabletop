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

- [x] 4.1 Create `board/BoardDice.tsx` (React, no Pixi objects): a `pointer-events: none` layer over the canvas whose container follows `onViewChange`. It plays a `BoardThrow { rollId, from, to }` for a roll's dice, holds them 3 s, fades them over 400 ms and removes them, with at most 3 rolls on screen. Verify: in the browser, dice stay on the same map spot while panning and zooming, and board clicks pass through.
- [x] 4.2 Move the landing state out of `DicePanel` into a pure reducer (`panels/diceLanding.ts`) the panel owns; the board reports a landing through the callback handed over with the throw. Rolls present at mount count as landed. Verify: a unit test for the reducer's transitions; reloading mid-throw replays nothing.
- [x] 4.3 Route a matched throw to the board, or to the tray at rest when a fallback applies: reduced motion, no `Element.animate`, or no board mounted. Verify: tests on the routing function, plus a manual check with reduced motion emulated.
- [x] 4.4 Make the Dice panel row, the attack card and the Rulings list hold the total while a roll is throwing on the board. The tray draws a board-thrown roll at rest, with no second throw. Verify: in the browser, the total appears as the board dice land, and the tray does not throw.
- [x] 4.5 Add the drag handle (`panels/DiceThrowHandle.tsx`) to `DicePanel`, using pointer capture and `touch-action: none`. It is disabled, with a hint saying why, on an invalid expression, with no map, or when the expression rolls more than `BOARD_THROW_MAX_DICE` (10) dice. Unit tests cover the enable rule: `10d6` is allowed, `11d6` and `12d6` are not. While held, a spinning ghost die follows the pointer, and Esc or a release off the canvas cancels. Verify: in the browser, with a mouse and with the mobile viewport preset.
- [x] 4.6 On release, compute `from` and a clamped `to` from the last ~80 ms of pointer velocity, then send the plain `dice.roll`. Resolve the roll id via `rollForSeq(ack.seq)` and hand the `BoardThrow` to the overlay. The ghost spins at the release point until then. On a rejection, a 5 s timeout or a null match, it fades, and the panel shows the error or the roll at rest. Verify: tests on the velocity→landing function (clamping, slow vs fast); a manual check with the server stopped shows the timeout message.
- [x] 4.7 Styles in `styles.css` for the handle, ghost, overlay and fade, including GM-only colours on the board (the room is dark-only, per `theme.ts`). Verify: screenshots of a public and a GM-only throw.

## 5. Fallback

- [ ] 5.1 If touch drag from the panel proves unreliable on the phone layout, add a "Throw on map" tap on the handle that throws from the centre of the visible map with a seeded direction. Verify: a manual check in the mobile viewport.

## 6. Wrap-up

- [x] 6.1 Confirm the throw adds nothing to the wire: a test that a drag-throw sends exactly one `dice.roll` command, equal to the Roll button's, and no ephemeral message. Verify: the test passes.
- [ ] 6.2 Run the sync-reviewer agent on the diff (it touches `RoomConnection`) and address any findings. Verify: it reports no violations.
- [x] 6.3 `npm run lint && npm run typecheck && npm test` pass, and a two-viewer run (GM + player) matches every scenario in `specs/board-dice-throw/spec.md`: the thrower sees the board throw, and the other viewer receives only the usual roll. (The second viewer was a socket client: the Playwright browser was shared with another session.)
