# Tasks

Groups 2 to 5 are milestones, one PR each, in this order. Each leaves `main` working.

## 1. Before building

- [ ] 1.1 Write `docs/adr/0017-user-accounts.md`: the three layers and their rule, I1, O1, O2, O3, M1 to M4, C4, and the "Where this design departs from the docs" table. Get Raymond's review (CLAUDE.md: `CreateRoomRequest` is an existing shared schema). Verify the ADR links ADR 0002, 0004 and 0006 and DESIGN.md §13.1, and that its status records the review.
- [ ] 1.2 Finish and archive `dice-image-skins` (its open tasks 5.3 and 5.4). Verify `openspec validate user-accounts --strict` no longer reports that the `dice-looks` delta would be refused.
- [ ] 1.3 Trim `device-identity-bridge` with `/opsx:update`: keep its retention sweep and doc tasks; drop its `gm-home` deltas, its "Assets whose owner can no longer be proven" and its task 2.4. Archive it. Verify both `openspec validate device-identity-bridge --strict` and `openspec validate user-accounts --strict` pass.
- [x] 1.4 Write migration `0006_accounts`:
  - `User` (`id`, unique normalised `email`, `displayName`, `passwordHash`, unique `ownerId` → `GmIdentity`, `activeDiceLookId` → `DiceLook` with SetNull, `createdAt`, `passwordChangedAt`);
  - `Session` (`tokenHash` PK, `userId` with cascade, `createdAt`, `lastSeenAt`, `expiresAt`);
  - `RoomMember` (PK `roomId` + `participantId`, unique `roomId` + `userId`, room cascade);
  - `DiceLook` (`id`, `ownerGmId`, `name`, `faces` Json, timestamps);
  - `Credential.sessionHash` → `Session` with cascade;
  - `GmIdentity.tokenHash` optional.

  Verify `npm run prisma:migrate --workspace=@vtt/server` applies to a fresh compose Postgres and to one at `0005`.

## 2. Milestone: Identity

- [x] 2.1 Add `packages/shared/src/auth.ts` (C4). Verify `packages/shared/test/auth.test.ts` (`describe("user accounts (FR-GM-01)")`):
  - email trimming, lowercasing and the 254-character limit;
  - passwords of 8 and 128 characters accepted, 7 and 129 refused;
  - a password equal to the email refused;
  - a blank display name refused.
- [x] 2.2 Add `store/identityStore.ts` (users and sessions, including `createUser`, which creates the owner row in the same transaction) to both stores. Verify with `apps/server/test/identityStore.test.ts`, run on memory and Postgres:
  - a duplicate normalised email is refused;
  - ending a session ends the seat credentials bound to it, and leaves guest seats alone (there is no account deletion to cascade from; it is out of scope);
  - deleting sessions except one keeps that one;
  - the expiry sweep removes expired and idle sessions with their seats.
- [x] 2.3 Add `identity/passwords.ts` and the `@node-rs/argon2` dependency (I2). Verify unit tests for the round trip, a wrong password, a stale-parameter hash flagged for rehash and the dummy verify, and that CI's `npm ci` needs no build tools.
- [x] 2.4 Add `identity/sessions.ts` (I1), with an injected clock and the hourly sweep. Verify unit tests for idle expiry, absolute expiry, the touch throttle, the sweep, and the exact `Set-Cookie` string with and without `COOKIE_SECURE`.
- [x] 2.5 Add `identity/rateLimit.ts` (I4). Verify unit tests for the limit, the window rollover and reset.
- [x] 2.6 Add `identity/middleware.ts` (`attachAccount`, `requireAccount`, `requireSameOrigin`, I3), wired in `app.ts` with `TRUST_PROXY`. Verify integration tests:
  - a foreign `Origin` gets 403 and changes nothing;
  - a matching `Origin` and a LAN `Host` pass;
  - a dead cookie is cleared in the response.
