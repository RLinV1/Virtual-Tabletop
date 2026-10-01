# Design

## Context

See proposal.md for why. What exists today and constrains the approach:

- `ui/DiceTray.tsx` and `ui/diceGeometry.ts` (from `add-3d-dice-animation`) draw each die as a CSS `preserve-3d` element with SVG faces. The throw is precomputed Web Animations keyframes that wind a tumble down onto the rest pose, seeded by roll id. `THROW_MS` and `throwStagger` set how long a throw takes.
- The board is PixiJS in `board/boardView.ts`. `BoardView.toBoard()` is private, and there is no public board↔screen mapping or view-change notification. CLAUDE.md keeps Pixi objects inside `board/` and away from React.
- Rendering is on demand (`invalidate()`); there is no continuous frame loop.
- The server rolls in `decide` (`dice.roll`) and commits one `DiceRolled` event. It then acks the command with that event's seq. Both travel on the same socket, so the event reaches the client before the ack. `RoomConnection.command()` resolves with `{ ok: true, seq }`.
- On a phone the panel sits under the board (`RoomPage`), so a drag upward from the panel onto the board is physically possible.
- `MapImage` has `width` / `height` in board pixels; `Scene.map` may be null.
- `board-dice-rolls` threw every public roll in the middle of everyone's board, tracked as one "roll in the air" for the whole room page (`rollThrow`).

## Goals / Non-Goals

**Goals:**
- Reuse the tray's dice exactly (geometry, numbering, colours, seeded rest pose) on the board.
- Keep the shared contract untouched: the drag produces the same `dice.roll` as the Roll button.
- Everyone sees the same throw at the same spot, with no change to commands, events or state.
- No change to Pixi rendering cost when no dice are on the board.

**Non-Goals:**
- Showing dice for a roll made with Roll to anyone but the roller.
- Physics: dice do not collide with tokens, walls or each other, and do not bounce off the map edge. The landing point is clamped instead.
- Showing the held die to others while it is being dragged.
- Dice that stay on the map as persistent objects.
- Throwing attack rolls from the Attack panel. Only the Dice panel's expression is thrown.

## Decisions

### The roll is unchanged; the drop point travels on the ephemeral channel
The drag ends in the same `dice.roll` the Roll button sends. Just before it, the thrower's browser sends `diceDrop { expression, from, to }` on the ephemeral channel (ADR 0014), on the same socket, and keeps the drop itself too.
- The server relays ephemeral messages as soon as it handles them, while commands go through the room's queue, so the drop reaches everyone else before the `DiceRolled` event.
- The server relays a drop only when both points are on the map, and sends it reliably rather than volatile: Socket.IO discards a volatile message while the previous write to that client is flushing, which lost the second of two throws made close together.
- Every viewer keeps drops in order per thrower for 5 seconds (`board/diceDrops.ts`). A roll takes its thrower's oldest waiting drop with the same expression, and older ones are discarded: their rolls were refused.
- The throw's path is a pure function of the roll id and the two points, so it lands the same way everywhere.
- A lost or late drop shows only the result card.

Alternatives:
- **A `throw` field on `dice.roll` / `DiceRoll`.** Every viewer would get the throw with the roll, reliably, but it would persist presentation data in the event log and change the command and event schemas. Rejected for a purely visual detail.
- **Sending the drop after the ack, with the roll id.** Exact pairing, but it reaches viewers after the roll does, so they would have to hold every roll back in case a drop follows. Rejected: a thrower's messages arrive in order, so pairing by thrower and expression is exact enough, and the drop arrives first.

