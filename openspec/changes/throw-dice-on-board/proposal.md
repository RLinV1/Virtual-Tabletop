# Proposal

## Why

Since `add-3d-dice-animation`, a roll is thrown as 3D dice, but only inside the Dice panel's tray. The map is where the table is actually looking during an encounter, and a roll typed into a side panel still feels like filling in a form. Letting a player pick the dice up and throw them onto the map gives the roll the physical moment a real table has.

This change delivers that on the thrower's side first, so the drag, the throw and the 3D dice on the board can be tested and tuned without touching the shared contract. Showing the same throw to everyone is a planned follow-up (see below).

## What Changes

- **Drag to throw.** The Dice panel gains a draggable 3D die above the existing expression input and Roll button. A player (or the GM) presses it, drags it over the map and lets go, and the current expression is rolled. Throwing on the map supports up to 10 dice. For a larger roll, such as `12d6`, the die is disabled with a hint, and the Roll button still rolls it in the tray. The typed Roll button, the quick chips and the tray keep working exactly as today.
- **The throw follows the hand.** While held, the die follows the pointer over the map in its real 3D shape. The release point and the flick's direction and speed set where it lands. A slow release drops it near the pointer; a fast flick sends it further, never off the map.
- **Dice roll across the thrower's map.** On the thrower's board, the roll's dice tumble from the release point along the throw, bounce, and come to rest at the landing point on the values the server rolled. They use the same polyhedra, numbering and GM colours as the tray. They are drawn in board coordinates, so they stay in place under pan and zoom, and they fade a few seconds after landing.
- **Everyone else sees the roll as today.** Other participants, and the thrower's other open tabs, receive an ordinary roll and see it thrown in their Dice panel tray. GM-only rolls still never reach players.
- **The result still waits for the dice.** On the thrower's screen, the Dice panel row, the attack card and the GM's Rulings list hold the total until the board dice land. A board throw takes as long as a tray throw, so the total appears at about the same moment for everyone.
- **No replay.** Reloading or reconnecting does not throw anything on the board.
- **No contract change.** Dragging sends exactly the `dice.roll` command the Roll button sends. The drop point and flick never leave the thrower's browser. Commands, events, state, visibility filters and the server are untouched, so no ADR is needed.

## Fallbacks

The feature degrades in steps. Each step still rolls correctly and always shows the result in the Dice panel.

1. **Reduced motion, or no Web Animations API**: the roll is made, but the dice are drawn at rest in the tray, with no board animation.
2. **Released outside the map, or Esc pressed while dragging**: no roll is made, and the die returns to the panel.
3. **Server rejects the roll or does not answer within 5 s**: the held die fades out at the release point, and the panel shows the error. Nothing lands.
4. **The roll can't be matched to the throw** (for example, the connection resyncs mid-throw): the roll shows at rest in the tray, as for any roll already on the table.
5. **Phone / touch**: the same drag works with a finger (the panel sits under the board). If a touch drag proves unreliable in testing, the die gets a "Throw on map" tap action that throws from the middle of the visible map instead.
6. **The CSS 3D overlay can't keep up with pan/zoom on low-end devices**: board dice drop per-face lighting and the numerals on faces turned away. The landing face stays exact.

## Follow-up (not in this change)

**Broadcast the throw to the table.** Once the thrower's dice stop, the same throw (release point, landing point, roll id) is sent to the room, and every other participant who can see the roll replays the identical animation on their own board. Because the animation is seeded by roll id, it lands the same way everywhere.

This needs its own change and an ADR, since it adds a payload that crosses the wire. It must be filtered so a GM-only throw never reaches a player. It also has to settle whether other viewers hold their total until their replay lands. This change keeps the throw as a plain `{ rollId, from, to }` value in board coordinates so the follow-up can send it unchanged.

## Capabilities

### New Capabilities
- `board-dice-throw`: dragging a die from the Dice panel onto the map; the throw that tumbles across the thrower's board and lands on the rolled values; that it stays on the thrower's screen; timing, no replay, and the fallbacks above.

### Modified Capabilities
None. The tray behaviour belongs to the in-flight `add-3d-dice-animation` change (`dice-roll-animation`), which is not archived yet. This change leaves its requirements true as written: the thrower's own tray shows a board-thrown roll at rest instead of throwing it a second time, and every other viewer's tray throws it as before.

## Impact

- **apps/web:**
  - new `board/diceOverlay.ts`: a DOM layer over the Pixi canvas that follows the board transform;
  - shared die rendering factored out of `ui/DiceTray.tsx`;
  - `panels/DicePanel.tsx`: the drag handle;
  - `board/boardView.ts` / `board/Board.tsx`: expose board↔screen mapping and view-change notifications;
  - `net/roomConnection.ts`: look up the roll a command's ack refers to;
  - `styles.css`.
- **packages/shared, apps/server:** none. No schema change, so no ADR.
- **Dependencies:** none. No WebGL or physics engine.