- [x] 2.7 Add `identity/routes.ts` (`signup`, `signin`, `signout`, `me`, `password`; C2). Verify `apps/server/test/accounts.test.ts` covers every `user-accounts` scenario for creating an account, sign in and sign out, session cookie, credentials never shown, change password and guessing resistance.
- [x] 2.8 Add `scripts/resetPassword.ts` and the `account:reset-password` npm script (I5). Verify against compose Postgres: the printed password signs in, the old one fails, and earlier sessions see `me` = null.

## 3. Milestone: Ownership

- [x] 3.1 Replace `http/gmAuth.ts` with `ownership/resolveOwner.ts` (O1) and update every caller. Verify `library.test.ts` and `creatures.test.ts` pass for a signed-in client, and that legacy reads, renames and deletes still pass with a device token.
- [x] 3.2 Require an account for `POST /api/rooms`, the library upload and creature creation; remove `CreateRoomRequest.gmToken`; make `POST /api/gm/identify` return 410. Verify that for each endpoint no session gives 401, a legacy token with no session gives 401 and stores nothing, and signed in gives a row owned by the account. Also verify that an old body that still sends `gmToken` parses.
- [x] 3.3 Add `claimDeviceOwner` and the legacy summary to both stores, and the `ownership/legacy.ts` routes (O2). Verify tests:
  - the move covers rooms, assets, creatures and dice looks;
  - a second claim and another account's claim both return 404;
  - the old token gets 401 afterwards;
  - signing in alone moves nothing;
  - on Postgres, a failure partway through leaves everything with the device owner.
- [x] 3.4 Add `packages/shared/src/diceLooks.ts`, the dice-look store methods, and `ownership/diceLooks.ts` (O3). Verify `apps/server/test/diceLooks.test.ts`:
  - every `dice-looks` "Account looks are checked and private on the server" scenario;
  - 1536 × 1024 and 512 × 512 accepted; 1920 × 1080 and 600 × 600 refused;
  - no orphaned stored object after replace, reset or delete;
  - deleting the look in use clears the choice.
- [x] 3.5 Add an "account data stays out of rooms" test: a signed-in GM and a signed-in player share a room. Verify that no snapshot, event, relay or room REST response either receives contains the other's email or account id.

## 4. Milestone: Membership

- [x] 4.1 Add `packages/shared/src/membership.ts` and `store/membershipStore.ts` (`room_members`; credential `sessionHash` binding) to both stores. Verify store tests: one row per person per room, deleting the room cascades, and deleting a session cascades its bound credentials.
- [x] 4.2 Keep the seat on create and on a signed-in join, inside the `LiveRoom.join` queue step (M1): 409 `already_member`, a left seat repointed, 403 after revocation. Verify `apps/server/test/membership.test.ts` covers every scenario of "Seats taken while signed in belong to the account", including two concurrent signed-in joins with one winner.
- [x] 4.3 Add `POST /api/rooms/:id/seat` (M2, including the owner fallback). Verify integration tests:
  - a second "device" connects over Socket.IO as the same participant, for a GM and for a player, while the first stays connected;
  - the seq is unchanged;
  - 404 for a stranger, 401 with no session, 403 `left` and `revoked`;
  - a legacy-claimed room resumes as its GM.
- [x] 4.4 Add `POST /api/rooms/:id/seat/keep` (M3). Verify tests for each "Keep a guest seat on the account" scenario and each 409 reason, and that the participant id and the room seq are unchanged.
- [x] 4.5 Add session-bound seat ending (M4): record `tokenHash` at the handshake; refuse a credential whose session has expired; add `RoomRegistry.closeCredentials`, called after sign-out, the sweep, a password change and the operator reset. Verify tests: after sign-out, that device's socket gets `session-ended { reason: "signed_out" }` and its credential is refused, while another device and a never-signed-in guest stay connected.
- [x] 4.6 Add `GET /api/me/rooms` (M5). Verify that `hosting` lists owned rooms, `playing` lists only active player seats, and left, revoked and deleted rooms are excluded.

## 5. Milestone: Web