### Each roll is thrown on its own, when it arrives
`RoomConnection.onRolled` calls back for each `DiceRolled` event it applies (never for rolls in a snapshot). `RoomPage` decides there, once per roll, where its dice go:
- **A drop is waiting for it:** the dice land at the drop, on the thrower's board and on everyone else's.
- **Your own roll, with no drop** (Roll, or an attack): the dice land in the middle of your visible board (`BoardHandle.centreAim`), kept on the map.
- **Someone else's roll, with no drop:** no dice; the result card shows at once.
- **A private (GM-only) roll:** the GM's panel tray, as `board-dice-rolls` has it. With no tray in view it lands at once.

A roll is in `airborne` until its dice land, and the Dice panel row, the Attack card and the GM's Rulings list hold its total until then. Each throw lands on its own clock and reports its own roll, so any number can be in the air at once.

This replaces `board-dice-rolls`' single roll in the air, the hold and release that kept a dropped roll out of it, and this change's earlier ack-seq lookup (`net/rollsBySeq.ts`). With one slot, several drags in a row raced: a roll could be thrown twice, or a landing ignored so its result never showed. The thrower no longer needs the roll's id at all, because its own drop pairs with its roll the same way everyone else's does. The Rulings list's own timer (`throwDuration`) goes too, since it now reads `airborne`.

Alternatives:
- **Keep `board-dice-rolls`' broadcast for rolls made with Roll.** That means a centred throw on every board beside the dropped ones, and the single slot that raced. Rejected: everyone else sees the card, and the roller sees the dice on their own board.

### A DOM overlay over the canvas, following the board transform
The dice are drawn in a `div` layered over the Pixi canvas with `pointer-events: none`, not in Pixi. The overlay has a single container whose CSS `transform` equals the board's world transform (scale plus translation). Dice inside it are positioned in board coordinates, so pan and zoom move one element, not every die.

`BoardView` gains two public pieces:
- `clientToBoard(clientX, clientY): Point | null` — null outside the canvas.
- `onViewChange(fn: (m: { scale; x; y }) => void)` — fired from the existing render path when the world transform changes.

The layer is a React component, `board/ThrownDice.tsx` (CSS `thrown-dice`), beside `boardView.ts`. It touches no Pixi objects: it only sets its container's transform from `onViewChange`. A die's on-board size is tied to the grid (about 0.9 cells) so dice look like they sit on the map. It has a 44 px screen-size floor when zoomed out, the size of the held die, so the die that is let go is the die that lands. The first try, 0.6 cells with a 28 px floor, was too small to read the numerals in the browser.

Alternatives:
- **Render the dice in Pixi.** This loses the exact shared geometry and numerals, or needs a WebGL 3D pipeline beside Pixi. Rejected.
- **three.js with physics.** Several hundred kB, a second WebGL context, and a physics result that still has to be forced onto the server's values. Rejected, as in the tray's design.

### Shared die rendering, two throw shapes
The per-die DOM (faces, numerals, lighting) and `layoutDice` are factored out of `DiceTray.tsx` into a shared `Die3D` renderer. The tray keeps its drop-and-bounce throw.

The board gets a travelling throw:
- the die leaves `from` at pointer height;
- it arcs toward `to` with two shrinking bounces;
- it slides to rest while the same wind-down tumble ends exactly on the seeded rest pose.

Each die in a multi-die roll lands at a small seeded offset around `to`, so a handful does not stack, and the dice leave the hand `throwStagger` apart.

The travelling throw is a pure function of `(roll id, dice, from, to)`, so delivering those values is all every board needs to play the same animation. A roll made with Roll uses the same throw, tossed in from up and to the left into the middle of the visible board. In a room without a map, those dice aren't held to any edge.

### Dragging is pointer events from the panel, handed to the overlay
The handle is enabled only for a valid expression of at most 10 dice (`BOARD_THROW_MAX_DICE`) when the room has a map; otherwise it is disabled with a hint that says why. The limit keeps the CSS 3D cost bounded (below) and keeps a handful of dice readable on a map square.

