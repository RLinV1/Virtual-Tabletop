## Why

A GM has no way to remove someone from a room or to stop a leaked invite link from working. Anyone who has the link can join, and a joined guest stays in the room for good. FR-GM-20 asks for both controls. Tracked as KAN-52.

**Depends on `leave-table` (KAN-58).** That change adds the idea of a participant who is no longer active: `Participant.left`, `isActive`, the server closing sockets and refusing credentials, and the GM's per-token review of what a departed player owned (`pendingDepartures`, `participant.resolveDeparture`). Revocation is the same lifecycle, started by the GM instead of the player, so this change adds a second way to become inactive and reuses everything else. Build `leave-table` first.

## What Changes

- New command `participant.revoke { participantId }`. It is GM only. It can target a player, but not a GM and not someone who is already inactive.
- New event `ParticipantRevoked { participant }`. It carries the full participant as it was before (invariant 6). **It does not change any token.**
- `Participant` gets an optional `revoked` flag. `isActive` becomes `!p.left && !p.revoked`.
- A revoked participant is handled like a player who left, through the parts `leave-table` already builds:
  - Every open socket gets `sessionEnded` with `reason: "revoked"`, then the server closes it.
  - Their credential is refused when they reconnect (`connect_error` `revoked`), and in REST auth.
  - Commands and ephemeral messages from them are rejected or dropped.
  - Their display name is freed, and they can no longer be picked as a token owner.
- **Tokens go back to GM control with nothing rewritten.** A revoked player can't connect or send commands, so only the GM can move tokens that still name them. Those tokens appear in the GM's review list, the same one departed players use. There the GM reassigns, unassigns, deletes, or decides later for each token with `participant.resolveDeparture`. After a Remove, the review opens straight away if the player owned tokens.
- **Revocation also writes the credential row's `revoked_at`.** Leaving relies on room state alone. Revocation also sets this column, as a second lock that keeps holding if room state is ever lost. The column already exists, and the Postgres store already ignores revoked rows, but nothing ever writes it. The memory store gets the same behavior.
- **Invite reset.** New GM-only REST endpoints: `GET /api/rooms/:roomId/invite` returns the current code, and `POST /api/rooms/:roomId/invite` replaces it. The old code returns 404 on join. Everyone already in the room keeps their credential and stays connected.
- **Web:**
  - The Participants popover gives the GM a "Remove" action for each player, with a confirmation step that names the player.
  - The Share popover loads the current invite from the server and adds a "Reset link" action, with a confirmation step.
  - A revoked guest sees a "You were removed from this room" version of the session-ended screen from `leave-table`.
  - In the GM's review list and in the owner pickers, a revoked player is shown as "removed" instead of "left".
- **Contract change.** Adds a new command, a new event, an optional `revoked` field on `Participant`, and a `"revoked"` reason for `sessionEnded`. Older events still parse. These go into the **shared ADR 0006 "Participant lifecycle"** that `leave-table` starts, so the Real-Time Architecture owner reviews `left` and `revoked` together.

## Non-goals

- Undoing a revocation. A revoked guest who still has the invite link can join again as a new participant. The GM resets the link to prevent that.
- Revoking or demoting the GM, and transferring the room.
- Putting invite codes in the event log or the activity log. The code is room access config held on the `rooms` row, not game state (see design.md).
- Removing a revoked player from tokens automatically. The GM decides, as for departures.

## Capabilities

### New Capabilities
- `room-access`: how the GM controls who can get into a room. Covers revoking a participant, handling a revoked player's tokens through the departure review, and resetting the invite link.

### Modified Capabilities
- `room-participants`: revoked participants are left out of the participant list and the owner pickers, and cannot be given tokens. The "Only active participants hold a name" requirement already covers revocation and does not change.

## Impact

- `packages/shared`: `state.ts` (`Participant.revoked`), `commands.ts`, `events.ts`, `decide.ts` (`participant.revoke`, and `isActive` now also checks `revoked`), `reducer.ts`, `activityLog.ts` ("GM removed Sam from the room"), `protocol.ts` (`sessionEnded` reason `revoked`, and invite request and response types). `visibility.ts` needs only a pass-through case, because the event carries nothing hidden. `pendingDepartures` and `resolveDeparture` already take any inactive participant, because `leave-table` builds them on `isActive`.
- `apps/server`:
  - `LiveRoom` closes a revoked participant's clients using `leave-table`'s `close()` path, then revokes their credential.
  - `RoomStore` gains `revokeCredentials`, `getInviteCode` and `setInviteCode`, in both the memory and Postgres stores.
  - The handshake gate from `leave-table` sends `revoked` as the reason.
  - New invite routes.
- `apps/web`: `ParticipantsButton` (Remove), `ShareButton` (fetch and reset), `net/api.ts`, the session-ended screen (removed wording), and the departure review and owner pickers ("removed" label).
- `docs/adr/0006-participant-lifecycle.md`: gains a revocation section. `docs/INTERFACE.md`: the `/settings` access controls now live in the Share and Participants popovers.
- No Prisma migration.