- [x] 5.1 Add the `account/` module (C3): `accountStore`, `safeNext`, `RequireAccount`, `AccountMenu`, and the sign-in and sign-up pages moved from `pages/`. Remove "Continue as guest", `markGuest` and `isGuest`, and drop `vtt.gmGuest` on startup. Verify web unit tests for status transitions and `safeNext` (`//evil.example`, `https://…`, `/\evil` and `javascript:` all fall back), and walk every `gm-dashboard` "One entry rule" scenario in the browser, including Back.
- [x] 5.2 Make GM requests stop sending `X-GM-Token` except `api.legacy`; delete `ensureGmToken`, `getGmToken` and `reidentify`; forget the token on a legacy 401. Verify `grep -rn "getGmToken\|ensureGmToken\|reidentify" apps/web/src` is empty, plus a unit test for forget-on-401.
- [x] 5.3 Turn the dashboard into Your rooms (Hosting, Playing) and add the legacy-move banner. Verify the `gm-dashboard` "GM dashboard" and "Bring this browser's rooms into the account" scenarios in the browser, with a legacy token seeded through the memory store.
- [x] 5.4 Add `net/seats.ts` (`ensureSeat`, `forgetAccountSeats`), and route dashboard Open and the invite page's "Resume as <name>" through it. Verify in two browser profiles signed in to one account: the GM resumes, a player resumes, and the invite page offers Resume instead of the join form.
- [x] 5.5 In the room, show "Keep this seat on your account" for a signed-in person on an unkept seat, and handle the `signed_out` session-ended reason with a sign-in prompt that comes back to the room. Verify the "Signed in from the Dice tab mid-game" and "Sign out on a shared computer" scenarios in the browser.
- [x] 5.6 Move the IndexedDB code in `ui/diceSkinStore.ts` behind `DiceLookBackend` as `localBackend`, with no behaviour change. Verify the existing `diceSkin` tests pass and a signed-out walk-through behaves as before.
- [ ] 5.7 Add `accountBackend`, swapped on account status, with a reload on `visibilitychange`. Then add the "save this browser's dice looks" offer (local copies removed only after their upload succeeds) and the quiet sign-in line on the signed-out Dice tab. Verify:
  - a web unit test with fake backends: two looks saved, one refused and kept;
  - in two profiles, a look made in one appears in the other after focus;
  - signing out stops drawing the look.
- [x] 5.8 Update the home and dashboard copy ("Free account required to host; players join without one."; rooms and library follow the account). Verify the `gm-home` "Both paths in the first screen" and "The home page does not overstate what is saved" scenarios at 1366×768 and 390×844, and that the invite join page shows no account prompt.

## 6. Finish

- [ ] 6.1 Add `signUp()`, `signIn()` and `resume()` to `apps/server/test/helpers.ts`, and move tests that created rooms without an account onto them. Update QA notes and Playwright steps that clicked "Continue as guest". Verify `npm test` passes with no test relying on unauthenticated room creation.
- [ ] 6.2 Update the docs:
  - DESIGN.md §2 (the sessions row), §5 (an accounts and membership subsection, plus the new tables) and §6 (FR-GM-01 marked **B**);
  - INTERFACE.md (`/signin`, `/signup`, Your rooms);
  - ADR 0004 (a pointer to ADR 0017);
  - README Getting Started (sign up to host, and the reset command).

  Verify every link resolves.
- [ ] 6.3 Run `npm run lint && npm run typecheck && npm test`. Verify all three are clean and CI passes on each milestone PR, titled with KAN-7 and FR-GM-01.
- [ ] 6.4 Walk the whole flow on compose Postgres and capture screenshots for the PR:
  - **Host:** sign up → create a room → open it on a second browser as the same GM → change the password → the first browser is signed out of the room.
  - **Player:** join as a guest → make a dice look → sign in from the Dice tab → keep the seat and save the look → sign in on another browser → Playing lists the room → Resume as the same participant, with the same dice.
  - **Legacy:** a browser with an old GM token signs in → Move → rooms listed under Hosting → Open as GM.
