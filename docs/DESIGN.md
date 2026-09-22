# Design Document — Virtual Tabletop

**Milestone:** M2 — Design and setup
**Course:** CSE 416
**Team:** Antonio Cottone, Raymond Lin, Vincent Chen, Christos Psimadas
**Companion document:** [`../README.md`](../README.md) — the product specification this design implements. Requirement IDs used throughout (`FR-GM-*`, `FR-PL-*`, `FR-TAC-*`, `FR-SYNC-*`, `FR-REC-*`) are defined there in §5.

---

## 1. What This Document Covers

| M2 deliverable | Where it lives |
| --- | --- |
| Architecture — boxes and arrows (clients, APIs, data, jobs) | §2 |
| Stack — what we picked and why | §3 |
| A repo someone else can clone, with a CI skeleton | §9, and [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| A minimal prototype that runs | §7, and [`../src`](../src) |
| Design doc connected to the requirements | §10 traceability matrix |
| How we deliver all three feature milestones | §8 |

---

## 2. Architecture

### 2.1 System overview

```
        ┌──────────────────────────┐        ┌──────────────────────────┐
        │   GM Browser (React)     │        │ Player Browser (React)   │
        │  - Pixi board renderer   │        │  - Pixi board renderer   │
        │  - GM-only controls      │        │  - player-safe controls  │
        │  - fog / walls / log     │        │  - owned tokens only     │
        └───────────┬──────────────┘        └───────────┬──────────────┘
                    │                                    │
                    │  REST (auth, upload, room CRUD)    │
                    │  WS "committed" channel (reliable) │
                    │  WS "ephemeral" channel (volatile) │
                    └────────────────┬───────────────────┘
                                     │
                         ┌───────────▼────────────┐
                         │   App Server (Node)     │
                         │  - REST API             │
                         │  - Socket.IO gateway    │
                         │  - room kernel (pure)   │
                         │  - authorization        │
                         │  - visibility filtering │
                         │  - event log writer     │
                         └──┬─────────┬─────────┬──┘
                            │         │         │
              ┌─────────────▼──┐  ┌───▼──────┐  └────────────┐
              │   Postgres      │  │  Redis   │               │
              │  - users        │  │ - seq    │      ┌────────▼─────────┐
              │  - participants │  │ - pub/sub│      │  Object Storage  │
              │  - rooms/scenes │  │ - guest  │      │  (MinIO / S3)    │
              │  - tokens       │  │   sessions│     │  - map images    │
              │  - event log    │  │ - job q  │      │  - token art     │
              │    (append-only)│  └───┬──────┘      └────────▲─────────┘
              │  - checkpoints  │      │                      │
              └─────────────────┘      │                      │
                                       │                      │
                         ┌─────────────▼──────────┐           │
                         │  Job Workers (BullMQ)  │───────────┘
                         │  - grid detection      │
                         │  - wall extraction     │
                         │  - checkpoint snapshot │
                         │  - asset GC            │
                         │  - invite expiry       │
                         └─────────────┬──────────┘
                                       │ HTTP
                         ┌─────────────▼──────────┐
                         │  Map Analysis Service  │
                         │  (Python / FastAPI)    │
                         │  - OpenCV grid detect  │
                         │  - wall extraction     │
                         │  - door/window class.  │
                         └────────────────────────┘
```

### 2.2 The two realtime channels

The single most important structural decision: **committed state and ephemeral interaction do not share a path.**

| | Committed channel | Ephemeral channel |
| --- | --- | --- |
| Carries | Token moves, fog changes, conditions, initiative, portal states | Pointer positions, drag previews, ping pulses, ruler lines, AoE aiming |
| Delivery | Reliable, ordered, acknowledged | Best-effort (`socket.volatile.emit`), dropped under backpressure |
| Persistence | Appended to the event log | Never written to the database |
| Ordering | Monotonic per-room `seq` (FR-SYNC-04) | Unordered; last value wins |
| Requirement | FR-SYNC-02 | FR-SYNC-03 |

Mixing them is what makes VTTs feel laggy: 60 Hz pointer traffic starves the queue that token moves travel on. Separating them also means preview traffic can be dropped freely without ever risking encounter state.

### 2.3 Request paths

**Map preparation (FR-GM-02, FR-GM-03, FR-GM-11)**

```
GM uploads image ──REST──> App Server ──> Object Storage (original)
                                │
                                └──> BullMQ job ──> Map Analysis Service
                                                          │
                                     grid estimate + walls/portals
                                                          │
                                     App Server <─────────┘
                                                │
                                     GM reviews/corrects ──> Postgres
```

Detection is a job, not a request: a 4000×3000 map takes seconds to analyze, and the GM must review results before they affect play (FR-GM-04, and the map-parsing risk in README §11).

**Committed action (FR-SYNC-01, FR-SYNC-04)**

```
Client intent ──WS──> App Server
                        ├─ authorize (role + ownership)   → reject to sender only
                        ├─ validate against current state
                        ├─ Redis INCR room:{id}:seq
                        ├─ append event row (Postgres)
                        └─ broadcast event to room, filtered per participant
```

**Reconnect (FR-PL-05, FR-PL-06)** — detailed in §5.4.

**Undo (FR-REC-01, FR-REC-02, FR-REC-03)**

```
GM picks an action from the log ──> server derives a compensating event
                                ──> appends it (never deletes the original)
                                ──> broadcasts resulting state
```

The log is append-only, so undo is itself an auditable event and the history stays truthful.

---

## 3. Stack

| Layer | Choice | Why (one sentence) |
| --- | --- | --- |
| Board renderer | **PixiJS v8** | WebGL sprites and render-texture masks are what make 100 tokens plus fog and line-of-sight hold 60 FPS, which canvas2d will not (README §6). |
| App shell | **React + TypeScript** | The non-canvas UI is where the WCAG 2.2 AA target lives, and coding agents are extremely strong at React, so UI work parallelizes well across four people. |
| Build tool | **Vite** | Instant HMR during canvas work and a production build that needs no configuration. |
| Client state | **Zustand** | Client state is mostly "apply the server's events", which needs a store, not a framework. |
| Realtime transport | **Socket.IO** | Rooms map one-to-one onto VTT rooms, reconnection and acks are built in (FR-PL-05), and `volatile.emit` provides the drop-under-backpressure path the ephemeral channel requires (FR-SYNC-03). |
| API server | **Node + TypeScript + Express** | Sharing protocol types and the pure room kernel between client and server eliminates a whole class of desync bug, and agents are most reliable in this stack. |
| Database | **PostgreSQL + Prisma** | The recovery model is an append-only event table plus checkpoint snapshots — inherently relational — and Prisma's migrations keep four people from fighting over schema drift. |
| Cache / bus | **Redis** | Atomic `INCR` gives the per-room sequence number (FR-SYNC-04), pub/sub fans events across server instances, and guest sessions rebind through it (FR-PL-02). |
| Object storage | **MinIO (local) → S3/R2 (deploy)** | Map images do not belong in Postgres, and MinIO speaks the S3 API so local dev and demo day need no cloud account. |
| Job queue | **BullMQ** | Grid detection, wall extraction, checkpoint snapshots and asset GC are all async work, and BullMQ rides the Redis instance the system already requires. |
| Map analysis | **Python + FastAPI + OpenCV** | Grid detection and wall extraction are solved problems in the Python CV ecosystem, we can adapt an MIT-licensed implementation rather than write the pipeline from scratch (§12), and isolating it matches the microservice boundary FR-GM-11 specifies. |
| Password hashing | **argon2id** | Memory-hard and the current OWASP recommendation for the low-entropy secrets humans choose. |
| GM auth | **Opaque session token + httpOnly cookie** | Redis is already in the stack, so server-side sessions are simpler than JWT and revoke instantly (FR-GM-20) with no refresh-token choreography. |
| Guest identity | **Opaque token in `localStorage`** | Implements FR-PL-02 literally — durable identity with no account — and revocation is a matter of deleting one row. |
| Unit tests | **Vitest** | Shares Vite's transform pipeline, so the same TypeScript runs in tests and in the app. |
| E2E tests | **Playwright** | It can drive two browser contexts inside one test, which is the only practical way to assert the cross-client convergence and undo semantics in README §8. |
| CI | **GitHub Actions** | Free for the repo, and the lint/test/build matrix is three lines of YAML. |
| Local environment | **Docker Compose** | A new teammate gets Postgres, Redis, MinIO and the analysis service with one command. |
| Hosting | **Fly.io or Railway** | Both hold persistent WebSocket connections; serverless platforms cannot. |

### Choices we deliberately did not make

- **Konva instead of PixiJS** — friendlier API and better agent familiarity, but dynamic line of sight (FR-GM-19) needs cheap masking. If LoS is cut to stretch-only, Konva becomes the better call.
- **JWT for GM sessions** — stateless verification buys nothing here: there is one app server, and the analysis service does not authenticate users. Opaque tokens in Redis give instant revocation instead.
- **Fastify instead of Express** — built-in payload schema validation would directly serve FR-GM-15 and the forged-payload tests in README §8. Worth revisiting before the socket surface grows.
- **A CRDT (Yjs/Automerge)** — rejected: CRDTs converge without a referee, but this system *needs* a referee. A player must not be able to move another player's token, and merge-anything semantics contradict authorization and hidden information.

---

## 4. Data Model and User Storage

### 4.1 Schema

```sql
-- Registered accounts. GMs only; players never create one.
users
  id                 uuid primary key
  email              citext unique not null
  password_hash      text not null            -- argon2id
  display_name       text not null
  created_at         timestamptz not null default now()

-- Server-side GM sessions. Opaque token, stored hashed.
auth_sessions
  id                 uuid primary key
  user_id            uuid not null references users(id) on delete cascade
  token_hash         text not null unique     -- sha256 of the cookie value
  expires_at         timestamptz not null
  revoked_at         timestamptz

rooms
  id                 uuid primary key
  owner_user_id      uuid not null references users(id)
  name               text not null
  invite_code        text unique not null
  invite_expires_at  timestamptz

-- The identity the game logic actually uses.
participants
  id                 uuid primary key
  room_id            uuid not null references rooms(id) on delete cascade
  user_id            uuid references users(id)        -- set for the GM
  guest_token_hash   text                              -- set for guests
  display_name       text not null
  role               participant_role not null         -- 'gm' | 'player'
  last_seen_at       timestamptz
  revoked_at         timestamptz
  check (user_id is not null or guest_token_hash is not null)
  unique (room_id, user_id)              where user_id is not null
  unique (room_id, guest_token_hash)     where guest_token_hash is not null

scenes
  id                 uuid primary key
  room_id            uuid not null references rooms(id) on delete cascade
  map_object_key     text                              -- object storage key
  grid_cell_px       numeric
  grid_offset_x      numeric
  grid_offset_y      numeric
  grid_confidence    numeric                           -- from detection (FR-GM-04)
  wall_geometry      jsonb                             -- segments + portal states

tokens
  id                 uuid primary key
  scene_id           uuid not null references scenes(id) on delete cascade
  owner_participant_id uuid references participants(id) -- NOT users.id
  name               text not null
  x                  numeric not null                  -- board coords (FR-GM-05)
  y                  numeric not null
  hidden             boolean not null default false
  stats              jsonb

events                                                  -- append-only (FR-REC-03)
  id                 bigserial primary key
  room_id            uuid not null references rooms(id) on delete cascade
  seq                bigint not null                   -- monotonic per room
  actor_participant_id uuid references participants(id)
  type               text not null
  payload            jsonb not null
  created_at         timestamptz not null default now()
  unique (room_id, seq)

checkpoints
  id                 uuid primary key
  room_id            uuid not null references rooms(id) on delete cascade
  name               text not null
  at_seq             bigint not null
  snapshot           jsonb not null
```

### 4.2 Why `participants` is the identity the game uses

Game logic references `participants.id`, **never `users.id`**. A participant row is either *"a registered user in this room"* (`user_id` set) or *"a guest token in this room"* (`guest_token_hash` set) — and the room kernel cannot tell the difference.

That gives one code path for authorization, ownership and visibility filtering, instead of two parallel ones with subtly different bugs. The prototype's `Participant` type already has exactly this shape, which is why the schema drops in without reworking the kernel.

It also means `users` stays small and boring: it exists only so a GM can log back in next week and find their rooms. A player who never registers still has full, durable identity — it just lives in `participants`.

### 4.3 What is stored where

| Data | Store | Why |
| --- | --- | --- |
| Accounts, rooms, participants, scenes, tokens, events, checkpoints | Postgres | Durable, relational, and the event log needs transactional appends |
| `room:{id}:seq` counter | Redis | `INCR` is atomic, which is the entire ordering guarantee (FR-SYNC-04) |
| `guest:{hash} → participant_id` | Redis (TTL cache) | Keeps reconnects off the database and inside the 3-second budget |
| Live room state | Redis | Read on every event; rehydrated from Postgres on a cold start |
| Map images, token art | Object storage | Large binaries do not belong in a database |
| The guest token itself | **The browser only** | The server stores nothing but its hash |

---

## 5. Accounts and Guest Access

The defining constraint of this product: **only the GM needs an account, but every player needs identity that survives a reload** (FR-GM-01, FR-PL-01, FR-PL-02). "Anonymous" and "forgettable" are not the same thing.

### 5.1 Two kinds of identity

| | GM account | Guest access |
| --- | --- | --- |
| Row in `users` | Yes | **No** |
| Row in `participants` | Yes, per room | Yes, per room |
| Credential | Email + password (argon2id) | Opaque 32-byte token |
| Credential lives in | Server (`auth_sessions`), cookie in browser | Browser `localStorage` only |
| Survives a reload | Yes | Yes |
| Survives a different device | Yes — log in again | **No** — see §5.5 |
| Can create rooms | Yes | No |
| Can be revoked | Session revoked, account retained | `participants.revoked_at` (FR-GM-20) |
| Personal data held | Email address | Display name only |

The asymmetry is deliberate: an account exists so a GM can come back next week and find the rooms they own. Players need none of that — they need to be *the same person as five minutes ago*, which is a much smaller problem.

### 5.2 GM accounts

**Registration** (FR-GM-01)

1. Email (stored `citext`, unique) + password + display name.
2. Password hashed with **argon2id** at the current OWASP parameters — `m = 19 MiB, t = 2, p = 1` — tuned upward if the login endpoint stays comfortably fast.
3. Minimum length enforced (12 characters); no composition rules, which push users toward predictable patterns.
4. Email verification is **deferred**: it costs a mail provider and buys little for a course project where GMs are known people. The column exists so it can be switched on without a migration.

**Login and sessions**

1. Look up by email, verify with argon2id. Failures return one generic error — never "no such user" — so the endpoint cannot be used to enumerate accounts.
2. Rate-limited per IP and per email; repeated failures back off.
3. On success, mint **32 random bytes**, insert an `auth_sessions` row holding only its **SHA-256 hash**, and return it as a cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`.
   - `HttpOnly` keeps it out of reach of any XSS that gets through.
   - `SameSite=Lax` still permits arriving from an invite link, which is a top-level same-site navigation.
4. A fresh token is issued on every login, so a fixated session cannot be reused.
5. Expiry is 30 days, refreshed on use. Logout sets `revoked_at`; the next request finds it and fails closed.

**Why opaque tokens and not JWT.** Revocation. A JWT is valid until it expires, so "remove this GM's access right now" requires a denylist — which is a session table wearing a disguise. Redis is already in the stack; a lookup per request costs microseconds and gives instant revocation, which FR-GM-20 needs anyway.

**Password reset** is out of Core Loop scope. Until it exists, a forgotten password means a new account; documented here so it is a decision rather than an oversight.

### 5.3 Guest access

No registration, ever. A player's entire onboarding is: open link → type a display name → play (FR-PL-01, and the 30-second join target in README §6).

1. Opening an invite link, the browser generates **32 bytes** from `crypto.getRandomValues` and stores the base64url result in `localStorage` under `vtt.guestToken`.
2. The player picks a display name. No uniqueness constraint — two Miras are the GM's problem, not the database's.
3. The server validates the invite code, creates a `participants` row carrying `guest_token_hash` and `role = 'player'`, and returns the participant.
4. Every subsequent connection — first or fiftieth — presents that token in the Socket.IO handshake.
5. The server hashes it and looks up `(room_id, guest_token_hash)`. Known → that participant, role and owned tokens intact. Unknown → a new participant.

**Token scope: one per browser, not one per room.** The same token is presented to every room, and `participants` is keyed by `(room_id, guest_token_hash)` — so one browser can hold seats in several rooms simultaneously without juggling storage keys, and each seat is independently revocable.

**Hashing choice.** Passwords get argon2id because humans pick low-entropy secrets that must be expensive to guess. Guest tokens get plain **SHA-256** because 256 bits of CSPRNG output cannot be brute-forced, and argon2 would add latency to every reconnect for zero security benefit. Both are hashed — the server never persists a credential it could leak.

**Why `localStorage` and not a cookie.** It is what FR-PL-02 specifies, it survives a backgrounded tab, and it is not attached to every asset request. The tradeoff is real and worth stating: unlike the GM's `HttpOnly` cookie, a guest token **is** readable by JavaScript, so an XSS bug would expose it. Mitigations are a strict CSP, never rendering user-supplied content as HTML, and the limited blast radius — the token grants one seat in one game, and the GM can revoke it.

**What a guest cannot do:** create or own rooms, see GM-only state (enforced server-side, §6), move tokens they do not own, or promote themselves — `role` is server-side data, never accepted from the client.

### 5.4 Reconnect flow

```
Player's laptop sleeps, socket drops
        │
        ▼
Socket.IO reconnects automatically (FR-PL-05)
        │
        ├─ handshake carries the same localStorage token
        │
        ▼
Server: sha256(token) → Redis guest:{hash} → participant_id
        │                      └─ miss? fall back to Postgres, re-cache
        ▼
Participant resolved: same id, same role, same owned tokens
        │
        ▼
Server sends state:snapshot — the full current board (FR-PL-06)
        │
        ▼
Client discards local state entirely and renders the snapshot
```

Two deliberate choices here:

- **Role lives on the participant record, not the connection.** The first prototype derived role from connection order, so a GM who reloaded came back demoted to player once others had joined. Role is data about a person, not about a socket.
- **Reconnect re-sends a full snapshot rather than replaying missed deltas.** Replaying a delta stream correctly across an unknown-length disconnect is materially harder and is the documented source of the "stale or conflicting state" risk in README §11. A snapshot is a few kilobytes; correctness is worth the bytes.

This is implemented in the prototype — see [`src/shared/identity.ts`](../src/shared/identity.ts) and its tests.

### 5.5 Edge cases we have to answer

| Case | Behaviour |
| --- | --- |
| Player clears site data or joins from their phone | New token, therefore a new participant. The GM reassigns their token, or the invite link carries a claim code they re-enter. **Decision pending — see §12.** |
| Two people open the same invite link | Two distinct tokens, two participants. Correct: an invite identifies a *room*, not a person. |
| Player shares their token | They have shared their identity. Mitigated by GM revocation (FR-GM-20), not prevented — acceptable for a social game among friends. |
| GM revokes a participant | `revoked_at` is set; the next handshake with that hash is refused and the socket closed. |
| Invite code regenerated | Existing participants keep playing; only *new* joins need the new code. |
| Private browsing / storage blocked | Identity lasts for the tab only. The client falls back to an in-memory token and the player is warned that a reload will lose their seat. |
| A guest later wants an account | `participants` rows point at `guest_token_hash`; claiming an account sets `user_id` on those rows and clears the hash, so history and owned tokens carry over. Not in the Core Loop, but the schema does not preclude it. |
| The GM loses their account | No password reset in the Core Loop (§5.2). Rooms are owned by `users.id`, so this orphans them — reason enough to add reset before any real use. |

### 5.6 Where this is enforced

Identity is resolved **once per connection**, at the handshake, and cached on the socket. Authorization is re-checked **per message** against that participant's current role, because a GM can revoke someone mid-session and a socket that was legitimate a minute ago must not stay legitimate (§6, FR-GM-15).

---

### 5.7 Accounts for returning users — proposed

**Status: proposed, not decided.** This revises §5.1 and §5.2, which are the Real-Time
Architecture owner's. It is written up because §5.5 and §12 both already flag the hole and
defer it, and the deferral has now been overtaken: §12 says "pick before FR-PL-02 ships",
and FR-PL-02 has shipped.

**The gap.** Guest identity is one browser. A player who opens the invite on their phone,
clears site data, or joins from a library machine is a *new person* to the system — new
participant, no owned tokens, no history. The same is true of the GM today, and worse:
until FR-GM-01 exists there are no accounts at all, so a GM who switches device loses the
room outright, because ownership is a credential hash in one browser and nothing else.

§5.1 says the GM "survives a different device — log in again". That is a description of
FR-GM-01, not of anything that currently runs.

**Proposal: one account type, and role stays per room.**

An account is not "a GM account". It is a person who has decided to keep using the
platform. What they do in any given room is `participants.role`, which is per-room data —
so the same account is GM in their own campaign and a player in a friend's. The schema
already works this way (§4.2); it has simply never been said out loud, and §5.1's
"Can create rooms: yes / no" row reads as though it were an account-level property. It
is not.

**Three ways in, and the fast one does not change.**

| Path | Friction | Who |
| --- | --- | --- |
| Invite link, no account | Open link, type a name, play | First-time players. Unchanged — FR-PL-01 and the 30-second target are not negotiable |
| Claim an account afterwards | Offered *after* a session, never before | A guest who liked it. Sets `user_id` on their existing `participants` rows and clears `guest_token_hash`, so tokens and history carry over (§5.5) |
| Sign in, then open a room | Email and password | Returning users, any device |

The ordering matters. A signup wall in front of a first-time player would trade the one
thing this product is differentiated on (README §3: Roll20's onboarding overhead) for a
convenience only repeat users need. **The invite path must never prompt for an account
before play** — only after.

**What an account buys**, and therefore what pages it implies (§11.2):

- **Cross-device identity.** The same person, same owned tokens, on a phone and a laptop
- **A room list.** `/rooms` — the reason §4.2 gives for `users` existing at all: "so a GM
  can come back next week and find the rooms they own". Today that sentence has no page
- **A second way to join.** A returning player opens `/rooms` and clicks the room, instead
  of hunting for a link in a chat log from three weeks ago. This is the point of the
  feature: invite links are for *strangers*, not for the fourth session of a campaign
- **Saved assets.** Maps, token art and encounter setups that outlive one room. Uploads are
  currently one-off objects keyed by UUID and referenced by a single scene; nothing lets a
  GM reuse last week's dungeon. FR-GM-13 covers templates and is M3 stretch, so the asset
  half needs its own requirement

**Schema delta.** `users` and `auth_sessions` as already specified in §4.1, plus:

- `participants.user_id` — nullable, already in the §4.1 sketch. Set on claim
- `rooms.owner_user_id` — nullable until FR-GM-01 lands, so existing rooms are not orphaned
- An `assets` table keyed by `user_id`, if saved assets are accepted

**What this does not cost.** Nothing in `packages/shared` changes. `decide`, `reduce` and
the visibility filters address participants and cannot tell a registered user from a guest
(§4.2) — which is exactly the property that makes this affordable. The work is a REST
surface, a session cookie, and pages.

**Open questions for the owner.**

1. Does claiming an account merge *all* of that browser's participants across every room,
   or only the room the claim was offered in? Merging all is friendlier and leaks which
   other rooms that browser has seats in.
2. Can a room be owned by more than one account — a co-GM? `rooms.owner_user_id` as
   specified says no.
3. Are saved assets per user or per room? Per user is what people expect and raises a
   quota question the project has so far avoided.

---

## 6. Security and Visibility

- Authorization is enforced **server-side on every message**, not at connection time — role is data, and a socket that was a player's at handshake must not be trusted to still be one (FR-GM-15).
- Hidden tokens, unrevealed fog, and GM-only rolls are filtered **before serialization**, so player payloads never contain data the player may not see (FR-GM-23). Filtering at render time would leak through devtools.
- Guest tokens and session cookies are stored hashed; revoking a participant or regenerating an invite invalidates them (FR-GM-20).
- Uploads are validated by content type and size before they reach object storage, and served from a separate origin so a malicious SVG cannot script against the app.

---

## 7. The Prototype (Heartbeat)

Deliberately not the product. It exists to prove the riskiest paths in the system — server-authoritative sync and durable guest identity — before any of it is built for real.

**What it demonstrates**

| Behavior | Requirement |
| --- | --- |
| Server owns state; clients send intents and render what comes back | FR-SYNC-01 |
| Every accepted action increments one monotonic per-room `seq` | FR-SYNC-04 |
| Players may move only tokens they own; the GM may move any | FR-PL-04, FR-GM-15 |
| Hidden tokens are stripped from player payloads server-side | FR-GM-16, FR-GM-23 |
| Identity persists across reload via a hashed `localStorage` token | FR-PL-02 |
| Reconnecting rebinds the same participant, role intact | FR-PL-05 |
| New and reconnecting clients receive a full authoritative snapshot | FR-PL-06 |
| Rejected moves roll back the optimistic client render | FR-SYNC-01 |

**What it deliberately omits:** Postgres, Redis, object storage, the analysis service, job workers, the Pixi renderer, pan/zoom, maps, fog, walls, undo. Each has a designed home above; none is needed to prove the paths that matter.

**Layout**

```
src/
  shared/protocol.ts       wire types shared by both sides
  shared/room.ts           pure authoritative kernel — the only place state changes
  shared/room.test.ts      10 unit tests over that kernel
  shared/identity.ts       guest-token → participant resolution
  shared/identity.test.ts  7 unit tests, including the GM-reload case
  server/index.ts          Express /health + Socket.IO gateway
  client/useRoom.ts        token persistence, socket lifecycle, optimistic apply, rollback
  client/Board.tsx         plain-DOM board (Pixi comes later, on purpose)
```

Both kernels are pure and I/O-free, so the rules that matter — ownership, bounds, sequencing, identity resolution — are unit-tested without a network or a browser. That property is the reason to write them this way now rather than later.

**Run it**

```bash
npm install
npm run dev          # server :3001, client :5173
```

Open two tabs: the first is the GM, the rest are players. Drag a token in one and it moves in the other. Reload the GM tab — it comes back as the GM. Drag a token you do not own and the move is rejected and rolled back.

---

## 8. Delivery Plan

### 8.1 A note on names

"M1/M2/M3" is overloaded: the course has its own milestones, and README §12 has feature milestones. To avoid collision, this section refers to the feature milestones by name — **Core Loop**, **Tactical Play**, **Stretch** — never by number. This document is the artifact for the *course's* M2.

### 8.2 How the work splits

Ownership follows the workstreams in README §10. Each requirement gets **one primary owner** — the person who decides how it works and whose name is on it — and optionally a supporting owner for the surface they do not control.

| Person | Workstream | Owns the surface |
| --- | --- | --- |
| **Antonio Cottone** | Board and Canvas Interaction | Pixi renderer, coordinate system, viewport, token rendering, tactical overlays |
| **Raymond Lin** | Real-Time Architecture & Persistence | Schema, room kernel, sockets, identity, authorization, visibility filtering, event log |
| **Christos Psimadas** | Map Processing & AI Pipelines | Upload pipeline, grid detection, UVTT, wall/portal geometry, analysis service |
| **Vincent Chen** | Online UX & Product Quality | Join flow, player-safe layouts, encounter panels, accessibility, cross-browser + convergence testing |

**The contract that makes parallel work safe.** `packages/shared` — protocol types and the pure kernels — is agreed and frozen in Slice 0. Everyone imports it; nobody redefines a payload shape locally. Changes to it are a pull request the whole team reviews, because a silent change there desyncs three workstreams at once.

---

### 8.3 Core Loop (README §12 M1) — 18 requirements

The prototype already covers the three requirements rated **High** difficulty — FR-PL-06, FR-SYNC-02, FR-SYNC-04 — because those are the expensive ones to retrofit. What remains is mostly breadth.

#### Dependency order

```
                    ┌────────────────────────┐
                    │ Slice 0: Foundations   │  blocks everything
                    │ Postgres/Redis/MinIO,  │
                    │ schema, workspace split│
                    └───────────┬────────────┘
                                │
          ┌─────────────────────┼─────────────────────┐
          ▼                     ▼                     ▼
 ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
 │ Slice 1          │  │ Slice 2          │  │ Slice 3          │
 │ Identity & rooms │  │ Map pipeline     │  │ Board renderer   │
 │ (Raymond+Vincent)│  │ (Christos)       │  │ (Antonio)        │
 └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
          │                     │                     │
          └──────────┬──────────┴─────────────────────┘
                     ▼
          ┌────────────────────────┐
          │ Slice 4: Tokens & roles│
          │ (Antonio + Vincent)    │
          └────────────────────────┘
```

Slices 1–3 run **in parallel** across three workstreams.

#### The slices

**Slice 0 — Foundations** · Raymond · blocks everything else

| Work | Requirements |
| --- | --- |
| Docker Compose: Postgres, Redis, MinIO | — |
| Prisma schema from §4.1, with migrations | — |
| Workspace split: `apps/web`, `apps/server`, `services/map-analysis`, `packages/shared` | — |
| Move the prototype's in-memory room onto Postgres + Redis `INCR` | FR-SYNC-01, FR-SYNC-02, FR-SYNC-04 |
| Event-log writes on every committed action | FR-REC-03 (early, cheap now) |

Writing the event log now rather than during Tactical Play costs almost nothing and means undo is later a *read* problem, not a migration.

**Slice 1 — Identity and rooms** · Raymond (server), Vincent (join UX)

| Work | Requirements | Owner |
| --- | --- | --- |
| GM registration/login, argon2id, opaque session cookie | FR-GM-01 | Raymond |
| Room creation + invite code generation | FR-PL-01 | Raymond |
| Join screen: display name, token issue, error states | FR-PL-01 | Vincent |
| Guest token rebind against `participants` | FR-PL-02 | Raymond |
| Reconnect rebinding + snapshot on resume | FR-PL-05, FR-PL-06 | Raymond |

**Slice 2 — Map pipeline** · Christos

| Work | Requirements |
| --- | --- |
| Map upload → MinIO, served from a separate origin | FR-GM-02 |
| **Manual** grid alignment UI (cell size, offset, nudge) | FR-GM-04 |
| Grid metadata stored in board coordinates | FR-GM-05 |
| Automatic detection via BullMQ → analysis service, with confidence | FR-GM-03 |

**Sequencing matters here:** build the *manual* alignment path first. It is low difficulty, it makes the map flow usable on its own, and it means automatic detection is an enhancement that can slip without blocking anyone.

**Slice 3 — Board renderer** · Antonio

| Work | Requirements |
| --- | --- |
| Replace the plain-DOM board with PixiJS v8 | — |
| Independent per-client pan and zoom | FR-TAC-01 |
| Continuous coordinates with optional grid snapping | FR-TAC-02 |
| 100-token / 60 FPS benchmark against README §6 | NFR gate |

Run the benchmark **early**, not at the end. It is the one number that can invalidate the PixiJS-vs-Konva decision, and finding that out in week 4 is recoverable while week 11 is not.

**Slice 4 — Tokens and roles** · Antonio (board), Vincent (panels)

| Work | Requirements | Owner |
| --- | --- | --- |
| Token upload, placement, size, rotation, HP bars | FR-GM-08 | Antonio |
| GM assigns token ownership to participants | FR-GM-10 | Vincent |
| Owner-only control wired to real participant IDs | FR-PL-04 | Raymond |
| Responsive player-safe board layout | FR-PL-03 | Vincent |

#### Task split — Core Loop

| Owner | Requirements |
| --- | --- |
| Antonio | FR-GM-05, FR-GM-08, FR-TAC-01, FR-TAC-02 |
| Raymond | Slice 0, FR-GM-01, FR-PL-02, FR-PL-04, FR-PL-05, FR-PL-06, FR-SYNC-01, FR-SYNC-02, FR-SYNC-04 |
| Christos | FR-GM-02, FR-GM-03, FR-GM-04 |
| Vincent | FR-PL-01 (UX), FR-PL-03, FR-GM-10 |

---

### 8.4 Tactical Play and GM Control (README §12 M2) — 18 requirements

This is where the product stops being a shared map and becomes a tabletop. Two things gate everything else: the ephemeral channel, and the renderer landing in Core Loop Slice 3.

#### Dependency order

```
  ┌──────────────────────────┐
  │ Slice 5: Ephemeral channel│  blocks every live preview
  │ (Raymond)                 │
  └────────────┬──────────────┘
               │
   ┌───────────┼────────────────────────┐
   ▼           ▼                        ▼
┌────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ Slice 6        │ │ Slice 7          │ │ Slice 8          │
│ Roles, hidden  │ │ Tactical overlays│ │ Encounter panels │
│ info, fog      │ │ (Antonio)        │ │ (Vincent)        │
│ (Raymond+A+V)  │ │                  │ │                  │
└───────┬────────┘ └──────────────────┘ └──────────────────┘
        │
        ▼
┌────────────────────┐
│ Slice 9: Recovery  │  needs the event log from Slice 0
│ (Raymond)          │
└────────────────────┘
```

#### The slices

**Slice 5 — Ephemeral channel** · Raymond · blocks Slice 7

| Work | Requirements |
| --- | --- |
| Second socket namespace using `volatile.emit`, never persisted | FR-SYNC-03 |
| Client-side throttling and coalescing of pointer traffic | FR-SYNC-03 |
| Latency benchmark against the 150 ms target (README §6) | NFR gate |

Build this before any overlay that previews. Retrofitting preview traffic onto the committed channel is the mistake that makes a VTT feel laggy, and it is much harder to unpick later than to separate now.

**Slice 6 — Roles, hidden information, fog** · Raymond (server), Antonio (fog rendering), Vincent (GM controls)

| Work | Requirements | Owner |
| --- | --- | --- |
| Role model formalized on `participants` | FR-GM-14 | Raymond |
| Per-message authorization on every GM-only intent | FR-GM-15 | Raymond |
| Hidden-token state and server-side payload filtering | FR-GM-16, FR-GM-23 | Raymond |
| Fog region state on the committed channel | FR-GM-17 | Raymond |
| Fog painting and masked rendering | FR-GM-17 | Antonio |
| GM visibility controls (hide/reveal UI) | FR-GM-16 | Vincent |

FR-GM-23 is rated **High** and deserves it: the test is that a player's payload never *contains* hidden data, not that the client declines to draw it. Vincent's automated harness should assert this against API responses, socket frames, and reconnect snapshots alike (README §8).

**Slice 7 — Tactical overlays** · Antonio · needs Slice 5

| Work | Requirements |
| --- | --- |
| Movement budget ruler with diagonal rules and thresholds | FR-TAC-03 |
| Line/rect/circle drawing overlays | FR-TAC-04 |
| Target pings (ephemeral, animated, self-expiring) | FR-TAC-05 |
| AoE templates: preview on ephemeral, placement on committed | FR-TAC-06 |

FR-TAC-06 is the one to watch — it straddles both channels. Aiming is ephemeral; the placed template is committed state. Getting that boundary right is the slice's real work.

**Slice 8 — Encounter panels** · Vincent

| Work | Requirements |
| --- | --- |
| Initiative list, shared and synced, add/remove/reorder | FR-GM-21 |
| Dice expression parser (`NdX + M`) and roller | FR-TAC-09 |
| Public vs GM-only roll routing | FR-GM-22 |
| Token stats and condition display | FR-TAC-07 |
| Condition markers distinguished by shape/text, not colour alone | FR-TAC-08 |

Dice are rolled **server-side**. A client-side roll that reports its own result is unverifiable, which defeats the point of shared rolls.

**Slice 9 — Recovery** · Raymond · needs the event log from Slice 0

| Work | Requirements |
| --- | --- |
| Plain-language rendering of the event log with actor attribution | FR-REC-01 |
| Compensating-event undo for a defined reversible set | FR-REC-02 |
| Append-only guarantee enforced at the database level | FR-REC-03 |
| Checkpoint save/restore as the universal fallback | FR-REC-02 support |

Start by making **only token moves** reversible. It is the easiest action to compensate and it exercises the whole mechanism; widening the reversible set afterwards is incremental. README §11 rates surprising undo desyncs as the project's top risk, so the mitigation is a small reversible set plus checkpoint restore as the escape hatch.

#### Task split — Tactical Play

| Owner | Requirements |
| --- | --- |
| Antonio | FR-GM-17 (rendering), FR-TAC-03, FR-TAC-04, FR-TAC-05, FR-TAC-06 |
| Raymond | FR-GM-14, FR-GM-15, FR-GM-16, FR-GM-17 (state), FR-GM-23, FR-SYNC-03, FR-REC-01, FR-REC-02, FR-REC-03 |
| Christos | *(light — see §8.6)* |
| Vincent | FR-GM-16 (UI), FR-GM-21, FR-GM-22, FR-TAC-07, FR-TAC-08, FR-TAC-09 |

---

### 8.5 Stretch (README §12 M3) — 11 requirements

Everything here is cut-first material. The ordering below is by dependency, and §8.5's cut order is by effort-to-value.

#### Dependency order

```
┌───────────────────────────┐
│ Slice 10: Wall data       │  nothing below works without wall geometry
│ UVTT import + validation  │
│ + manual wall editing     │
│ (Christos, Antonio)       │
└─────────────┬─────────────┘
              │
      ┌───────┴────────┐
      ▼                ▼
┌──────────────┐  ┌─────────────────┐     ┌──────────────────────┐
│ Slice 11     │  │ Slice 12        │     │ Slice 13             │
│ Vision       │  │ Portals + LoS   │     │ Quality of life      │
│ pipeline     │  │ (Antonio+Ray)   │     │ (Raymond, Vincent)   │
│ (Christos)   │  │                 │     │ — independent        │
└──────────────┘  └─────────────────┘     └──────────────────────┘
```

Slice 13 depends on nothing and can be pulled forward whenever someone has slack.

#### The slices

**Slice 10 — Wall data foundation** · Christos (parsing), Antonio (editor)

| Work | Requirements | Owner |
| --- | --- | --- |
| UVTT / `.dd2vtt` import: image, grid, walls, portals | FR-GM-06 | Christos |
| Malformed-file reporting that names the problem | FR-GM-07 | Christos |
| Wall/portal segment editing on canvas, door state marking | FR-GM-09 | Antonio |

Import lands before detection deliberately: it gives the team real wall data to build portals and line-of-sight against without waiting on the CV pipeline.

**Slice 11 — Vision pipeline** · Christos

| Work | Requirements |
| --- | --- |
| OpenCV wall extraction adapted from prior art (§12.1) | FR-GM-11 |
| Door/window classification | FR-GM-11 |
| UVTT export round-trip | FR-GM-12 |

Detected geometry is always **suggested**, never applied — the GM reviews before it affects visibility (README §11).

**Slice 12 — Portals and line of sight** · Antonio (rendering), Raymond (state)

| Work | Requirements | Owner |
| --- | --- | --- |
| Open/closed/locked portal state on the committed channel | FR-GM-18 | Raymond |
| 2D raycast visibility from wall and portal segments | FR-GM-19 | Antonio |
| Per-player visibility masking in the renderer | FR-GM-19 | Antonio |

The single highest-risk item in the project. It needs Slice 10's geometry, the Pixi masking proven in Core Loop Slice 3, and per-player filtering from Tactical Play Slice 6 — three dependencies, which is exactly why it is stretch.

**Slice 13 — Quality of life** · Raymond, Vincent · no dependencies

| Work | Requirements | Owner |
| --- | --- | --- |
| Reusable encounter templates | FR-GM-13 | Raymond |
| Replay from a checkpoint for late joiners | FR-PL-07 | Raymond |
| Guest revocation and invite regeneration | FR-GM-20 | Raymond |
| Focusable token roster panel | FR-GM-24 | Vincent |

#### Task split — Stretch

| Owner | Requirements |
| --- | --- |
| Antonio | FR-GM-09, FR-GM-19 |
| Raymond | FR-GM-13, FR-GM-18, FR-GM-20, FR-PL-07 |
| Christos | FR-GM-06, FR-GM-07, FR-GM-11, FR-GM-12 |
| Vincent | FR-GM-24 |

#### Cut order

If the schedule tightens, drop in this order — highest effort and most open-ended first:

1. **FR-GM-11** vision-based parsing — README §12 already names it the first to drop; UVTT import covers the same need with a manual step
2. **FR-GM-19** dynamic line of sight — three dependencies, High difficulty
3. **FR-GM-13**, **FR-PL-07** — convenience, not correctness
4. **FR-GM-12** UVTT export, **FR-GM-24** roster — low effort, keep if anything survives

---

### 8.6 Load across the team

| Owner | Core Loop | Tactical Play | Stretch | Total |
| --- | --- | --- | --- | --- |
| Antonio | 4 | 5 | 2 | 11 |
| Raymond | 9 + Slice 0 | 9 | 4 | 22 |
| Christos | 3 | 0 | 4 | 7 |
| Vincent | 3 | 6 | 1 | 10 |

**Two imbalances worth fixing now rather than in week 8.**

*Raymond carries roughly twice anyone else.* That is structurally true — authorization, sync, identity and recovery are one coherent problem and splitting them across people creates more coordination cost than it saves. Mitigations: Vincent already owns the GM-facing UI for FR-GM-16 and FR-GM-10, and FR-GM-13/FR-GM-20 in Stretch are self-contained enough to hand to whoever has slack.

*Christos has nothing in Tactical Play.* His work is bunched into Core Loop and Stretch, leaving an idle middle. Two options: pull **Slice 10 (UVTT import) forward** into the Tactical Play window — it has no dependency on tactical features and de-risks the whole Stretch milestone — or have him take the automated convergence test harness from README §8, which needs building around then anyway.

### 8.7 Definition of done for a slice

A slice is done when all four hold:

1. Unit tests cover the pure logic it introduced (README §8 names grid math, coordinate transforms, dice parsing, schema parsing).
2. A Playwright test drives the flow across **two browser contexts** where the requirement is multi-user.
3. CI is green — lint, test, build, health smoke.
4. Its requirement IDs move from `D` to `P` in §10, honestly.

### 8.8 Sequencing traps to avoid

| Trap | Why it bites | Avoidance |
| --- | --- | --- |
| Building auth last | Everything downstream needs `participants.id` to reference | Slice 1 immediately after foundations |
| Auto grid detection before manual alignment | A flaky CV pipeline blocks the playable path | Manual first, detection as enhancement |
| Deferring the Pixi perf benchmark | Renderer choice becomes unchangeable | Benchmark in the first week of Slice 3 |
| Letting slices diverge on protocol shapes | Painful merges when they converge | Freeze `packages/shared` types in Slice 0 |
| Adding the event log during Tactical Play | Becomes a data migration | Write events from the first committed action |
| Overlays before the ephemeral channel | Preview traffic ends up on the committed path and is painful to unpick | Slice 5 before Slice 7 |
| Line of sight before wall data | Nothing to raycast against | Slice 10 before Slice 12 |
| Making everything undoable at once | Undo desyncs are the top project risk | Token moves first, widen incrementally |

---

## 9. Repository and CI

```
.github/workflows/ci.yml   lint → test → build → server health smoke test
docs/DESIGN.md             this document
openspec/                  spec-driven change proposals for future work
src/                       prototype source
assets/ui-reference/       UI direction boards
README.md                  product specification (the requirements)
```

CI runs on every push to `main` and `design` and on every PR into `main`:

| Step | Command | Guards against |
| --- | --- | --- |
| Lint | `npm run lint` | Style drift and unused/unsafe code across four contributors |
| Test | `npm test` | Regressions in the authoritative kernel and identity rules |
| Build | `npm run build` | Type errors and a client that compiles locally but not cleanly |
| Smoke | `curl /health` | A server that builds but does not boot |

It is intentionally thin. It exists so that the *habit* and the *wiring* are in place before there is enough code to make setting it up painful. Playwright joins the matrix in Slice 1, when there is a multi-user flow worth asserting.

---

## 10. Requirements Traceability

**P** = working in the prototype · **~** = partially exercised · **D** = designed here, built later.

| ID | Requirement | Component | M2 |
| --- | --- | --- | --- |
| FR-GM-01 | Authenticated GM session | `users` + `auth_sessions` (argon2id) | D |
| FR-GM-02 | Battle-map setup | REST upload → Object Storage | D |
| FR-GM-03 | Automatic grid detection | Map Analysis Service via BullMQ | D |
| FR-GM-04 | Grid preview and correction | React setup UI + scene metadata | D |
| FR-GM-05 | Viewport-independent grid metadata | Board coordinates on `tokens`/`scenes` | ~ |
| FR-GM-06 | UVTT import | App Server parser → scenes/walls | D |
| FR-GM-07 | UVTT validation | Schema validation at parse time | D |
| FR-GM-08 | Token setup | `tokens` table + REST | D |
| FR-GM-09 | Editable walls and portals | Scene geometry + Pixi editor | D |
| FR-GM-10 | Token ownership assignment | `tokens.owner_participant_id` | ~ |
| FR-GM-11 | Vision-based map parsing | Map Analysis Service (see §12) | D |
| FR-GM-12 | UVTT export | App Server serializer | D |
| FR-GM-13 | Reusable encounter templates | Scene/token template rows | D |
| FR-GM-14 | GM and player roles | `participants.role` | P |
| FR-GM-15 | Server-side authorization | Room kernel, checked per message | P |
| FR-GM-16 | Token visibility controls | `tokens.hidden` + filtering | P |
| FR-GM-17 | Manual fog of war | Scene fog regions + committed channel | D |
| FR-GM-18 | Interactive portal states | Portal state in scene geometry | D |
| FR-GM-19 | Dynamic line of sight | Pixi masking + 2D raycast | D |
| FR-GM-20 | Guest revocation / invite regeneration | `participants.revoked_at` | D |
| FR-GM-21 | Initiative and turn-order tracking | Committed channel + scene state | D |
| FR-GM-22 | Public and GM-only dice rolls | Server-side roll + filtered broadcast | D |
| FR-GM-23 | Player-safe state filtering | `filterForParticipant` | P |
| FR-GM-24 | Focusable token roster | React roster panel | D |
| FR-PL-01 | Shareable guest link | `rooms.invite_code` | D |
| FR-PL-02 | Durable guest identity | `localStorage` token → hashed lookup | P |
| FR-PL-03 | Responsive Player Board | React player layout | D |
| FR-PL-04 | Owned-token control | Room kernel ownership check | P |
| FR-PL-05 | Automatic reconnection | Socket.IO reconnect + token rebind | P |
| FR-PL-06 | Full-state resynchronization | `state:snapshot` on every connect | P |
| FR-PL-07 | Encounter replay for late joiners | Event log + checkpoints | D |
| FR-TAC-01 | Independent pan and zoom | Per-client Pixi viewport | D |
| FR-TAC-02 | Continuous coords + grid snapping | Board coordinate system | ~ |
| FR-TAC-03 | Movement Budget Ruler | Ephemeral channel | D |
| FR-TAC-04 | Drawing overlays | Committed channel + scene overlays | D |
| FR-TAC-05 | Target Pings | Ephemeral channel | D |
| FR-TAC-06 | AoE templates | Ephemeral preview → committed placement | D |
| FR-TAC-07 | Token statistics and conditions | `tokens.stats` | D |
| FR-TAC-08 | Accessible condition markers | React markers (shape + text) | D |
| FR-TAC-09 | Shared dice expressions | Server-side parser/roller | D |
| FR-SYNC-01 | Server-authoritative room state | Room kernel | P |
| FR-SYNC-02 | Real-time persistent synchronization | Committed channel | ~ |
| FR-SYNC-03 | Ephemeral interaction channel | `volatile.emit` path | D |
| FR-SYNC-04 | Ordered conflict handling | Monotonic `seq` | P |
| FR-REC-01 | Human-readable activity log | `events` table | D |
| FR-REC-02 | Undo for reversible actions | Compensating events | D |
| FR-REC-03 | Append-only recovery history | `events` is insert-only | D |

**Why the three partials are partial**

- **FR-GM-05** — tokens are stored in board coordinates, which is the right data model, but there is no zoom or viewport yet, so viewport-independence is untested by construction.
- **FR-GM-10** — ownership is enforced server-side, but assignments are seeded in code; there is no GM interface to change them.
- **FR-TAC-02** — coordinates snap to the grid, but there is no continuous mode and no toggle between them.
- **FR-SYNC-02** — synchronization is real-time but not yet *persistent* (state dies with the process), and only token moves sync; conditions, initiative, fog and portals do not exist yet.

---

## 11. Interface and Page Design

### 11.1 Status

§11.4 onward is **proposed, not decided**. Interface direction is the Board owner's call
(Antonio) and the page inventory is a team decision; this section exists so there is
something concrete to argue with, because until now the document said nothing about what
the application is beyond one room screen.

Two corrections to what this section used to claim. The boards it referenced —
`room-setup.png`, `at-the-table.png`, `between-sessions.png` — **were never produced**;
`assets/ui-reference/` contains only a README describing them. And the palette that README
calls "already applied" (deep slate-teal ground, parchment text, gold accent) is **not**
what ships: `apps/web/src/styles.css` uses a neutral charcoal ground with a blue accent.
The documented direction was abandoned silently. §11.9 picks one.

### 11.2 Page inventory

What exists today, and what a usable product still needs:

| Route | Page | State | Serves |
| --- | --- | --- | --- |
| `/` | Create a room | Built — a bare form | — |
| `/join/:inviteCode` | Guest join | Built | FR-PL-01, FR-PL-02 |
| `/r/:roomId` | The table | Built | most of the FR set |
| — | 404 | Built — an unstyled card | — |
| `/signup`, `/login` | Account — any role | **Missing** | FR-GM-01, §5.7 |
| `/rooms` | Room hub — rooms you belong to | **Missing** | FR-GM-01 (§4.2: an account exists so a user can return and find their rooms). Also the second way to join, for people past their first session (§5.7) |
| `/r/:roomId/prepare` | Scene preparation | **Missing** — currently crammed into the table's side panel | FR-GM-02 … FR-GM-07, FR-GM-11 |
| `/r/:roomId/log` | Activity log and undo | **Missing** | FR-REC-01, FR-REC-02 |
| `/r/:roomId/settings` | Access, invites, revocation | **Missing** | FR-GM-20 |
| `/library` | Saved maps, token art, encounter templates | **Missing** | FR-GM-13 for templates; saved assets have no requirement yet (§5.7) |

The gap is not decoration. Three of those rows are requirements with no surface at all: a GM
cannot currently find a room they made last week, revoke a guest, or read the log that
FR-REC-01 requires. Map preparation lives in a scrolling side panel beside the live table,
which means the GM does setup and play in the same cramped column.

### 11.3 Information architecture

Three layers, distinguished by how long a person stays and how much they are asked to think:

1. **Entry** (`/`, `/join/:code`, `/login`, `/signup`) — one decision per screen, no
   navigation chrome. A player arriving from an invite link must reach the table in under
   30 seconds (README §6), so this layer is a corridor, not a lobby.
2. **Hub** (`/rooms`, `/library`, account) — the between-sessions layer. Persistent left
   navigation, list-dense, optimised for finding one room among many.
3. **Table** (`/r/:roomId` and its sub-surfaces) — the encounter. No global chrome at all:
   the board owns the viewport and everything else is a panel over it. Sub-surfaces
   (prepare, log, settings) open as overlays rather than page navigations, because leaving
   the table would drop the socket and force a resync.

The rule that follows: **navigation chrome decreases as you go deeper.** Entry has none,
hub has a sidebar, the table has none again.

### 11.4 What we take from mature VTTs, and what we refuse

Roll20 is the reference point because README §3 already names its tradeoff: broad
functionality at the cost of onboarding and interface overhead. That is a statement about
*pages*, not features. A mature VTT accretes surfaces — marketplace, compendium, character
sheets, forums, a tabletop sidebar with a dozen tabs — and every one of them is a decision
the user has to route around before play starts.

README §7 already excludes most of that surface area: no character sheets, no rules
automation, no marketplace, no video. The page design should make that exclusion *visible*
rather than leaving room for it.

| Pattern | Take | Refuse |
| --- | --- | --- |
| Persistent list of games you belong to | Yes — §11.2 `/rooms`. Returning to last week's table is FR-GM-01's whole purpose | — |
| Invite link that drops a player at the table | Yes, and go further: no account at all (FR-PL-01) | An account wall anywhere in the player path |
| Tabletop with a side panel | Yes, one panel | A sidebar of many tabs; ours caps at four |
| Layer controls (map / token / fog / GM) | Yes, as board layers | Exposing them as a persistent toolbar the player also sees |
| Settings, permissions, asset library | Yes, as overlays over the table | A settings tree the GM navigates away from play to reach |
| Marketplace, compendium, forums, sheets | — | All of it. Out of scope, and each is a top-level page we then owe navigation to |

The concrete rule this produces: **a player's path from link to playing contains exactly one
screen and one field.** A GM's path from logging in to a prepared map contains no more than
three. Any page proposal that lengthens either is rejected on that basis alone.

### 11.5 The landing page

The only page a stranger sees, and currently a form on an empty ground. It has to do one
job: make a GM believe the four-minute setup claim (README §9) before they have signed up
for anything.

**Above the fold.** An editorial split rather than centred text on a dark rectangle: the
claim and its single action on one side, a real battle map bleeding off the opposite edge,
masked into the ground so it reads as depth rather than as a pasted screenshot. The map is
the product; a stock photograph of dice on a table is not.

- The headline runs **two lines, never more**. It says what the product does in concrete
  verbs — upload a map, start playing — not "elevate your tabletop". Hold it under about
  14 words and let it set at a fluid size that stays two lines from 380px to 1920px rather
  than reflowing into a paragraph
- **Exactly one primary action** (create a room) with one quiet secondary (see a live
  demo room). Two competing buttons of equal weight is the failure mode
- Nothing else. No floating badges over the text, no metric pills, no "trusted by" strip
  above the fold

**Below it,** three movements, each a full viewport-height chapter with generous separation
so they read as distinct rather than as a stack of cards:

1. **The setup claim, demonstrated.** The map-to-grid-to-tokens sequence shown as actual
   interface, advancing on scroll. This is the differentiator and it earns the largest
   surface on the page
2. **What the table looks like in play,** from both sides — the GM's hidden tokens and the
   player's filtered view, side by side. The visibility model is the hardest thing to
   explain in words and the easiest to show
3. **Recovery.** The activity log with an undo, because "nothing is unrecoverable" is the
   promise that distinguishes this from a shared image

**Banned on this page:** a row of three equal feature cards; section eyebrows reading
"FEATURES" or "HOW IT WORKS"; any centred hero; testimonials the project does not have;
invented usage statistics.

### 11.6 Entry pages

**`/join/:inviteCode`** — one field, one button, no chrome. A player who is already known to
this browser skips the field entirely and gets "Resume as Alice" instead, because re-typing
a name to rejoin a room you were in five minutes ago is a needless step and risks creating a
second identity (§5.5).

- Primary action: join
- States: validating the code, invalid or expired code with a plain explanation, submitting
- Not here: anything about accounts. The offer to claim one belongs after the session, on
  the way out — never on the way in (§5.7)

**`/login` and `/signup`** — for anyone who wants to be found again, not GM-only (§5.7). A
player reaches these only *after* a session, never before: the invite path must not prompt
for an account ahead of play. A single column at reading width, the form
above the fold with no scrolling, and the opposite link (sign in / create account) as quiet
text rather than a second button. Password rules stated *before* the field, not as an error
after submitting.

### 11.7 The room hub

The between-sessions surface, and the one most likely to be built as a wall of identical
cards. It should be a list, because a list scans and a card grid does not.

**Layout.** A single column of rooms at reading width, one row per room, separated by
hairlines rather than boxed. Each row: scene thumbnail at a fixed small size, room name,
when it was last played, participant count. The row is the click target.

**Ordering** is by last played, descending — not alphabetical and not by creation date. The
room you want is almost always the one you were just in.

**States.** Skeleton rows shaped like real rows while loading. The empty state is the first
thing a new GM ever sees and should read as an invitation with the create action inline, not
as an error. Room creation happens here too, so the hub is never a dead end.

### 11.8 The table: layers and panels

The most complex screen and the one with the strictest rule: **the board owns the viewport.**
Everything else is a panel over it or a column beside it, and nothing may push the board
smaller than it needs to be.

**Regions.**

- **Board** — the full remaining area, with no global navigation bar above it. There is
  nowhere to navigate to; leaving would drop the socket
- **Panel** — a fixed column on the right at desktop width, beneath the board as tabs below
  720px, beside it again in landscape (KAN-55). Four tabs at most: Play, Tokens, Dice, and
  Manage for the GM. When a fifth is proposed, something merges
- **Board controls** — a small cluster floating over the board's corner: fit, zoom, and
  the layer switcher. Floating rather than docked, because a docked toolbar costs board
  height permanently for controls used occasionally
- **Status** — connection state and seq, inline in the panel header. Never a modal. A
  reconnect must not interrupt play, and a dialog over the board does exactly that

**Layers,** in draw order, bottom to top: map, grid, drawings and templates, tokens,
condition markers, fog, ephemeral effects (pings, drag previews, rulers). The GM can target
a layer for editing; a player never sees a layer control, because every layer they can act
on is the token layer. Fog and GM-only geometry are not merely hidden in the player's
renderer — they are absent from the payload (FR-GM-23), and the interface should not imply
otherwise by showing a disabled control.

**Overlays** open over the table and never navigate away from it: scene preparation, the
activity log, room settings. Each is a wide sheet rather than a column, dismissible with
Escape, and returns focus to the control that opened it. Preparation in particular needs
width — a GM aligning a grid against a map is comparing two things and cannot do it in a
20rem strip.

**Density** is highest here and only here. The panel may compress padding and use tabular
figures at a smaller size; the entry and hub pages may not. A GM tracking eight tokens
through an encounter wants information per square inch, and the same person on the landing
page wants space.

### 11.9 Design system

**Direction.** Resolve the palette split in favour of the team's original intent: a deep,
slightly cool ground with a **single warm accent**. That reads as a table lit from above,
which is what the product is, and it avoids the blue-on-charcoal default that every
developer tool already uses. The shipped blue accent should go.

| Token | Value | Use |
| --- | --- | --- |
| `--ground` | `#0f1418` | Page and board surround. Never pure black |
| `--panel` | `#161d22` | Panels, overlays |
| `--hairline` | `#24323a` | 1px separators — the primary grouping device |
| `--text` | `#e8e2d4` | Body |
| `--muted` | `#8a9aa3` | Secondary, labels |
| `--accent` | `#d6a355` | The single accent: primary action, active turn |
| `--ok` `--warn` `--danger` | `#4caf7d` `#d29922` `#c4564f` | Status only, never decoration |

One accent, under 80% saturation. Status colours are never the only signal — the active
turn carries a glyph and position as well as gold, conditions carry a shape and an
abbreviation as well as a fill (FR-TAC-08).

**Typography.** A geometric grotesk for the interface and a true monospace for anything
numeric — initiative scores, hit points, dice results, seq numbers all need tabular figures
so they stop jittering as they change.

```
--font-ui:   "Geist", "Satoshi", system-ui, sans-serif
--font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace
```

Serifs are out: this is software, not editorial. Headings control hierarchy through weight
and colour rather than size — a room name is `text-lg font-semibold tracking-tight`, not a
display heading. Body copy caps at 65 characters.

**Space and materiality.** Group by hairline and negative space, not by boxing everything in
a card. A card is justified only when elevation means something — an overlay above the
table, a menu above the panel. Panels sit flat on the ground with a single hairline.
Shadows, when used, are tinted to the ground rather than black.

**Motion.** Fluid but not cinematic. `transition: 0.24s cubic-bezier(0.16, 1, 0.3, 1)` for
state changes; spring physics for anything the user drags or drops. Animate `transform` and
`opacity` only — never `width`, `height`, `top` or `left`, which would fight the Pixi
canvas for the compositor. Two things earn continuous motion and nothing else does: the
active-turn indicator and the connection status. `prefers-reduced-motion` removes both.

**Density** varies by layer: airy at entry (generous spacing, one decision per view),
moderate in the hub, and tight at the table, where a GM tracking eight tokens needs
information per square inch. The table panel is the only surface that may compress padding.

**Icons.** One set, one stroke weight (1.5), from Phosphor or Radix. No emoji anywhere in
the interface, ever — they render differently on every platform and read as placeholder.

### 11.10 Interface states

Every data surface specifies four states, not one. Prototypes ship the success case and
discover the rest in front of a grader.

- **Loading** — skeletons shaped like the content that will replace them. No spinners
- **Empty** — says what to do next. "No rooms yet — create one to get started", not a blank
  panel. The empty table and empty roster are the first thing a new GM sees
- **Error** — inline and specific, next to the thing that failed. Errors that need a retry
  carry the retry. A rejected command surfaces the server's reason, since `decide` already
  returns one
- **Offline** — the board stays interactive and visibly stale rather than blanking. The
  status line owns this; nothing modal

### 11.11 Responsive and accessibility

Breakpoints at 720px and 1024px. Below 720 the panel moves beneath the board and becomes
tabs; in landscape on a phone the panel returns to the side, because width is what a
landscape phone has (see KAN-55). The board refits when the viewport changes only if the
viewer has not positioned their own camera — an independent viewport is FR-TAC-01, and a
rotation must not undo a deliberate pan (KAN-54).

Accessibility is a stated target (README §6: WCAG 2.2 AA for non-canvas UI), which means
concretely: every interactive element reachable by keyboard and visible when focused; touch
targets at least 44px on coarse pointers; colour never the sole carrier of meaning; the
canvas paired with a DOM equivalent for anything it expresses — the roster is the keyboard
path to token selection (FR-GM-24), and any future canvas-only affordance needs the same
treatment.

---

## 12. Known Gaps and Open Decisions

| Item | Status | Plan |
| --- | --- | --- |
| Wall detection: service or client-side? | **Decided — Python service** | Wall extraction runs in the Map Analysis Service alongside grid detection, not in the browser. See §12.1 for the references we build on. |
| Guest returning on a second device | **Open, and overdue** | This said "pick before FR-PL-02 ships"; FR-PL-02 has shipped and nothing was picked. §5.7 proposes accounts as the answer rather than a claim code, since the same mechanism also gives returning users a room list and a second way to join. Owner's call. |
| PixiJS unproven at 100 tokens / 60 FPS | Open | Benchmark in the first week of Slice 3; it can still invalidate the renderer choice. |
| No load testing against 150 ms / 500 ms targets | Deferred | k6 or Artillery benchmark once the ephemeral channel exists |
| Prototype is single-package | Deferred | Workspace split is Slice 0 |
| Undo semantics for concurrent edits | Designed, unvalidated | Prototype compensating events on token moves first, where they are easiest to reason about |
| Express vs Fastify | **Decided — Express** | Reverted to the documented choice; see docs/adr/0002. |
| Saved assets across rooms | Open | Uploads are one-off objects referenced by a single scene. Reuse needs an owner and a requirement of its own (§5.7); FR-GM-13 covers templates but not the asset library. |
| Room co-ownership | Open | `rooms.owner_user_id` is singular, so a campaign has exactly one GM account. Fine for the Core Loop, awkward for a group that shares GM duties (§5.7). |

### 12.1 Prior art for map analysis

Wall and portal detection (FR-GM-11) adapts existing MIT-licensed work rather than starting from scratch. Both references implement the same pipeline shape — colour masking → morphological cleanup → contour tracing → segment simplification and endpoint welding — so the approach is well-trodden.

| Reference | What we take from it | Licence |
| --- | --- | --- |
| [`ThreeHats/auto-wall`](https://github.com/ThreeHats/auto-wall) — **primary** | Python/OpenCV implementation of the detection pipeline; closest to our service architecture and directly adaptable | MIT |
| [`DimitroffVodka/foundry-auto-wall`](https://github.com/DimitroffVodka/foundry-auto-wall) — secondary | A later derivative of the same project; useful for its centreline tracing mode, which fixes the double-wall artefact thick drawn lines produce | MIT |

Attribution and licence text for any adapted code will be carried in the service directory. Our output target is UVTT wall and portal geometry (FR-GM-06, FR-GM-12), not Foundry `WallDocument`s, so the serialization layer is ours regardless of which pipeline we adapt.