The handle in `DicePanel` uses pointer capture (`setPointerCapture`), not HTML5 drag-and-drop, because HTML5 DnD has no touch support and gives no velocity. While held, a single ghost die is drawn in a fixed-position layer at the pointer, spinning idly. The last ~80 ms of pointer samples give the release velocity.

On release over the canvas:
- `from = clientToBoard(release)`;
- `to = from + velocity × k`, with k chosen so a hard flick travels about 3 grid cells (capped), clamped 1 px inside the map;
- the panel keeps the drop, sends it, then sends the plain `dice.roll`.

The ghost keeps spinning at the release point until the server answers. By then the roll's event has arrived (it comes before the ack), and the board throw has started from the same point. On a rejection or a 5 s timeout the drop is forgotten, the ghost fades, and the error shows in the panel. The die can't be picked up again until the answer, so one client never has two throws of its own in flight. The handle's gesture never starts a board pan, because the press is on the panel, not the canvas.

### Private rolls stay off the board
`board-dice-rolls` keeps GM-only rolls out of the board and in the GM's panel tray, so a shared screen never shows them. Dropping a private roll on the map would break that, so the drag die is disabled while "Roll privately" is ticked, with a hint to use Roll.

### The result card slides into the corner
`board-dice-rolls` showed the result under its dice, over the middle of the map. The card (`ui/RollCard.tsx`, formerly `ui/BoardDice.tsx` without its centred dice) now sits in the board's bottom-right corner, which the notices (top right) and the hint (bottom left) leave free. Its accent bar is on its left edge, like the board's notices. One 4-second CSS animation slides it in from the right, holds it, and slides it back out, matching the room page's 4 seconds; with reduced motion it doesn't move. It is keyed by roll, so the next result slides in afresh; when two rolls land together, the later one's card shows.

### Fading off the board
Landed dice stay 3 s, then fade over 400 ms and are removed. A newer throw does not cancel an earlier one still in the air. The overlay caps itself at 3 rolls on screen and drops the oldest, which then counts as landed.

## Risks / Trade-offs

- **A drop can still miss a viewer** (it was offline for that moment, or its connection was replaced) → That viewer sees only the result card; the roll itself is never affected.
- **Pairing by thrower, expression and order** has no order across two tabs of the same seat → Two tabs throwing the same dice at the same moment could swap spots; accepted for presentation.
- **Others don't see dice for a roll made with Roll** → They see the result card in the corner, the same moment the roll arrives.
- **Die size on the board follows each viewer's zoom** (with a 44 px floor) → The dice land at the same spot everywhere, spread slightly differently at different zooms.
- **The overlay drifts from the canvas during pan/zoom** (the transform is read at a different moment than Pixi renders) → Update the overlay from the same frame callback that renders the world. If drift is still visible on low-end devices, hide board dice during an active pan and show them again when it ends.
- **CSS 3D cost**: 10 d20s is 200 faces under a scaled container → Throwing on the map is limited to 10 dice; the handle is disabled above that. On low-end devices, skip per-face lighting and numerals on faces turned away.
- **Touch drag from panel to board fights page scroll on phones** → Set `touch-action: none` on the handle only. If it is still unreliable in testing, add a "Throw on map" tap on the handle that throws from the centre of the visible map with a seeded direction (fallback 5).
- **Background tabs stop producing frames** → As with the tray, the row keeps saying "rolling" until the tab is visible, then the dice land at once.
- **Latency between release and the ack** → The ghost spins in place at the release point, so a slow server reads as the die settling in the hand. After 5 s it gives up (fallback 3).

## Migration Plan

No data or event change. The `diceDrop` ephemeral payload is additive: an older client ignores it (the zod union rejects it on an older server, so an older server simply doesn't relay it). Rolling back means reverting the change; rolls made by dragging are ordinary rolls and stay in the log.

## Open Questions

- The flick-to-distance constant `k` and the 3-cell cap: tune in the browser.
- Whether the on-board die size should follow the token size setting or stay at about 0.9 cells: visual tuning only.
