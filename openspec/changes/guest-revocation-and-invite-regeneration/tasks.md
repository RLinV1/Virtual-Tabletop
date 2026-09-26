## 1. Invite reset (independent of leave-table, can start now)

- [x] 1.1 Add `InviteResponse { inviteCode }` to `packages/shared/src/protocol.ts`. Verify: `npm run typecheck` passes.
- [x] 1.2 Add `getInviteCode(roomId)` and `setInviteCode(roomId, code)` to `RoomStore`:
  - memory store: drop the old invite from its map;
  - Postgres store: update `invite_code`, retrying up to 3 times on a unique collision.
  Verify: memory and `postgresStore.test.ts` cases where the old code resolves to null and the new code resolves to the room.
- [x] 1.3 Add `GET` and `POST /api/rooms/:roomId/invite`, allowed only for that room's GM (403 otherwise). Verify with an integration test tagged `(FR-GM-20)`:
  - a player gets 403;
  - after a reset, the old code returns 404 on join and the new code joins;
  - connected players stay connected and can reconnect.
- [x] 1.4 Add `api.getInvite` and `api.resetInvite`. `ShareButton` takes `roomId`, fetches the current invite when it opens, and adds "Reset link" with a confirmation that writes the new code back to `StoredCredentials.inviteCode`. Verify: in the browser, a reset in one GM tab shows up in another tab's Share popover, and the old `/join/<code>` shows "Invite not found".

## 2. Revocation contract (after leave-table has merged)

- [x] 2.1 Re-read the merged `leave-table` code and confirm design D1 and D4 still fit: `isActive`, the `sessionEnded` reason union, the close path and `pendingDepartures`. If not, update design.md with `/opsx:update` before going on. Verify: a note in the PR description.
- [x] 2.2 Add a revocation section to `docs/adr/0006-participant-lifecycle.md` covering design D1, D2, D4 and D6, for the Real-Time Architecture owner to review. Verify: the section exists, and the ADR status is Accepted before 2.3 merges. (Accepted by the owner, 2026-09-25.)
- [x] 2.3 Contract changes in `packages/shared`:
  - add `revoked?` to `Participant`, the `participant.revoke` command and the `ParticipantRevoked { participant }` event;
  - add `"revoked"` to the `sessionEnded` reasons;
  - make `isActive = !p.left && !p.revoked`.
  Verify: `npm run typecheck` passes, and an old `ParticipantJoined` event with no `revoked` field still parses.
- [x] 2.4 Handle `participant.revoke` in `decide`, following design D3, and handle `ParticipantRevoked` in `reduce` by setting only the flag, with no token changes. Verify with `decide.test.ts` and reducer tests tagged `(FR-GM-20)`:
  - `forbidden` for a player;
  - `invalid` for self, a GM, an already-revoked target and a target who left;
  - `not_found` for an unknown id;
  - token `ownerIds` unchanged;
  - the name is freed for `decideJoin`;
  - `pendingDepartures` lists the revoked owner;
  - `resolveDeparture` accepts the revoked owner;
  - `token.setOwners` naming a revoked participant returns `invalid`.
- [x] 2.5 Visibility and activity log: `ParticipantRevoked` passes to every viewer, and the log line reads "<actor> removed <name> from the room". Verify: `visibility.test.ts` and `activityLog.test.ts` cases, including earlier "Sam moved ..." entries still showing Sam's name.

## 3. Revocation server (after section 2)

- [x] 3.1 `LiveRoom` sends `sessionEnded` with reason `revoked` and closes the revoked participant's clients through `leave-table`'s close path. The handshake refuses with `revoked`. Verify: the integration test in 3.3.
- [x] 3.2 Add `revokeCredentials(roomId, participantId)` to `RoomStore`. The memory store gets `revokedAt`, and the Postgres store sets `revoked_at`. `LiveRoom` calls it after committing `ParticipantRevoked` and logs any failure. Verify: store tests where a revoked credential resolves to null.
- [x] 3.3 Add an integration test `describe("guest revocation (FR-GM-20)")`. A player is connected in two sockets and gets revoked. Check that:
  - both sockets get `sessionEnded` `revoked` and disconnect;
  - the other player stays connected;
  - the token still names the player, the GM can move it and the revoked player cannot;
  - a reconnect with the old token is refused;
  - after reloading from the store (a restart), the old token is still refused;
  - the GM then resolves the token with `resolveDeparture`.
  Verify: `npm test --workspace=@vtt/server -- -t "FR-GM-20"`.

## 4. Revocation web (after section 3)

- [x] 4.1 In `ParticipantsButton`, give the GM a Remove button on each active player, with a `Modal` confirmation that names the player and explains the tokens and the invite link. On success, open `ResolveDepartureModal` if the player owns tokens. Verify: in the browser with a GM tab and a player tab.
- [x] 4.2 Make `SessionEnded` show "You were removed from <room>" for the `revoked` reason. Add an `inactiveLabel(p)` helper ("removed" / "left") and use it in the departed-players list, the review modal and `TokenRoster`. Verify: in the browser, the revoked tab shows the removed wording and a reload does not reconnect it; the GM panel lists the player as removed.
- [x] 4.3 End-to-end check in the browser preview:
  1. the GM removes a player who owns a token;
  2. the review opens and the GM reassigns the token to another player;
  3. the GM resets the link and the old link shows "Invite not found";
  4. the remaining player stays connected.
  Verify: capture a screenshot.

## 5. Wrap-up

- [x] 5.1 Update `docs/INTERFACE.md` (`/settings` → the Share and Participants popovers) and the `ui/guide.ts` tour text if it mentions Share or Participants. Verify: read the diff.
- [x] 5.2 Run `npm run lint && npm run typecheck && npm test` and confirm all of it passes. Run the `sync-reviewer` and `visibility-auditor` agents on the diff and address their findings.
