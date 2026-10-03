# Design

## Context

See proposal.md for why. What the code looks like today, as far as it shapes this design:

- **Ownership is already one column.** `rooms`, `library_assets` and `library_creatures` each have `owner_gm_id` → `gm_identities.id`. Every `LibraryStore` method takes an `ownerGmId`. Every GM route gets it from one function, `resolveGm(req)` (`apps/server/src/http/gmAuth.ts`), which hashes the `X-GM-Token` header. ADR 0004 reserved that function as the place where sessions would land.
- **Seats are a separate system.** A seat is a per-browser credential: `credentials.token_hash` maps to a room and a participant. The table is keyed by hash, so one participant can already hold several. It is checked in the Socket.IO handshake (`ws/socket.ts`), which also refuses ended seats (`LiveRoom.endReason`, ADR 0006), and by `Bearer` REST calls. The kernel only ever sees `participants.id`.
- **Stores come in pairs.** `RoomStore extends LibraryStore`, implemented by `MemoryRoomStore` (dev without a database, and every server test) and `PostgresRoomStore`. Redis is optional.
- **One origin.** In dev, Vite on :5173 proxies `/api`, `/uploads` and `/socket.io` to :3001, on the LAN too (`host: true`). Cookies just work.
- **Web.** The GM token is in `localStorage` (`vtt.gm`), seats are in `vtt.credentials.<roomId>`, and the "continue as guest" flag is `vtt.gmGuest`. `AccountPages.tsx` holds placeholder forms. Dice looks (`dice-image-skins`, #65) are kept in IndexedDB by `ui/diceSkinStore.ts`: `{ id, name, updatedAt, images: { d4?..d20?: { href, width, height, layout } } }`, where `href` is a data URL. The room only reads them through `useDiceLooks` and `useActiveDiceLook`.

## Goals / Non-Goals

**Goals:**
- One account per person owns everything they make and every seat they hold, on any device.
- Three layers, each with one job, built on the code that already works: ownership keeps `owner_gm_id`, and seats keep `credentials`.
- **The room kernel does not change.** No account, owner or membership data enters `RoomState`, events or room payloads, so CLAUDE.md invariants 1 to 8 hold by construction.
- Identical behaviour on the memory store and Postgres.

**Non-Goals:**
- Showing a person's dice look to others (the `shared-dice-looks` follow-up, a kernel change).
- Email delivery of any kind; account deletion; OAuth; co-GMs.
- A no-account device handoff code for guests (a later, independent change).
- Multiple server instances. Rate limits and session sweeps assume one app server (DESIGN.md §2).
- Renaming `gm_identities` (the device-identity removal follow-up does it).

## Architecture: three layers over an unchanged kernel

```
                         request
                            │  Cookie: vtt_session
┌───────────────────────────▼──────────────────────────────────────────────┐
│ IDENTITY    users ◀── sessions                    "who is this?"         │
│             identity/  (passwords, sessions, rate limits, origin check)  │
├──────────────────────────────────────────────────────────────────────────┤
│ OWNERSHIP   users.owner_id ─▶ gm_identities ◀─ owner_gm_id ─ rooms,      │
│             library_assets, library_creatures, dice_looks                │
│             ownership/ (resolveOwner, library, dice looks, legacy move)  │
├──────────────────────────────────────────────────────────────────────────┤
│ MEMBERSHIP  room_members(room, participant, user)                        │
│             credentials(token_hash ─▶ participant, session_hash?)        │
│             membership/ (seat on create/join, resume, keep, hub)         │
╞══════════════════════════════════════════════════════════════════════════╡
│ ROOM KERNEL participants · Command → decide → events → reduce            │
│             unchanged; sees only participants.id                         │
└──────────────────────────────────────────────────────────────────────────┘
```

**Rule:** each layer may read the layers above it and the kernel's room ids. The kernel reads nothing above it.
- *Identity* knows no rooms.
- *Ownership* knows owners, not seats.
- *Membership* maps people to participants and hands out credentials. That is the one place a person meets a room.

## Identity

### I1. Sessions: server-minted opaque token, hashed in the main store

- **Token:** 32 bytes from `crypto.randomBytes`, base64url.
- **Cookie:** `vtt_session`, or `__Host-vtt_session` when `Secure`. It is `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, and expires at the absolute expiry.
- **Storage:** `sessions(token_hash PK, user_id → users ON DELETE CASCADE, created_at, last_seen_at, expires_at)`.
- **Validity:** valid while `now < min(last_seen_at + 30d, expires_at)`, where `expires_at = created_at + 90d`.
- **Touching:** `last_seen_at` is written at most hourly.
- **Sweep:** an hourly sweep deletes expired sessions, so their bound seat credentials cascade away (M4).

**Why server-minted** (ADR 0002 has the browser generate its own secrets): an `HttpOnly` cookie exists so page script never holds the value. The server still stores only the hash, so ADR 0002's property, that the server holds no secret it could leak, survives.

**Why the main store, not Redis** (DESIGN.md §2 says Redis): Redis is optional here, and the memory store runs every test. Sessions also have relations that only work next to `users` and `credentials`:
- deleting a user cascades to its sessions;
- "end other sessions" is one `DELETE`;
- deleting a session cascades to the seat credentials bound to it (M4).

**Why not JWT:** it cannot be revoked without a server-side list, which is this table.

**`Secure`** follows `COOKIE_SECURE`, which defaults to on when `NODE_ENV=production`, so LAN phone testing over `http` still works. `TRUST_PROXY` sets Express `trust proxy` for Fly or Railway.

### I2. Passwords: argon2id, PHC strings, rehash on sign-in

- **Library:** `@node-rs/argon2`, prebuilt, with no `node-gyp` step in CI.
- **Parameters:** m = 19 MiB, t = 2, p = 1 (the OWASP minimum).
- **Format:** the full PHC string is stored, so a stale hash is rehashed after a successful sign-in.
- **Timing:** an unknown email still verifies against a fixed dummy hash, to equalise timing.
- **Cost bound:** passwords are capped at 128 characters.
- **Composition:** no rules beyond length (NIST 800-63B).

**Alternatives:**
- *`node:crypto` scrypt:* the fallback if the binary ever causes trouble. The self-describing format makes switching a rehash on sign-in, not a migration.
- *bcrypt:* not memory-hard, and truncates at 72 bytes.
- *`argon2` (node-gyp):* a native build in CI for no gain.

### I3. Cross-site request defence

`SameSite=Lax` already stops browsers attaching the cookie to cross-site `POST`s. `requireSameOrigin` is the second layer, for sibling subdomains on a shared host:
- Unsafe methods carrying the session cookie need an `Origin` whose host equals the request's `Host`, or is in `CLIENT_ORIGIN`. Otherwise the server answers 403.
- With no `Origin`, `Sec-Fetch-Site: cross-site` gives 403.

Comparing against `Host` is what makes LAN testing work: Vite's proxy keeps the browser's `Host`. Account routes return 415 for a non-JSON body, so an HTML form cannot reach them.

### I4. Rate limits

An in-memory fixed-window limiter (`Map<key, { count, resetAt }>`, swept every minute):

| Key | Limit |
|---|---|
| `signin:email:<normalised>` | 10 failures per 15 minutes; cleared on success |
| `signin:ip:<ip>` | 30 per 15 minutes |
| `signup:ip:<ip>` | 10 per hour |

Limits are checked before any hashing, and a refusal carries `Retry-After`. There is no `express-rate-limit`: about 40 lines does it, and the chat limiter in `ws/socket.ts` is precedent. Counters are per process, so they move to Redis beside `redisSeq` when the app scales out.

### I5. Operator password reset

`npm run account:reset-password --workspace=@vtt/server -- <email>` runs against `DATABASE_URL`:
1. Generate a 16-character password.
2. Store its argon2id hash.
3. Delete all of the account's sessions, which also cascades their seat credentials.
4. Print the password once.

There is no HTTP surface. It is the honest substitute for self-service reset until an email provider exists.

## Ownership

### O1. Separate "who you are" from "who owns"

Accounts authenticate, and `gm_identities` rows own. Each user gets exactly one owner row (`users.owner_id`, unique), created in the same transaction as the user. A legacy device token is a second, weaker way to authenticate as an owner row.

`resolveGm` becomes `ownership/resolveOwner(req)`, returning `{ ownerId, via: "account" | "device" }` with the session checked first. Read, edit and delete routes call it unchanged. Creating routes call `requireAccount`, which rejects `via: "device"`.

**Why:** every ownership query, the `asset_refs` usage scoping (ADR 0004) and every library and creature store method already speak "owner id". With this split none of them change, which keeps ADR 0004's "no route changes".

**Alternatives:**
- *`owner_user_id` beside `owner_gm_id` everywhere:* every query gains an OR, doubling the surface for authorization bugs.
- *Re-point every foreign key at `users`:* a bigger migration for no gain.

**Cost:** a misleading table name until the removal follow-up renames it to `owners`.

### O2. Moving a legacy device identity into an account

One transaction:
1. Lock the device owner row (`SELECT … FOR UPDATE`); 404 if it is not found.
2. Repoint `rooms`, `library_assets`, `library_creatures` and `dice_looks` from the device owner to the account's owner.
3. Delete the device row.
4. Return the counts.

Creatures and their art move together, so `image_asset_id` stays inside one owner.

**The person must ask for it.** It is never automatic on sign-in, because on a shared browser that would silently absorb someone else's rooms ("Never silently merge", §13.1).

**It is allowed although `device-identity-bridge` D1 said "no claim":** §13.1's migration clause permits exactly this ("only a verified existing GM credential may claim an owner account"), and the session proves the other side.

**The device row is deleted** so the token cannot remain a permanent bearer key to the account.

Moved rooms have no GM seat on the account yet. Resume falls back to ownership (M2) and creates the seat on first open.

### O3. Dice looks are library items owned by the account

```
dice_looks(id uuid PK, owner_gm_id → gm_identities, name, faces jsonb, created_at, updated_at)
  faces: { "d20": { "objectKey": "…", "url": "/uploads/…", "width": 1536, "height": 1024 }, … }   at most 6 keys
users.active_dice_look_id → dice_looks.id  ON DELETE SET NULL
```

**Why one row with `jsonb` faces:** a look is always read and written whole, has at most six faces, and nothing queries a single face.

**Why the choice lives on `users`:** "the look in use" is one choice per person and must follow them across devices.

**Pictures** use the existing upload path (multer, random object key, MinIO or disk) with dice limits: 5 MB, PNG, JPEG or WebP, and declared dimensions of 3:2 up to 1536 × 1024 or 1:1 up to 512 × 512. The browser already re-encodes every picture (`dice-image-skins`). The server trusts declared dimensions, as the library upload does: while a look is drawn only for its owner, a lie only misdraws the liar's own dice. `shared-dice-looks` tightens this when others start loading the pictures.

Replacing, resetting or deleting a face deletes its old object, and deleting a look deletes all of them.

**Endpoints** (cookie, account only; another account's look is 404):

| Route | Purpose |
|---|---|
| `GET /api/library/dice` | `{ looks, activeId }` |
| `POST /api/library/dice` `{ name }` | New empty look; 409 at 50 |
| `PATCH /api/library/dice/:id` `{ name }` | Rename |
| `DELETE /api/library/dice/:id` | Delete with its pictures; clears the choice if it was in use |
| `PUT /api/library/dice/:id/faces/:die` (multipart) | Set or replace one die's picture |
| `DELETE /api/library/dice/:id/faces/:die` | Reset to classic |
| `PUT /api/library/dice/active` `{ id \| null }` | Choose the look in use |

**Alternative rejected:** `library_assets` with `kind: "dice-face"`. The Maps and Token Art tabs, usage counts and placement would all have to learn to skip them, and a look is not placeable.

## Membership

### M1. `room_members` is the person-to-participant map

```
room_members(room_id → rooms ON DELETE CASCADE, participant_id, user_id → users,
             created_at, PRIMARY KEY (room_id, participant_id), UNIQUE (room_id, user_id))
credentials  + session_hash → sessions(token_hash) ON DELETE CASCADE, nullable
```

**It is access, not game state,** like `credentials` and the invite code (room-access, "Not an event"). So it lives outside the event log and `RoomState`, and no participant ever learns which seats belong to accounts.

**When a row is written:**
- **Room creation:** the creator's GM seat, which is always signed in now.
- **Join while signed in:** the new player seat. This happens inside the same `LiveRoom.join` queue step, so two joins cannot race past the `UNIQUE (room_id, user_id)` check.
- **Keeping a guest seat:** see M3.

**One seat per person per room.** A signed-in join where the account's existing seat is still active returns 409 `already_member`, and the invite page shows "Resume as Kim".
- If the old seat ended by **leaving**, the join is accepted and the row is repointed to the new participant. Leaving is the person's own choice and is final for that seat (ADR 0006).
- If it ended by **revocation**, the join is refused with 403. A GM's removal holds against the person, not just one browser. A guest from a fresh browser is not stopped; that is what resetting the invite link is for (room-access).

### M2. Resume: issue a credential, never change the socket

`POST /api/rooms/:roomId/seat { guestToken }`, authorized by the cookie:

1. Look up `room_members` for `(room, user)`. If there is no row and the account **owns** the room, use the room's GM participant and insert the row. That covers rooms moved in from a legacy device (O2).
2. If there is still no seat, or the room is missing or closed: 404.
3. If `LiveRoom.endReason(participant)` is set: 403 `{ reason }`.
4. `saveCredential(sha256(guestToken), { roomId, participantId, sessionHash })`, then return `{ roomId, participantId, role }`.

No event is appended, and other devices keep their own credentials.

**Alternative rejected: authenticate the socket by session cookie.** It would change `HandshakeAuth` (a shared schema), put an account lookup on the hot handshake path, and make account seats behave unlike guest seats for revocation, ended seats and reconnects. Issuing a credential reuses the whole existing path untouched. This also replaces the GM-only "open on another device" of the earlier draft: GM and player seats resume through one route.

### M3. Keeping a guest seat on the account

`POST /api/rooms/:roomId/seat/keep`, with the cookie plus `Authorization: Bearer <guest credential>`, in one transaction:
- The credential must belong to this room and to an active participant.
- There must be no `room_members` row for that participant, and no other row for `(room, user)`.
- Insert the row, and set this credential's `session_hash` so it now follows M4.

Any failed condition changes nothing and returns 409 with the reason.

**This is §13.1's linking, scoped to the narrowest safe case:** both proofs, the same participant ID, one room, never a sweep of the browser's other seats, and a "GM reassigns tokens" path instead of merging two seats.

The room page shows the offer when the person is signed in, holds a seat for this room, and `GET /api/me/rooms` does not list it.

### M4. A device's seats end with its sign-in

Every credential written while a session is present carries that session's hash:
- creating a room;
- joining;
- resuming;
- keeping a guest seat.

Deleting the session cascades the credential away, whatever ended it: sign-out, the expiry sweep, a password change elsewhere, or an operator reset. The handshake also refuses a credential whose session has expired but has not been swept yet.

**Open connections:** `socket.data.tokenHash` is recorded at the handshake. The identity layer calls `RoomRegistry.closeCredentials(hashes)` after deleting sessions, and each `LiveRoom` sends `session-ended { reason: "signed_out" }` to the matching clients, then closes them.

The web client also drops the stored seats listed in `/api/me/rooms` on sign-out, so a shared computer does not keep stale entries.

**Why bind seats to the session at all:** without it, signing out on a library computer would leave a working seat credential in its `localStorage`. Anyone sitting down next would be "Kim" in every room she opened there.

**Guests are untouched:** their credentials have no session hash.

### M5. Your rooms

`GET /api/me/rooms` returns:
- `hosting`: `listOwnedRooms(ownerId)`, which is already in the store;
- `playing`: the `room_members` rows with role player whose participant is still active, using the denormalised `rooms.name` and the last event time, as the dashboard already does.

The dashboard renders both groups. Open on a room uses the seat stored in this browser if there is one, otherwise M2.

## Cross-cutting

### C1. Server modules

```
apps/server/src/
  identity/
    passwords.ts       hash, verify (with dummy), needsRehash
    sessions.ts        mint, cookie read/write/clear, resolve, touch, sweep
    rateLimit.ts       fixed-window limiter
    middleware.ts      attachAccount, requireAccount, requireSameOrigin
    routes.ts          /api/auth/*
  ownership/
    resolveOwner.ts    (was http/gmAuth.ts)
    legacy.ts          /api/gm/legacy, /api/gm/legacy/claim
    diceLooks.ts       /api/library/dice/*
  membership/
    routes.ts          /api/me/rooms, /api/rooms/:id/seat, /api/rooms/:id/seat/keep
    seats.ts           issue, keep, end-with-session (closeCredentials)
  http/                existing routes; rooms, joins, library and creatures call into the layers
  store/
    identityStore.ts   users, sessions
    libraryStore.ts    + dice looks, + claimDeviceOwner
    membershipStore.ts room_members, credential session binding
    roomStore.ts       RoomStore extends IdentityStore, LibraryStore, MembershipStore
  scripts/resetPassword.ts
```

The middleware order in `app.ts` is: `express.json` → `attachAccount` → `requireSameOrigin` → routes.
- `attachAccount` parses the `Cookie` header itself (Express 5 has no parser; one cookie does not justify a dependency).
- It puts `{ account, sessionHash }` or `null` on `res.locals`, and clears dead cookies.

### C2. HTTP API

| Route | Auth | Success | Failures |
|---|---|---|---|
| `POST /api/auth/signup` `{ email, password, displayName }` | none | 201 `{ account }` + cookie | 400, 409 taken, 415, 429 |
| `POST /api/auth/signin` `{ email, password }` | none | 200 `{ account }` + cookie | 401 generic, 415, 429 |
| `POST /api/auth/signout` | cookie? | 204, cookie cleared | none |
| `GET /api/auth/me` | cookie? | 200 `{ account \| null }` | none |
| `POST /api/auth/password` `{ currentPassword, newPassword }` | cookie | 204 | 400, 401, 403 |
| `GET /api/me/rooms` | cookie | 200 `{ hosting, playing }` | 401 |
| `POST /api/rooms` | cookie (**now required**) | unchanged; GM seat kept on the account | 401 |
| `POST /api/invites/:code/join` | cookie? | unchanged; seat kept when signed in | 409 `already_member`, 403 removed |
| `POST /api/rooms/:id/seat` `{ guestToken }` | cookie | 200 `{ roomId, participantId, role }` | 401, 403 `{ reason }`, 404 |
| `POST /api/rooms/:id/seat/keep` | cookie + `Bearer` | 204 | 401, 409 `{ reason }` |
| `GET /api/gm/legacy` | `X-GM-Token` | 200 counts | 401 |
| `POST /api/gm/legacy/claim` | cookie + `X-GM-Token` | 200 counts | 401, 404 |
| `/api/library/dice/*` | cookie | see O3 | 401, 404, 409 |
| `POST /api/gm/identify` | none | **410 Gone** | none |

- `account` is `{ id, email, displayName }`.
- `me` answers 200 with `null` for a signed-out visitor, so a 401 on any other request unambiguously means "your session ended".

### C3. Web modules

```
apps/web/src/
  account/
    accountStore.ts    Zustand vanilla { status, account }; load, signIn, signUp, signOut, changePassword, expire
    RequireAccount.tsx  guard for gmDashboard and library: loading shows nothing; signed out → /signin?next=… (replace)
    safeNext.ts        same-site path or "/gm-dashboard"
    AccountPages.tsx   sign-in and sign-up (moved from pages/)
    AccountMenu.tsx    name, email, Change password, Sign out
  net/api.ts           api.auth, api.me.rooms, api.rooms.seat / keep, api.legacy, api.diceLooks;
                       no X-GM-Token except api.legacy; a 401 calls account.expire()
  net/identity.ts      seats stay; GM token reduced to loadGmToken / forgetGmToken; guest choice removed
  net/seats.ts         ensureSeat(roomId): stored seat, or resume; forgetAccountSeats() on sign-out
  ui/diceSkinStore.ts  DiceLookBackend: localBackend (today's IndexedDB) | accountBackend (O3)
  pages/GmDashboardPage.tsx  Your rooms (Hosting, Playing) + legacy-move banner
  pages/JoinPage.tsx         "Resume as <name>" when the account already has the seat
  pages/RoomPage.tsx         "Keep this seat on your account"; session-ended → sign in to continue
```

- `accountStore.load()` runs once at startup.
- No account data is written to `localStorage`.
- `fetch` already sends same-origin cookies.
- The dice store swaps backends when the account status changes. Its hooks keep their shape, so `Die3D`, `ThrownDice` and `DiceLookPicker` do not change. It reloads account looks on `visibilitychange`, so a change made on another device shows up when the tab is next in front.

### C4. Shared contract

- **`packages/shared/src/auth.ts`:**
  - `Email`: trimmed, lowercased, at most 254 characters, one `@`;
  - `Password`: 8 to 128 characters;
  - `DisplayName`: trimmed, 1 to 40 characters;
  - `SignUpRequest`, whose refinement requires the password to differ from the email;
  - `SignInRequest`, `ChangePasswordRequest`, `AccountView`, `MeResponse`, `LegacySummary`.
- **`membership.ts`:** `SeatRequest { guestToken }`, `SeatResponse`, `MyRoomsResponse`, and the `already_member` and seat-ended reason codes.
- **`diceLooks.ts`:** `DieName`, `DiceLookName`, `DiceLookView`, `DiceLookFaceFields` (the 3:2 and 1:1 bounds) and `ActiveDiceLookRequest`.
- **The only edit to an existing schema:** `CreateRoomRequest.gmToken` is removed. zod strips unknown keys, so an old client still parses.
- `Command`, `DomainEvent`, `RoomState`, `HandshakeAuth` and `visibility.ts` are unchanged.

ADR 0017 records this for Raymond's review.

## Where this design departs from the docs

| Source says | This design | Why |
|---|---|---|
| DESIGN.md §2: sessions in Redis | Main store (memory or Postgres) | Redis is optional; sessions cascade to seats and belong next to `users` (I1, M4) |
| §13.1: non-null `rooms.owner_user_id` | Ownership via `users.owner_id` → `gm_identities`; new rooms always get an account owner in code; the database-level NOT NULL waits for device removal | Pre-ADR-0004 rooms already have a null owner; device-owned rooms must survive until the claim (O1) |
| ADR 0002: browser-generated secrets | Session token minted by the server (seat credentials stay browser-generated) | `HttpOnly` must never pass through page script (I1) |
| `device-identity-bridge` D1: never claim | Explicit claim with both proofs | §13.1 allows it; deleting the device row removes the backdoor risk (O2) |
| §13.1: guest-to-account linking is "a later enhancement", offered after Leave table | Offered in the room right after signing in, for that one seat | Otherwise the "sign in from the Dice tab" flow leaves the seat behind; every safety rule §13.1 lists is kept (M3) |
| INTERFACE.md: `/login`, `/signup`, a `/rooms` hub | `/signin` (already shipped), `/signup`; Your rooms lives on `/gm-dashboard` | Keeps shipped URLs; renaming the route is a cosmetic follow-up |
| `dice-image-skins`: looks never reach the server | Signed-in looks live on the account; signed-out looks stay local | A person's dice follow them (O3) |
| §13.1: idempotent room creation | Deferred | Creation is a user-submitted form with no automatic retry today |

## Relationship to other changes

- **`dice-image-skins`:** merged (#65) but not archived; its tasks 5.3 and 5.4 are browser checks. It creates `dice-looks` and adds the signed-out Dice tab exception to `gm-dashboard`. This change modifies both and keeps that exception. Archive it first: `openspec validate --strict` already flags the order.
- **`device-identity-bridge`:**
  - **Keep:** its 30-day sweep of empty device identities and its doc fixes.
  - **Superseded here:** its `gm-home` MODIFIED and ADDED requirements, its `asset-library` "Assets whose owner can no longer be proven", and task 2.4.
  - **Order:** trim it with `/opsx:update` and archive it second.
- **`shared-dice-looks`:** builds on this change. It needs O3, so looks are on the server, and M1, so the server knows which account a participant is.

## Risks / Trade-offs

- **[No self-service reset]** → The operator script (I5). Email reset is the first follow-up once a provider is chosen.
- **[Unverified emails can be squatted]** → An unverified account only hosts its own rooms; verification comes with email; the operator can reset or remove an account.
- **[Sign-up's 409 reveals that an account exists]** → Accepted without email. Sign-up is rate-limited, and sign-in stays non-enumerating.
- **[Signing out or session expiry kicks that device out of its rooms]** → Intended (M4). The session-ended screen offers sign-in, and Resume brings the person straight back.
- **[A password change disconnects the person's other devices from their rooms]** → Intended: it is the response to a suspected compromise.
- **[A removed player is blocked by account, not by browser]** → Stronger than today for signed-in players. Guests still need the invite reset, as today.
- **[The memory store forgets accounts on restart]** → Same as rooms today. Use the compose Postgres; tests use `TestClient.signUp()`.
- **[Rate limits and the sweep are per process]** → Fine at one instance (I4).
- **[Dice pictures cost storage]** → Capped at 50 looks per account; each picture is tens of KB after the browser re-encode.
- **[Existing QA and Playwright steps click "Continue as guest"]** → Updated in the same PR (tasks, group 9).

## Migration Plan

1. **Migration `0006_accounts`:** create `users`, `sessions`, `room_members` and `dice_looks`; add `users.active_dice_look_id` and `credentials.session_hash`; make `gm_identities.token_hash` nullable. It is additive and safe ahead of code.
2. **Server and web in one PR set**, in milestone order (tasks.md): identity, then ownership, then membership, then web.
3. **Existing seats:** existing guest and GM credentials have no `session_hash` and keep working. Existing GM rooms reach the account through the legacy move, and their GM seat joins the account on first Resume (M2).
4. **Rollback:** revert the code; the migration can stay, because the old code ignores the new tables and column. Rows owned by accounts by then are reachable again only after rolling forward.
5. **Follow-up `remove-gm-device-identity`**, announced first (§13.1):
   - drop the device path;
   - rename `gm_identities` to `owners`;
   - make room ownership NOT NULL.

## Open Questions

- **Starting values:** 30 days idle, 90 days absolute, the rate limits and the 50-look cap. Tuning them changes no structure.
- **"Sign out everywhere" in the account menu:** one `DELETE` on this design, and it can be added any time.
