# ADR 0006: Participant lifecycle

**Status:** Accepted. Reviewed by the Real-Time Architecture owner (Raymond) as part of the `leave-table` design, 2026-09-24. **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0002-transport-and-identity.md`
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/leave-table` (KAN-58, this version), `openspec/changes/guest-revocation-and-invite-regeneration` (KAN-52, adds the revocation section)

## Context

A player can't end their seat in a room; closing the tab isn't a session-end event (FRONTEND-CONTRACT §13.1). When a player stops playing for good, their tokens keep naming an owner who will never return, and the GM has no single step to hand them on or clean them up. Participants are only ever added: `ParticipantJoined` has no counterpart, and `decide.ts` already has an `isActive` hook, waiting for a way to record that someone has left. Stored events are JSON and aren't re-validated on read (ADR 0005).

## Decision

A participant is either **active** or **inactive**. `isActive(p)` is the single test for that, and every "is this person still here" question goes through it. This section defines the first way to become inactive: leaving the table.

### Leaving (KAN-58)

**State.** `Participant` gains `left?: boolean`. A departed participant stays in `RoomState.participants`, because tokens, dice rolls and the activity log still refer to them. `isActive(p)` becomes `!p.left`. Every "is this person still here" question goes through it: display-name uniqueness, command authorization, the socket handshake, the participants list, owner pickers and `pendingDepartures`.

**Commands.**
- `participant.leave` (no payload). A player's command becomes `ParticipantLeft { participant }`, which carries the full pre-leave participant (invariant 6). The GM can't leave their own room, so that case is rejected as `invalid`.
- `participant.resolveDeparture { participantId, actions[] }`, GM only. Each action is `{ tokenId, action: "reassign", to }`, `{ tokenId, action: "unassign" }` or `{ tokenId, action: "delete" }`, with at most 200 per command. `decide` validates every action before emitting anything:
  - the participant has left;
  - each token exists, names that participant as an owner, and appears only once;
  - each `to` is an active player.

  It then emits existing events: `TokenOwnersSet` (with `previous`) for reassign and unassign, and `TokenDeleted` (with the full token) for delete. They're committed in one atomic append.

**Events.** One new event, `ParticipantLeft`. `reduce` sets `left: true` on the participant. It's public: `filterEventForViewer` passes it to every viewer, because the participant list is already public.

**Protocol.** `ServerMessage` gains `{ type: "sessionEnded"; reason: "left" }`. After committing `ParticipantLeft`, the server sends it to every socket bound to that participant and closes them. Later handshakes with that credential fail with `left`. Commands and ephemeral messages from a participant who isn't active are refused inside the room queue.

`token.create` and `token.setOwners` reject owners who aren't active.

### Revocation (KAN-52)

Reserved for `guest-revocation-and-invite-regeneration`. It adds `revoked?`, extends `isActive`, and adds a `"revoked"` reason to `sessionEnded`. The gates, the close path and the departure review above key on `isActive`, not on `left`, so they cover a revoked participant unchanged.

## Consequences

- **Leaving ends the seat on every tab**, not only the current socket as §13.1 originally said. A seat that's still live elsewhere could keep moving tokens the GM just reassigned. §13.1 is updated to match.
- **Resolution reuses existing events.** Undo, visibility (a hidden token's reassignment is redacted for players), the activity log and the client reducer need no new branches for it.
- **"Decide later" costs nothing.** Unresolved tokens keep naming the departed participant. The GM's pending list is derived (`pendingDepartures(state)`), not stored.
- **Redaction count.** A resolution that touches hidden tokens reaches players as `redacted` seqs next to the visible changes, so a player can count roughly how many hidden tokens the departed player controlled. This is the timing side channel ADR 0001 already lists as an open question, and a single `token.setOwners` has it too. It is accepted here rather than solved separately. If ADR 0001 later resolves it (for example, one resync per batch), this command inherits that fix.
- **Backward compatible data.** `left` is optional, and old events and snapshots parse unchanged. There's no migration: credentials are left in place, and the participant state is the gate.
- **Rollback.** A server built before this change can't reduce `ParticipantLeft`. Roll back only before anyone has left, or keep the shared package.
- **Revocation (FR-GM-20)** adds its own optional marker and event and extends `isActive`, without changing the leaving contract (see the Revocation section).

## Alternatives considered

- **Close only the current socket (§13.1's original wording).** Rejected. There's no server-side fact for the GM to act on, and the player's other tabs keep full control.
- **Remove the participant from state.** Rejected. Token owners, dice rolls and history would point at a missing entity, and `reduce` treats missing references as corruption.
- **A `DepartureResolved` event that wraps the token changes.** Rejected. It would duplicate the semantics and visibility rules of `TokenOwnersSet` and `TokenDeleted`, and it would make undo coarser.
- **The client sends N separate `token.setOwners`/`token.delete` commands.** Rejected. It isn't atomic, and a half-applied resolution is possible.
- **Reassign tokens to the GM automatically on leave.** Rejected. The GM asked to choose per token, and silently rewriting ownership mid-scene surprises the other players.
