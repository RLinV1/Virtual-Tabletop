## 0. Architecture review and docs

- [x] 0.1 Draft ADR 0006 "Participant lifecycle" (`docs/adr/0006-participant-lifecycle.md`): `Participant.left`, `isActive`, `participant.leave`, `participant.resolveDeparture`, `ParticipantLeft`, `sessionEnded`. Structure it so KAN-52 (`guest-revocation-and-invite-regeneration`) can add a `revoked` section to the same ADR. The Real-Time Architecture owner accepts it before any `packages/shared` change. Verify: the ADR status reads Accepted.
- [ ] 0.2 Update FRONTEND-CONTRACT §13.1's Leave table sentence and comment on KAN-58 that leaving ends the seat on every tab (design decision 1). Verify: the doc diff and the Jira comment exist. (Doc updated; the Jira comment waits for the owner's go-ahead to post.)

## 1. Contract (`packages/shared`)

- [x] 1.1 Add `left?` to `Participant`, the two commands, the `ParticipantLeft` event and the `sessionEnded` server message; make `isActive = !p.left`. Verify: `npm run typecheck` passes.
- [x] 1.2 `decide`: `participant.leave` (GM rejected), `participant.resolveDeparture` (every validation in design §3, events in action order), and inactive owners rejected in `token.create`/`token.setOwners`. Verify: new `decide.test.ts` cases, including the spec scenarios Mixed resolution, Co-owner kept, Invalid target rejects everything, Player cannot resolve and GM cannot leave (FR IDs/KAN-58 in `describe`).
- [x] 1.3 `reduce` handles `ParticipantLeft`; add a `pendingDepartures` helper. Verify: unit tests that a leave keeps the participant with `left: true`, leaves tokens untouched, frees the name for `decideJoin`, and that `pendingDepartures` empties after resolution.
- [x] 1.4 Visibility and activity log: `ParticipantLeft` passes to players; `formatActivity` → "<name> left the table". Verify: `visibility.test.ts` and `activityLog.test.ts` cases, including a hidden-token reassignment being redacted for players.

## 2. Server

- [x] 2.1 `RoomClient.close()`; `LiveRoom.commit` sends `sessionEnded` to and closes every client of a departed participant; `submit` rejects inactive actors; `relayEphemeral` drops them. Verify: integration test where one participant has two sockets, one leaves, both get `sessionEnded` and disconnect, and a third participant receives `ParticipantLeft` and stays connected.
- [x] 2.2 Handshake refuses a departed participant's credential with `left`; REST `authenticate` and history treat them as unauthenticated. Verify: integration tests for a reconnect refused after leaving, and rejoining through the invite with the same name succeeding as a new participant.
- [x] 2.3 Resolution is atomic over the wire. Verify: integration test where the GM resolves reassign + delete in one command, the player sees consecutive seqs, and an invalid target leaves the seq unchanged.

## 3. Web

- [x] 3.1 `RoomConnection` `"ended"` status from `sessionEnded` and `connect_error: left`; `forgetCredentials(roomId)` in `identity.ts`. Verify: the typecheck passes, and in the browser, after leaving, the invite link shows the join form.
- [x] 3.2 `LeaveTable` button and confirmation modal (players only, lists owned tokens, Stay focused, Escape cancels) plus the `SessionEnded` screen. Verify: in the browser, a player leaves from one tab and both tabs show the session-ended screen; Escape leaves them connected.
- [x] 3.3 GM `DepartureNotice` (live region, Review tokens only when tokens are pending, dismissible, not re-shown on reload) and the Departed players section in `GmPanel`. Verify: in the browser, a notice appears when a player leaves; after a reload only the panel section shows.
- [x] 3.4 `ResolveDepartureModal` with per-token choices, Apply to all, history note, and inline errors. Verify: in the browser, a mixed resolution (reassign one, delete one, leave one) is reflected on the GM's and a player's boards.
- [x] 3.5 Active-only participants list and owner pickers; `TokenRoster` shows "<name> (left)" for a departed owner. Verify: in the browser, the participant count drops after leaving, and the departed player isn't offered in pickers.

## 4. Verification

- [x] 4.1 `npx openspec validate leave-table --strict`, then `npm run lint && npm run typecheck && npm test`.
- [x] 4.2 Run the sync-reviewer and visibility-auditor agents on the diff and address their findings.
