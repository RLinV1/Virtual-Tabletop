## Why

KAN-58: a player has no way to leave a room except closing the tab, and FRONTEND-CONTRACT §13.1 says closing the browser isn't a reliable session-end event. When a player does stop playing, their tokens keep pointing at someone who will never move them again, and the GM has no tool to hand those tokens to a new player or clean them up. This change adds a deliberate **Leave table** that ends the player's seat for good, and gives the GM a way to decide, token by token, what happens to what that player owned.

## What Changes

- **Leave table (players).** A "Leave table" button in the sidebar header, below the primary controls and reachable by keyboard. It opens a confirmation modal that spells out what the player loses: their seat and display name in this room, control of every token they own (listed by name), and that coming back through the invite link makes them a new player the GM has to re-assign. The safe action (**Stay**) has focus by default; **Leave table** is styled as destructive.
- **Leaving is permanent for that seat.** Confirming sends a new `participant.leave` command. The server commits a new `ParticipantLeft` event, which marks the participant as left. Every open tab and device using that credential gets a terminal `sessionEnded` message and is disconnected, and later connection attempts with that credential are refused. The browser forgets its stored credential for the room and shows a simple session-ended screen.
  - This deliberately goes further than KAN-58's wording that other tabs of the same credential keep playing. The request is that leaving costs the player everything, and a seat that's still live in another tab isn't "left". Recorded in design.md.
- **Their tokens are not touched automatically.** Leaving doesn't change any token. Ownership still names the departed player until the GM resolves it, so nothing disappears from the board mid-scene without the GM choosing that.
- **GM is notified.** When a player leaves, the GM sees a notice ("Sam left the table") in the room. If Sam owned tokens, the notice offers **Review tokens**. Unresolved departures also stay listed in the GM panel under **Departed players**, so the choice survives a reload and can be made later, for example once a replacement player has joined.
- **GM resolves per token (fine-grained).** The review modal lists each token the departed player owned, with its co-owners, and a per-token choice:
  - **Reassign to…** an active player. The departed player is replaced by that player; other co-owners are kept.
  - **Unassign.** The departed player is removed from the owners. With no owners left, only the GM controls it.
  - **Delete token.**
  - **Decide later.** The default. Leaves the token as it is.
  
  An **Apply to all** control sets every row at once, and rows can then be changed one by one. Applying sends one new `participant.resolveDeparture` command, which the server turns into the existing `TokenOwnersSet` and `TokenDeleted` events, committed together.
- **History stays.** Dice rolls and activity-log entries by a departed player remain (events are append-only). The modal says so.
- **Participants list** shows active participants only. The name a departed player used is free for a new joiner (the `isActive` hook in `decide.ts` already anticipates this).
- **GM.** The GM can't leave their own room. The existing **Home** link stays their way out, and it only closes the socket.

## Capabilities

### New Capabilities
- `leave-table`: a player permanently leaving a room with confirmation, the session-ended experience on every tab of that seat, and the GM's notification and per-token resolution of what the departed player owned.

### Modified Capabilities
- `room-navigation`: players gain a way out of the room (Leave table). The purpose line that says players "simply close the tab" no longer holds.
- `room-participants`: the participants list shows active participants only, and leaving is now a concrete way a participant stops holding a name.

## Impact

- **`packages/shared` (contract change, needs ADR 0006 and Real-Time Architecture owner review):** `Participant` gains optional `left`; new command `participant.leave` and `participant.resolveDeparture`; new event `ParticipantLeft`; `isActive` becomes real; a `pendingDepartures(state)` helper; `ServerMessage` gains `sessionEnded`; the activity log formats the new event. Visibility filters pass `ParticipantLeft` to everyone (the participant list is already public).
- **Server:** `LiveRoom` refuses commands and ephemeral traffic from departed participants and closes their sockets after `ParticipantLeft`; the socket handshake rejects a departed participant's credential with `left`; REST `authenticate` ignores departed participants. No schema migration: participant state is derived from events.
- **Web:** Leave table button and confirmation modal, session-ended screen, credential cleanup in `net/identity.ts`, `sessionEnded`/`left` handling in `net/roomConnection.ts`, GM departure notice and review modal, a Departed players section in `GmPanel`, and owner pickers (`AddToken`, `TokenRoster`) limited to active players.
- **Tests:** shared unit tests for decide/reduce/visibility/activity log; server integration tests for multi-tab disconnect, refused reconnect, name reuse and atomic resolution.

## Non-goals

- GM removing a player (FR-GM-20 revocation, KAN-52). This change builds the "left" state that revocation can reuse.
- Guest-to-account linking after leaving (§13.1 defers it until the backend exists).
- Undoing a leave. A player who comes back joins as a new participant.
- Deleting or rewriting a departed player's dice rolls or history.
