## Context

- **This builds on `leave-table` (KAN-58).** That change adds the following, and this design assumes all of it is in place:
  - `Participant.left?`, and `isActive(p)`, which gates the display-name rule and owner validation.
  - `RoomClient.close()`, and `LiveRoom` closing the clients of a departed participant after sending `sessionEnded`.
  - The handshake, `authenticate` and `submit` gates that turn away inactive participants, and `relayEphemeral` dropping their messages.
  - `forgetCredentials(roomId)`, the `"ended"` status in `RoomConnection`, and the `SessionEnded` screen.
  - `pendingDepartures(state)`, `participant.resolveDeparture`, `ResolveDepartureModal`, and the GM panel's list of departed players.
- Identity is a guest token the browser generates, and the server keeps only its SHA-256 (ADR 0002). `PostgresRoomStore.findCredential` already treats `revokedAt` as missing. `MemoryRoomStore` has no such field. Nothing writes `revokedAt`.
- The invite code lives on the `rooms` row (`invite_code`, unique). It is not in `RoomState` or in any event. Only the GM's browser knows it: it comes from `CreateRoomResponse`, is cached in `StoredCredentials.inviteCode`, and `ShareButton` reads it from there.

## Goals / Non-Goals

**Goals:**
- Revocation is one more way to become inactive. It adds nothing that `leave-table` already has.
- Revocation is recorded in the log. A replay or a restart gives the same result.

**Non-Goals:**
- A general participant status enum. Two optional flags are enough.
- Syncing the invite code live to other GM devices. Share fetches the code each time it opens.

## Decisions

### D1. `revoked` is a second flag next to `left`, and `isActive` checks both
`Participant.revoked: z.boolean().optional()`, and `isActive = (p) => !p.left && !p.revoked`. Every place `leave-table` keys on `isActive` then covers revocation without further changes: the name rule, owner validation, the `submit`, handshake and REST gates, `relayEphemeral`, `pendingDepartures` and `resolveDeparture`'s "target is not active" check.
- *Alternative: reuse `left` for revocation.* The log would then say the player left when the GM removed them, and the client could not tell "You left" apart from "You were removed".
- *Alternative: a `status` enum.* That changes the shape `leave-table` already defined. Two optional flags are additive and parse old data.

### D2. The event carries only the participant, and tokens are not touched
`ParticipantRevoked { participant }` is the full participant as it was before, the same shape as `ParticipantLeft`. `reduce` sets `revoked: true`.
- *Alternative, dropped: remove the id from `ownerIds` in the same event.* This was the earlier version of this change. It took the decision away from the GM: handing a character to a replacement player turned into a manual search. It also needed a `tokenOwners` payload and a hidden-token resync rule. With the departure review, the GM chooses per token, and every resolution uses the existing `TokenOwnersSet` and `TokenDeleted` events.
- "Tokens return to GM control" holds without any rewrite. A revoked player cannot connect or send commands, so only the GM and any other active owners can act on those tokens.

### D3. `decide` for `participant.revoke`
The steps, in order:
1. `can.administer(actor)`, otherwise `forbidden`.
2. The target exists, otherwise `not_found`.
3. `invalid` if the target is a GM, is the actor, or is already inactive.
4. Otherwise emit `ParticipantRevoked`.

The `leave-table` gate in `LiveRoom.submit` already rejects commands queued behind the revoke.

### D4. Server: the shared close path, plus the credential row
- `LiveRoom` treats `ParticipantRevoked` like `ParticipantLeft`. It sends `{ type: "sessionEnded", reason: "revoked" }` to each matching client, then calls `close()` and detaches it. The `sessionEnded` reason union grows from `"left"` to `"left" | "revoked"`. The handshake's `next(new Error(...))` uses the inactive participant's reason.
- Unlike leaving, revocation also calls `store.revokeCredentials(roomId, participantId)` inside the room queue, after the commit. That sets `revoked_at` in Postgres, and a new `revokedAt` in the memory store. The room state is the authority. The column is a second lock that still holds if the event log is ever lost or restored from a partial copy, and it lets the credential lookup reject a revoked token before loading the room. If this write fails, the failure is logged and the call is not retried, the same way `syncAssetRefs` does it. Leaving does not write the column, because a player who leaves is not a security concern.

