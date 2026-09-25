## Context

- `Participant` (`packages/shared/src/state.ts`) is `{ id, role, displayName }`. It is added by `ParticipantJoined`, and nothing ever removes or deactivates one. `decide.ts` already has an `isActive(p)` hook that always returns `true`, with a note that leaving or revocation would change it. `isDisplayNameTaken` already goes through that hook.
- Token ownership is `Token.ownerIds: Id[]`. `token.setOwners` → `TokenOwnersSet { ownerIds, previous }` and `token.delete` → `TokenDeleted { token }` already carry the replaced value (invariant 6).
- `LiveRoom.commit` appends a command's events in one `store.append` call, which is atomic, with consecutive seqs (`roomStore.ts` contract). A command that returns several events is therefore all-or-nothing.
- The socket handshake (`ws/socket.ts`) resolves `guestToken` → credential → participant once. It has no participant-status check, and `LiveRoom` has no way to close a client.
- Stored events come back from Postgres as JSON and are not re-parsed by zod (ADR 0005). New fields on existing shapes must be optional.
- The web client keeps one credential per room in `localStorage` (`net/identity.ts`). `JoinPage` goes straight to the room when a credential for that invite exists.
- The KAN-58 ticket and FRONTEND-CONTRACT §13.1 describe Leave table as closing only the current socket. The request for this change is stronger: leaving costs the player their seat. See the first decision.

## Goals / Non-Goals

**Goals:**
- Model "left" once, in `RoomState`, so the name rule, authorization, the socket gate, the participants list and the GM's pending list all read the same fact.
- Keep every state change on the standard pipeline: command → `decide` → events → append → `reduce` → broadcast.
- Resolve a departure in one atomic, undoable step built from existing events.

**Non-Goals:**
- GM-initiated removal (FR-GM-20). It should reuse the same "not active" concept later, with its own event.
- Automatic cleanup on disconnect or tab close.

## Decisions

### 1. Leaving ends the seat, not just one socket
A player's confirmation commits `ParticipantLeft`, and the server disconnects every client bound to that participant, then refuses the credential from then on.
- *Why:* the request is that a leaving player "would lose everything", and the GM must be able to hand their tokens to someone else. A seat that stays live in another tab could keep moving tokens the GM just reassigned, which makes the GM's decision meaningless.
- *Alternative:* §13.1's literal behaviour, where Leave closes this socket only. That has no server state and no GM involvement, so it can't support the requested notification or reassignment. It stays true for the GM, whose Home link already does exactly that.
- *Follow-up:* the KAN-58 acceptance line "other tabs of the same credential keep playing" and §13.1's sentence need updating. This is task 0.2.

### 2. Contract (ADR 0006, "Participant lifecycle", shared with KAN-52)
```ts
// state.ts
Participant = z.object({ id, role, displayName, left: z.boolean().optional() })

// commands.ts
{ type: "participant.leave" }
{ type: "participant.resolveDeparture",
  participantId: Id,
  actions: z.array(z.discriminatedUnion("action", [
    z.object({ tokenId: Id, action: z.literal("reassign"), to: Id }),
    z.object({ tokenId: Id, action: z.literal("unassign") }),
    z.object({ tokenId: Id, action: z.literal("delete") }),
  ])).min(1).max(200) }

// events.ts
{ type: "ParticipantLeft", participant: Participant }   // full pre-leave participant

// protocol.ts ServerMessage
| { type: "sessionEnded"; reason: "left" }
```
- **`left?: boolean`, not a status enum or removal.** The participant must stay in state: tokens still reference them, dice rolls name them, and the activity log resolves names from state. Optional means old events and stored state are unchanged, the same reasoning as ADR 0005. Revocation can later add its own optional marker, and `isActive` becomes `!p.left && !p.revoked`.
- **`ParticipantLeft` carries the whole participant** (invariant 6). A compensating event, if it's ever wanted, has everything it needs.
- **No new event for resolution.** `participant.resolveDeparture` is decided into existing `TokenOwnersSet` and `TokenDeleted` events. Undo, visibility, the activity log and the client reducer already handle them, and an undo can target one token at a time. *Alternative:* a `DepartureResolved` event that wraps the changes. Rejected, because it would duplicate two existing events' semantics and visibility rules for no new behaviour.
- **One command, not N client-side `token.setOwners`/`token.delete` calls.** That gives one authorization check, one validation that every target is still valid, and one atomic append. A half-applied resolution can't happen.

### 3. `decide` rules
- `participant.leave`: GM → `invalid` ("The GM can't leave their own room."); otherwise → `ParticipantLeft { participant: actor }`.
- All commands: `LiveRoom.submit` rejects an actor who isn't `isActive` as `forbidden` before `decide`. This is defence in depth: the socket should already be closed, but a command queued behind the leave must not run.
- `participant.resolveDeparture`: GM only; the target exists and is not active; the token ids are unique; each token exists and its `ownerIds` include the target (hidden tokens included, because the actor is the GM); each `to` exists, is a player and is active. Then, per action, in the order given:
  - reassign → `TokenOwnersSet { ownerIds: dedupe(owners.map(id => id === left ? to : id)), previous }`;
  - unassign → `TokenOwnersSet { ownerIds: owners without left, previous }`;
  - delete → `TokenDeleted { token }`.
- `token.create`/`token.setOwners`: an owner that isn't active → `invalid`. Without this, the GM could assign a token to someone who has left.
- `isActive(p) = !p.left`. `isDisplayNameTaken` needs no change.

