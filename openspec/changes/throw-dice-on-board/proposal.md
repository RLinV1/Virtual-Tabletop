# Proposal

## Why

Since `add-3d-dice-animation`, a roll is thrown as 3D dice, and `board-dice-rolls` threw every public roll in the middle of everyone's board. The map is where the table is actually looking during an encounter, but nobody throws those dice: they appear in the middle of the map on their own, on every screen, for every roll. Letting a player pick the dice up and throw them onto the map, where they land where they were thrown, gives the roll the physical moment a real table has. Showing everyone else only the result, unless a die was actually thrown onto the map, keeps the board calm.

## What Changes

- **Drag to throw.** The Dice panel gains a draggable 3D die above the existing expression input and Roll button. A player (or the GM) presses it, drags it over the map and lets go, and the current expression is rolled.
  - Throwing on the map supports up to 10 dice. For a larger roll, such as `12d6`, the die is disabled with a hint, and the Roll button still rolls it.
  - A private (GM-only) roll can't be thrown either: private rolls stay off the board (`board-dice-rolls`).
  - The typed Roll button and the quick chips keep working.
- **The throw follows the hand.** While held, the die follows the pointer over the map in its real 3D shape. The release point and the flick's direction and speed set where it lands. A slow release drops it near the pointer; a fast flick sends it further, never off the map.
- **Dice roll across the map.** The roll's dice tumble from the release point along the throw, bounce, and come to rest at the landing point on the values the server rolled. They use the same polyhedra and numbering as every other die, are drawn in board coordinates (so they stay put under pan and zoom), and fade a few seconds after landing.
- **Everyone sees the same throw.** Just before the roll, the thrower's browser sends a small *dice drop* (release point, landing point, expression) on the ephemeral channel (ADR 0014). Every other viewer, including the thrower's other open tabs, replays the throw at the same spot when the roll arrives.
- **Roll lands in the middle of your own board only.** A roll made with Roll, or an attack, throws its dice into the middle of the roller's visible board. Everyone else sees only its result card. This replaces `board-dice-rolls`' centred throw on every board.
- **Each roll on its own.** Every roll is thrown and lands independently, so several drags and Rolls in a row each land at their own spot and show their own result. Each roll's total waits for its dice on that screen, in the Dice panel, the Attack card and the GM's Rulings list.
- **The result slides into the corner.** When a roll's dice land, or at once when there are none on this screen, the result card slides in from the right into the board's bottom-right corner, stays 4 seconds and slides back out.
- **No replay.** Reloading or reconnecting does not throw anything on the board.
- **One small contract addition.** Dragging sends exactly the `dice.roll` the Roll button sends. The only addition is the `diceDrop` ephemeral payload, which is never persisted and never sequenced. The server relays it reliably, and only when its points are on the map. That changes a shared schema, so it comes with ADR 0014 for the Real-Time Architecture owner's review. Commands, events, state and visibility filters are unchanged.

## Fallbacks

The feature degrades in steps. Each step still rolls correctly and always shows the result in the Dice panel and the card.

1. **Reduced motion, or no Web Animations API**: no dice are drawn on the board; the roll lands at once.
2. **Released outside the map, or Esc pressed while dragging**: no roll is made, and the die returns to the panel.
3. **Server rejects the roll or does not answer within 5 s**: the held die fades out at the release point, and the panel shows the error. Nothing lands.
4. **A viewer misses a dice drop**: that viewer sees only the result card. After a reconnect, rolls already made count as landed.
5. **Phone / touch**: the same drag works with a finger (the panel sits under the board). If a touch drag proves unreliable in testing, the die gets a "Throw on map" tap action that throws from the middle of the visible map instead.
6. **The CSS 3D overlay can't keep up with pan/zoom on low-end devices**: board dice drop per-face lighting and the numerals on faces turned away. The landing face stays exact.

## Combined with board-dice-rolls

`board-dice-rolls` (PR #61) landed on `main` while this change was in review. It threw every public roll in the middle of everyone's board, tracked as a single roll in the air for the whole room page. With drags added, that single slot needed holds and releases, and several drags in a row raced through it. This change now replaces it:
- **One decision per roll, as it arrives:** at its drop, in the middle of the roller's own board, in the GM's panel tray (private rolls, as `board-dice-rolls` has them), or just the card.
- **What's kept from `board-dice-rolls`:** the result card (now in the corner, `ui/RollCard.tsx`) and the private tray.
- **What's removed:** the centred overlay for everyone.

`board-dice-rolls` is not archived yet. Its requirement "Public rolls are thrown on the board", for every participant, is superseded by this change's "A roll made with Roll lands in the middle of the roller's own board". Its owner should agree before both are archived.

## Capabilities

### New Capabilities
- `board-dice-throw`: dragging a die from the Dice panel onto the map; the throw that tumbles across the board and lands on the rolled values, replayed for everyone from a dice drop; Roll in the middle of the roller's own board; each roll on its own; the result card in the corner; timing, no replay after reload, and the fallbacks above.

### Modified Capabilities
None archived. `board-dice-rolls` and `add-3d-dice-animation` are still open changes; see above for the one `board-dice-rolls` requirement this replaces.

## Impact

- **apps/web:**
  - `board/ThrownDice.tsx`: a DOM layer over the Pixi canvas that follows the board transform;
  - `board/diceThrow.ts`, `board/diceDrops.ts`: where a throw lands, and drops waiting for their rolls;
  - shared die rendering factored out of `ui/DiceTray.tsx` into `ui/Die3D.tsx`;
  - `panels/DicePanel.tsx`, `panels/DiceThrowHandle.tsx`: the drag die;
  - `board/boardView.ts` / `board/Board.tsx`: board↔screen mapping, view-change notifications, the throw API;
  - `net/roomConnection.ts`: a callback for each roll as it arrives;
  - `pages/RoomPage.tsx`: where each roll is thrown; `ui/RollCard.tsx`: the corner card; the Attack and Rulings panels read which rolls are in the air;
  - `styles.css`.
- **packages/shared:** the `diceDrop` ephemeral payload (ADR 0014).
- **apps/server:** relays `diceDrop` reliably, only when it is on the map.
- **Dependencies:** none. No WebGL or physics engine.