### D5. Visibility
`ParticipantRevoked` passes to every viewer, like `ParticipantLeft`. The participant list is already public, and the event carries nothing hidden. That is simpler than the earlier version, which needed a resync rule for hidden tokens.

### D6. The invite code is not game state
- `POST /api/rooms/:roomId/invite` generates a new code with `newInviteCode()`, stores it with `store.setInviteCode`, and returns `{ inviteCode }`. `GET` returns the current code.
- Both routes use `authenticate` and require `role === "gm"` for that same `roomId`.
- The memory store deletes the old entry in its `invites` map. Postgres updates `rooms.invite_code` and retries up to 3 times if the new code collides with the unique index.
- `findRoomByInvite` already reads from the store, so the old code stops working as soon as the update commits.
- *Alternative, rejected: a `room.resetInvite` command with an event.* The code would then sit in the append-only log forever, so a leaked code could always be recovered from history, and a new filter would be needed to keep it from players. It follows that a reset has no activity-log line, which the proposal lists as a non-goal.
- This part does not depend on `leave-table` and can ship first.

### D7. Web
- **`ParticipantsButton`:** for the GM, each active player's row gets a Remove button. The existing `Modal` asks "Remove Sam from this room?" and explains that Sam is disconnected, that Sam's tokens stay for the GM to review, and that Sam can come back through the invite link unless it is reset. On confirm it sends `participant.revoke`. If Sam appears in `pendingDepartures` afterwards, it opens `ResolveDepartureModal` for Sam.
- **`ShareButton`:** main turned Share into a one-click copy with no popover (PR #31), so there is no popover to show the code in. Share now takes `roomId` and calls `api.getInvite` on each click, then copies that link, so a reset made in another tab or device is what gets copied. A small "Reset link" button sits right under Share, which meets "a reset action next to the invite link". It asks for confirmation, calls `api.resetInvite`, and writes the new code back to `StoredCredentials.inviteCode`, so `gmRoomForInvite` keeps working. Share is rendered for the GM even without a cached code.
- **Handshake reason for a revoked credential:** `findCredential` hides revoked rows, so the handshake also asks `findRevokedCredential` and answers `revoked` instead of `unauthorized`.
- **`DepartureNotice`:** shows only for players who left. A removal is the GM's own action, and its review opens directly instead.
- **`SessionEnded`:** reads the reason. `revoked` shows "You were removed from <room>" instead of "You left <room>".
- **Labels:** the list of players to resolve, the review modal and `TokenRoster`'s "<name> (left)" option use one helper, `inactiveLabel(p)`, which returns `"removed"` or `"left"`.

### D8. One ADR 0006, "Participant lifecycle"
`leave-table` task 0.1 writes `docs/adr/0006-participant-lifecycle.md`, not `0006-leave-table.md`. It covers `left`, `isActive`, the gates and the departure review. This change adds a revocation section: D1, D2, D4 and D6. The Real-Time Architecture owner then reviews both flags together, which is required because this changes existing `packages/shared` schemas.

## Risks / Trade-offs

- [`leave-table` changes shape during implementation] → Revocation touches only `isActive`, the `sessionEnded` reason and the close path. Re-check D1 and D4 against the merged `leave-table` before starting the revocation tasks.
- [A revoked player's tokens stay unresolved for a long time] → Nobody but the GM can act on them, and they stay listed in the GM panel until resolved. That matches "decide later" for departures.
- [The GM revokes the wrong person] → The confirmation names the player. There is no undo. The guest can rejoin through the invite if it has not been reset, and the GM can reassign their tokens to the new seat.
- [A revoked guest rejoins through the same invite] → Expected until the GM resets the link. The Remove confirmation says so.
- [The credential row write fails after the commit] → The state gate is authoritative, and the failure is logged. The write is not awaited inside the room queue, so a slow database can't stall the room, and `LiveRoom.load` re-applies it for every removed participant, so a crash before the write heals on the next load.
- [A join already past the invite lookup when the GM resets] → That one join still lands. The window is one request long; the next request with the old code gets 404.

## Migration Plan

No database migration: `credentials.revoked_at` and the unique `rooms.invite_code` already exist, and the `revoked` flag is optional.

Ship the invite reset at any time. Ship revocation after `leave-table`.

Rollback: an older server cannot reduce a stored `ParticipantRevoked`. Roll back only before any revocation has happened, or ship the shared contract first.