### 4. Derived "pending departures"
```ts
pendingDepartures(state): { participant, tokenIds }[]   // inactive (!isActive) participants still named in some token's ownerIds
```
It keys on `isActive`, not `left`, so KAN-52's revoked participants show up here with no change. It's a pure helper in `packages/shared`, used by the GM panel list and the notice. It isn't state, so there's no "resolved" flag to keep in sync. "Decide later" simply leaves the token naming the departed player.

### 5. Visibility
- `ParticipantLeft` passes to every viewer. The participant list is already public, and the event carries nothing hidden.
- A player's `filterStateForViewer` is unchanged. Players already receive every participant.
- Resolution events go through the existing token filters. A hidden token's reassignment or deletion is redacted for players, as today.

### 6. Server enforcement
- `RoomClient` gains `close(): void`. `socket.ts` implements it as `socket.disconnect(true)`.
- `LiveRoom.commit`: after broadcasting a `ParticipantLeft`, for each client of that participant, send `{ type: "sessionEnded", reason: "left" }`, then `close()` and detach it. The socket handler only sends the `ack` after `submit` returns, and by then the leaving socket is already closed, so the client never gets the ack. The client treats `sessionEnded` as the answer and doesn't wait for the ack.
- Handshake: once the credential resolves, if `room.participant(id)?.left`, call `next(new Error("left"))`.
- `LiveRoom.attach` repeats the check. Socket.IO runs the connection handler a tick after the handshake, so a leave can commit in between; a late socket gets `sessionEnded` and is closed instead of attached (found in the sync review).
- `relayEphemeral` drops messages from senders who aren't active.
- REST `authenticate` and the history route treat a departed participant as unauthenticated (403).
- Credentials are not deleted. The participant state is the gate, and it's event-derived, so memory and Postgres behave the same with no migration.

### 7. Web
- **`RoomConnection`** gains a status `"ended"`. `sessionEnded` or `connect_error` `left` → `status: "ended"` and the socket stops, with no reconnect.
- **`identity.ts`** gains `forgetCredentials(roomId)`. It removes `vtt.credentials.<roomId>` and any `vtt.invite.*` entry pointing at that room, so the invite link shows the join form again.
- **`RoomPage`:** `"ended"` → forget the credentials, then render `SessionEnded`, which names the room if known ("You left <room>") and links home. The room name is captured before the state is dropped.
- **`LeaveTable`** (`panels/LeaveTable.tsx`): a secondary, quiet button in the panel header, rendered for players only. It opens the existing `Modal`. Its content lists the tokens the player owns (from their filtered state; a player can't see hidden tokens, which is correct because they can't lose what they never saw), and says rejoining makes a new player. Buttons: **Stay** (autofocus) and **Leave table** (`danger`). The confirm button shows "Leaving…" while pending. On rejection, it shows the error inline.
- **GM notice** (`ui/DepartureNotice.tsx`): `Room` watches `state.participants` for a transition to `left` that happens after the first snapshot, so a reload doesn't pop old notices. Each departure becomes a dismissible banner at the top of the board area (`role="status"`), with Review tokens when `pendingDepartures` has that player.
- **Departed players section** in `GmPanel`: rendered only when `pendingDepartures(state)` is non-empty. Each row has the name, the token count and a Review button.
- **`ResolveDepartureModal`** (`panels/ResolveDeparture.tsx`): one row per token (name, colour or image chip, "hidden" badge, co-owners). A `<select>` per row offers "Decide later", "Reassign to <each active player>", "Unassign" and "Delete token". The "Apply to all" `<select>` at the top sets every row. A short note says dice rolls and history are kept. **Apply** sends the command with the non-"later" rows and closes on success. It's disabled while every row is "Decide later". On rejection, the error shows in the modal. If a token disappears or changes owners while the modal is open, its row drops out on the next render because rows come from live state.
- **Participants list, owner pickers:** filter on `isActive`. In `TokenRoster`, when a token's current owner has left, the owner `<select>` shows a disabled "<name> (left)" option, so the control doesn't silently claim "No owner".

## Risks / Trade-offs

- [A player clicks Leave by accident and loses their seat] → confirmation modal with Stay focused, and explicit loss copy. Rejoining is one step, and the GM can reassign their tokens to the new seat.
- [Deviation from KAN-58 / §13.1 wording] → recorded here, in ADR 0006, and as task 0.2 to update the ticket and contract.
- [A shared browser profile: two people using one credential] → both are ended. That's the intended meaning of one seat.
- [A queued command from the leaver's other tab lands after `ParticipantLeft`] → `submit` rejects inactive actors inside the room queue, so the order is total.
- [One player owning a very large number of tokens] → capped at 200 actions per command, far more than a player normally owns. Anything beyond that can be resolved in several applies.
- [Old clients during deploy don't know `ParticipantLeft`] → their reducer throws on the unknown event, which triggers a resync. The snapshot still parses because `left` is just an extra field. Acceptable during a rolling deploy.

## Migration Plan

No data migration. The new fields and events are additive. Rollback: an old server can't reduce a stored `ParticipantLeft`, so a room where someone has left won't load on a rolled-back build. Roll back only before any leave has happened, or ship the shared change first.

## Open Questions

- Should players also see a "Sam left the table" announcement? Leaving it GM-only for now, because the participant count changes visibly for everyone. It could be added later without changing the contract.
