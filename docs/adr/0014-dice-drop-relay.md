# ADR 0014: Dice drops on the ephemeral channel

**Status:** Proposed. Needs review by the Real-Time Architecture owner. · **Extends:** `docs/adr/0001-event-model.md` (the ephemeral channel, FR-SYNC-03)
**Owner:** Real-Time Architecture (Raymond) · **Change:** `openspec/changes/throw-dice-on-board` · **Requirements:** FR-TAC-09, FR-SYNC-03

## Context

`throw-dice-on-board` lets a player drag a die onto the map. On their board the dice land where it was let go. Until now the drop point stayed in the thrower's browser, so everyone else saw the roll as `board-dice-rolls` shows any public roll: big dice in the middle of the board. Seen side by side, that was confusing (one throw, two different pictures) and distracting. Everyone should see the same throw, at the same spot.

The roll itself must not change: the server rolls it, and `dice.roll` and `DiceRolled` stay as they are. What's missing is only *where* the thrower let go, which is presentation.

## Decision

- **A new ephemeral payload:** `diceDrop { expression, from, to }`, where `from` and `to` are board points (map pixels) and `expression` is the roll's expression as the server formats it (`formatExpression`).
  - Like `ping` and `tokenDragPreview`, it is relayed to the room's other clients, never persisted, and never given a seq (invariant 4).
- **Sender:** the browser sends `diceDrop` just before the `dice.roll` it belongs to, on the same socket.
  - The server relays an ephemeral message as soon as it is handled, while the command goes through the room's queue, so every other client gets the drop before the `DiceRolled` event.
  - The roll command is exactly what the Roll button sends.
- **Server:** relays a drop only from an active participant, and only if both points are on the current map. With no map, or a point off it, the drop is a forged payload and is dropped.
- **Receivers:** keep the latest drop per sender for 5 seconds. When that sender's next roll arrives with the same expression, they replay the throw at those points instead of the centred throw, then show the result card as for any roll.
  - The throw's path and resting angles are seeded by the roll id and the two points, so it lands the same way on every board.
  - A drop is used once.
  - If a drop is lost (the relay is volatile and drops under backpressure), arrives late, or can't be animated (reduced motion), the roll is shown as any other.
- **Private rolls:** `board-dice-rolls` keeps GM-only rolls off the board, so the client doesn't offer the drag for a private roll and sends no drop for one.

## Consequences

- **No change** to commands, events, state, persistence or the visibility filters. Undo, replay and reconnect are untouched: a drop that is missed only changes what a viewer saw, not what happened.
- **Visibility:** a drop carries no room data beyond two points on the public map and an expression. Players can never receive a GM-only roll to pair it with. A modified GM client could announce its own private throw, but that only reveals what the GM chose to send.
- **Pairing is by sender, expression and time,** not by roll id, which the sender doesn't know until the ack. Two rolls of the same expression by the same person within 5 seconds could pair the wrong way round. Both would be replayed, at swapped spots. That is accepted for presentation.
- **Tests:**
  - `apps/server/test/sync.test.ts`: a drop is relayed to everyone else, unsequenced; a drop off the map is not relayed.
  - The web client keeps its existing tests, and the replay was checked across two browser tabs.
