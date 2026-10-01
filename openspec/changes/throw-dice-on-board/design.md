# Design

## Context

See proposal.md for why. What exists today and constrains the approach:

- `ui/DiceTray.tsx` and `ui/diceGeometry.ts` (from `add-3d-dice-animation`) draw each die as a CSS `preserve-3d` element with SVG faces. The throw is precomputed Web Animations keyframes that wind a tumble down onto the rest pose, seeded by roll id. `THROW_MS`, `throwStagger` and `throwDuration` are shared with `RulingsPanel` and the attack card, which use them to hold the total until landing.
- The board is PixiJS in `board/boardView.ts`. `BoardView.toBoard()` is private, and there is no public board↔screen mapping or view-change notification. CLAUDE.md keeps Pixi objects inside `board/` and away from React.
- Rendering is on demand (`invalidate()`); there is no continuous frame loop.
- The server rolls in `decide` (`dice.roll`) and commits one `DiceRolled` event. It then acks the command with that event's seq. Both travel on the same socket, so the event reaches the client before the ack. `RoomConnection.command()` resolves with `{ ok: true, seq }`.
- On a phone the panel sits under the board (`RoomPage`), so a drag upward from the panel onto the board is physically possible.
- `MapImage` has `width` / `height` in board pixels; `Scene.map` may be null.

## Goals / Non-Goals

**Goals:**
- Reuse the tray's dice exactly (geometry, numbering, colours, seeded rest pose) on the board.
- Keep the shared contract untouched: the drag produces the same `dice.roll` as the Roll button.
- Leave the throw in a shape the broadcast follow-up can send unchanged.
- No change to Pixi rendering cost when no dice are on the board.

**Non-Goals:**
- Showing anyone but the thrower where the dice were thrown (the follow-up covers this). Everyone sees the roll itself through `board-dice-rolls`.
- Physics: dice do not collide with tokens, walls or each other, and do not bounce off the map edge. The landing point is clamped instead.
- Showing the held die to others while it is being dragged.
- Dice that stay on the map as persistent objects.
- Throwing attack rolls from the Attack panel. Only the Dice panel's expression is thrown.

## Decisions

### The throw is presentation on the thrower's client
The drag ends in the same `connection.command({ type: "dice.roll", expression, visibility })` as the Roll button. The release and landing points stay in the thrower's browser as a `BoardThrow { rollId, from, to }` value in board coordinates. Invariants 1–4 are untouched: nothing new is persisted, broadcast or filtered.

Alternatives:
- **A `throw` field on `dice.roll` / `DiceRoll`.** Everyone would get the throw with the roll. This changes shared schemas (ADR, review), and it plays the throw for others at the same time as for the thrower, not after the thrower's dice land. Deferred to the follow-up, which should decide between this and the relay below.
- **An ephemeral relay of the throw.** Today the relay goes to the whole room, so a GM-only throw would leak unless the relay learned to filter. Deferred to the follow-up for the same reason.

### Matching the throw to its roll by the ack's seq
The thrower needs the new roll's id to hand the throw to the overlay. The client does not know that id until the server makes it.

`RoomConnection` gains a small bounded map from committed seq to the roll id of a `DiceRolled` event it applied. It keeps the last 32 entries and clears them on `welcome`. When the command resolves with `{ ok: true, seq }`, the panel looks up the roll id for that seq. If the event hasn't been applied yet, it waits for it, within the same 5 s timeout. The lookup can come back empty, for example when a resync replaced state with a snapshot. Then the roll is treated like any roll already on the table and shown at rest (fallback 4).

This is client bookkeeping over messages the client already receives. It adds no protocol message, and `reduce` stays the only thing that changes `RoomState`.

Alternative: take the newest roll by this participant at ack time. It was rejected because two tabs of the same seat, or a quick second roll, could pick the wrong one.

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

Each die in a multi-die roll lands at a small seeded offset around `to`, so a handful does not stack. Duration and stagger reuse `throwDuration(count)`, so the thrower's result appears at about the same moment as other viewers' centred throws land.

The travelling throw is a pure function of `(roll id, dice, from, to)`. The broadcast follow-up only has to deliver those values for every board to play the same animation.

