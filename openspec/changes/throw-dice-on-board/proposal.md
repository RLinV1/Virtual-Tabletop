# Proposal

## Why

Since `add-3d-dice-animation`, a roll is thrown as 3D dice, and since `board-dice-rolls` every public roll is thrown in the centre of everyone's board. The map is where the table is actually looking during an encounter, and a roll typed into a side panel still feels like filling in a form. But nobody throws them: the dice appear in the middle of the map on their own. Letting a player pick the dice up and throw them onto the map, where they land where they were thrown, gives the roll the physical moment a real table has.

This change delivers that on the thrower's side, without touching the shared contract: everyone else sees the roll as `board-dice-rolls` shows any public roll. Showing everyone where the dice were thrown is a planned follow-up (see below).

## What Changes

- **Drag to throw.** The Dice panel gains a draggable 3D die above the existing expression input and Roll button. A player (or the GM) presses it, drags it over the map and lets go, and the current expression is rolled. Throwing on the map supports up to 10 dice. For a larger roll, such as `12d6`, the die is disabled with a hint, and the Roll button still rolls it. A private (GM-only) roll can't be thrown either: private rolls stay off the board (`board-dice-rolls`). The typed Roll button and the quick chips keep working exactly as today.
- **The throw follows the hand.** While held, the die follows the pointer over the map in its real 3D shape. The release point and the flick's direction and speed set where it lands. A slow release drops it near the pointer; a fast flick sends it further, never off the map.
- **Dice roll across the thrower's map.** On the thrower's board, in place of the centred throw, the roll's dice tumble from the release point along the throw, bounce, and come to rest at the landing point on the values the server rolled. Then the board's usual result popup appears. They use the same polyhedra and numbering as every other die. They are drawn in board coordinates, so they stay in place under pan and zoom, and they fade a few seconds after landing.
- **Everyone sees the same throw.** Just before the roll, the thrower's browser sends a small *dice drop* (release point, landing point, expression) on the ephemeral channel (ADR 0014). Every other viewer, including the thrower's other open tabs, replays the throw at the same spot when the roll arrives, instead of the big dice in the centre. A viewer who missed the drop sees the roll as any public roll.
- **The result still waits for the dice.** On the thrower's screen, the Dice panel row and the board's popup hold the result until the dropped dice land. A dropped throw takes as long as the centred one, so the result appears at about the same moment for everyone.
- **No replay.** Reloading or reconnecting does not throw anything on the board.
- **The result slides into the corner.** When the dice land, the result card slides in from the right into the board's bottom-right corner, stays 4 seconds and slides back out, instead of sitting over the middle of the map. This applies to every roll's card (`board-dice-rolls`).
- **One small contract addition.** Dragging sends exactly the `dice.roll` the Roll button sends. The only addition is the `diceDrop` ephemeral payload, which is never persisted and never sequenced; the server relays it only when its points are on the map. That changes a shared schema, so it comes with ADR 0014 for the Real-Time Architecture owner's review. Commands, events, state and visibility filters are unchanged.

## Fallbacks

The feature degrades in steps. Each step still rolls correctly and always shows the result in the Dice panel.

1. **Reduced motion, or no Web Animations API**: the roll is made and shown as any public roll (`board-dice-rolls`), which itself lands at once under reduced motion.
2. **Released outside the map, or Esc pressed while dragging**: no roll is made, and the die returns to the panel.
3. **Server rejects the roll or does not answer within 5 s**: the held die fades out at the release point, and the panel shows the error. Nothing lands.
4. **The roll can't be matched to the throw** (for example, the connection resyncs mid-throw): the roll is shown as any other; after a resync it counts as already landed.
5. **Phone / touch**: the same drag works with a finger (the panel sits under the board). If a touch drag proves unreliable in testing, the die gets a "Throw on map" tap action that throws from the middle of the visible map instead.
6. **The CSS 3D overlay can't keep up with pan/zoom on low-end devices**: board dice drop per-face lighting and the numerals on faces turned away. The landing face stays exact.

## Combined with board-dice-rolls

`board-dice-rolls` (PR #61) landed on `main` while this change was in review. It throws every public roll in the centre of everyone's board and owns the throw state in the room page (`rollThrow`). This change now builds on it:
- A dropped die tells the room page to **hold** newer rolls off the centred throw until its roll is known, then **releases** it, either as dropped (it lands at the drop point) or as ordinary (the centred throw shows it).
- The room page's `rollThrow` is the single record of which roll is in the air and when it landed.
- This change's own landing state in the Dice panel is gone.
- The dropped dice live in `board/ThrownDice.tsx` (CSS `thrown-dice`), so they don't collide with `ui/BoardDice.tsx` (`board-dice`).

## Follow-up (not in this change)

Rolls made with the Roll button still get `board-dice-rolls`' big dice in the centre for everyone. Showing only the corner card for those, or smaller dice, is a separate decision for that change.

## Capabilities

### New Capabilities
- `board-dice-throw`: dragging a die from the Dice panel onto the map; the throw that tumbles across the board and lands on the rolled values, replayed for everyone from a dice drop; the result card in the corner; timing, no replay after reload, and the fallbacks above.

### Modified Capabilities
None. `board-dice-rolls` (centred board throws and popups) and `add-3d-dice-animation` (the dice themselves) are not archived yet. This change keeps their requirements true: private rolls stay off the board, rolls made with Roll are thrown in the centre as before, and a dropped roll is replayed at its drop point instead of the centre. It moves `board-dice-rolls`' result popup into the bottom-right corner as a sliding card, which that change's spec doesn't fix a position for.

## Impact

- **apps/web:**
  - new `board/diceOverlay.ts`: a DOM layer over the Pixi canvas that follows the board transform;
  - shared die rendering factored out of `ui/DiceTray.tsx`;
  - `panels/DicePanel.tsx`: the drag handle;
  - `board/boardView.ts` / `board/Board.tsx`: expose board↔screen mapping and view-change notifications;
  - `net/roomConnection.ts`: look up the roll a command's ack refers to;
  - `pages/RoomPage.tsx`: replay other viewers' dice drops; `ui/BoardDice.tsx`: the corner result card;
  - `styles.css`.
- **packages/shared, apps/server:** none. No schema change, so no ADR.
- **Dependencies:** none. No WebGL or physics engine.