### Dragging is pointer events from the panel, handed to the overlay
The handle is enabled only for a valid expression of at most 10 dice (`BOARD_THROW_MAX_DICE`) when the room has a map; otherwise it is disabled with a hint that says why. The limit keeps the CSS 3D cost bounded (below) and keeps a handful of dice readable on a map square.

The handle in `DicePanel` uses pointer capture (`setPointerCapture`), not HTML5 drag-and-drop, because HTML5 DnD has no touch support and gives no velocity. While held, a single ghost die is drawn in a fixed-position layer at the pointer, spinning idly. The last ~80 ms of pointer samples give the release velocity.

On release over the canvas:
- `from = clientToBoard(release)`;
- `to = from + velocity × k`, with k chosen so a hard flick travels about 3 grid cells (capped), clamped 1 px inside the map;
- the panel sends the plain `dice.roll`.

The ghost keeps spinning at the release point until the roll id is known. It is then removed as the board throw starts from the same point. On a rejection or a 5 s timeout it fades, and the error shows in the panel. The handle's gesture never starts a board pan, because the press is on the panel, not the canvas.

### The room page's throw state, with a hold for dropped dice
`board-dice-rolls` keeps which roll is in the air in `RoomPage` and hands it to the board and the panels as `rollThrow`. A dropped die uses the same record, with two additions:
- **`hold(after)`:** called when the die is let go. Rolls newer than `after` stay off the centred throw, so the thrower's own roll, arriving before the ack, isn't thrown in the centre while its drop point is still unknown. The Dice panel row reads as rolling, because the roll is in the air.
- **`release(rollId | null)`:** called once the roll is matched. With an id, that roll is *dropped*: the centred overlay skips its dice before and after landing and only shows its popup. With null (rejected, timed out, unmatched, or it can't animate here), the roll is shown as any other.

`ThrownDice` reports the landing through `rollThrow.onLanded`, which shows the popup. Dropped dice land on their own clock, so `landRoll` ignores a landing for a roll that is no longer the latest; otherwise an older dropped roll landing after a newer roll arrived would mark the newer one landed and replay it. A full snapshot (reload, reconnect, resync) clears the hold and the drop, so nothing replays.

This replaces this change's earlier landing reducer (`panels/diceLanding.ts`), which duplicated what `rollThrow` now does.

### Private rolls stay off the board
`board-dice-rolls` keeps GM-only rolls out of the board and in the GM's panel tray, so a shared screen never shows them. Dropping a private roll on the map would break that, so the drag die is disabled while "Roll privately" is ticked, with a hint to use Roll.

### Fading off the board
Landed dice stay 3 s, then fade over 400 ms and are removed. A newer throw does not cancel an earlier one still in the air. The overlay caps itself at 3 rolls on screen and drops the oldest.

## Risks / Trade-offs

- **Others don't see where the dice landed** → They see the roll thrown in the centre of their board (`board-dice-rolls`), at about the same moment. Showing the drop point is the planned follow-up.
- **The thrower's other tabs show the centred throw, not the drop** → Accepted: only the tab that threw knows the drop point.
- **The overlay drifts from the canvas during pan/zoom** (the transform is read at a different moment than Pixi renders) → Update the overlay from the same frame callback that renders the world. If drift is still visible on low-end devices, hide board dice during an active pan and show them again when it ends.
- **CSS 3D cost**: 10 d20s is 200 faces under a scaled container → Throwing on the map is limited to 10 dice; the handle is disabled above that. On low-end devices, skip per-face lighting and numerals on faces turned away.
- **Touch drag from panel to board fights page scroll on phones** → Set `touch-action: none` on the handle only. If it is still unreliable in testing, add a "Throw on map" tap on the handle that throws from the centre of the visible map with a seeded direction (fallback 5).
- **Background tabs stop producing frames** → As with the tray, the row keeps saying "rolling" until the tab is visible, then the dice land at once.
- **Latency between release and the ack** → The ghost spins in place at the release point, so a slow server reads as the die settling in the hand. After 5 s it gives up (fallback 3).

## Migration Plan

Client-only. There is no data, schema or protocol change. Rolling back means reverting the web changes; rolls made by dragging are ordinary rolls and stay in the log.

## Open Questions

- The flick-to-distance constant `k` and the 3-cell cap: tune in the browser.
- Whether the on-board die size should follow the token size setting or stay at about 0.9 cells: visual tuning only.
