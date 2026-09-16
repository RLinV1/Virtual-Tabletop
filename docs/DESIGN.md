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
| How we tackle M1 | §8 |

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

**Reconnect (FR-PL-05, FR-PL-06)** — detailed in §5.2.

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
  unique (room_id, user_id)        where user_id is not null
  unique (guest_token_hash)        where guest_token_hash is not null

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

## 5. Identity Without Accounts

The defining constraint of this product: **most users never create an account, but still need identity that survives a reload** (FR-PL-01 + FR-PL-02). "Anonymous" and "forgettable" are not the same thing.

### 5.1 Guest tokens

1. On first visit to a room link, the browser generates **32 bytes** from `crypto.getRandomValues` and stores the base64url result in `localStorage`.
2. Every connection — first or fiftieth — presents that token in the Socket.IO handshake.
3. The server hashes it with **SHA-256** and looks up `participants.guest_token_hash`.
4. Known hash → that participant, with their role, display name and owned tokens intact. Unknown hash → a new participant row.

**Hashing choice.** Passwords get argon2id because humans pick low-entropy secrets that must be expensive to guess. Guest tokens get plain SHA-256 because 256 bits of CSPRNG output cannot be brute-forced, and argon2 would add latency to every reconnect for zero security benefit. Both are hashed — the server never persists a credential it could leak.

**Why not a cookie?** `localStorage` is explicitly what FR-PL-02 specifies, it survives the tab being backgrounded, and it is not sent on every asset request. The cost is that it is per-browser-profile, which §5.3 addresses.

### 5.2 Reconnect flow

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

### 5.3 Edge cases we have to answer

| Case | Behaviour |
| --- | --- |
| Player clears site data or joins from their phone | New token, therefore a new participant. The GM reassigns their token, or the invite link carries a claim code they re-enter. **Decision pending — see §12.** |
| Two people open the same invite link | Two distinct tokens, two participants. Correct: an invite identifies a *room*, not a person. |
| Player shares their token | They have shared their identity. Mitigated by GM revocation (FR-GM-20), not prevented — acceptable for a social game among friends. |
| GM revokes a participant | `revoked_at` is set; the next handshake with that hash is refused and the socket closed. |
| Invite code regenerated | Existing participants keep playing; only *new* joins need the new code. |
| Private browsing / storage blocked | Identity lasts for the tab only. The client falls back to an in-memory token and the player is warned that a reload will lose their seat. |

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

## 8. M1 Implementation Plan

M1 (README §12) is 18 requirements. The prototype already covers the three rated **High** difficulty — FR-PL-06, FR-SYNC-02, FR-SYNC-04 — because those are the ones that are expensive to retrofit. What remains is mostly breadth.

### 8.1 Dependency order

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

Slices 1–3 run **in parallel** across three workstreams. The contract that makes that safe is `packages/shared`: protocol types and the pure kernels are agreed in Slice 0 and imported by everyone, so three people can build against the same interface without daily merges.

### 8.2 The slices

**Slice 0 — Foundations** · owner: Raymond · blocks everything else

| Work | Requirements |
| --- | --- |
| Docker Compose: Postgres, Redis, MinIO | — |
| Prisma schema from §4.1, with migrations | — |
| Workspace split: `apps/web`, `apps/server`, `services/map-analysis`, `packages/shared` | — |
| Move the prototype's in-memory room onto Postgres + Redis `INCR` | FR-SYNC-01, FR-SYNC-02, FR-SYNC-04 |
| Event-log writes on every committed action | FR-REC-03 (early, cheap now) |

Writing the event log now rather than in M2 costs almost nothing and means undo is later a *read* problem, not a migration.

**Slice 1 — Identity and rooms** · owners: Raymond (server), Vincent (join UX)

| Work | Requirements |
| --- | --- |
| GM registration/login, argon2id, opaque session cookie | FR-GM-01 |
| Room creation + invite code generation | FR-PL-01 |
| Guest token issue/rebind against the `participants` table | FR-PL-02 |
| Reconnect rebinding + snapshot on resume | FR-PL-05, FR-PL-06 |

The prototype's `identity.ts` moves to Postgres here; the resolution rules and their tests carry over unchanged.

**Slice 2 — Map pipeline** · owner: Christos

| Work | Requirements |
| --- | --- |
| Map upload → MinIO, served from a separate origin | FR-GM-02 |
| **Manual** grid alignment UI (cell size, offset, nudge) | FR-GM-04 |
| Grid metadata stored in board coordinates | FR-GM-05 |
| Automatic detection via BullMQ → analysis service, with confidence | FR-GM-03 |

**Sequencing matters here:** build the *manual* alignment path first. It is low difficulty, it makes the whole map flow usable on its own, and it means automatic detection is an enhancement that can slip without blocking anyone. Building detection first risks a half-working CV pipeline standing between the team and a playable board.

**Slice 3 — Board renderer** · owner: Antonio

| Work | Requirements |
| --- | --- |
| Replace the plain-DOM board with PixiJS v8 | — |
| Independent per-client pan and zoom | FR-TAC-01 |
| Continuous coordinates with optional grid snapping | FR-TAC-02 |
| 100-token / 60 FPS benchmark against README §6 | NFR gate |

Run the benchmark **early** in this slice, not at the end. It is the one number that can invalidate the PixiJS-vs-Konva decision, and finding that out in week 4 is recoverable while week 11 is not.

**Slice 4 — Tokens and roles** · owners: Antonio (board), Vincent (panels)

| Work | Requirements |
| --- | --- |
| Token upload, placement, size, rotation, name, HP bars | FR-GM-08 |
| GM assigns token ownership to participants | FR-GM-10 |
| Owner-only control wired to real participant IDs | FR-PL-04 |
| Responsive player-safe board layout | FR-PL-03 |

### 8.3 Definition of done for a slice

A slice is done when all four hold:

1. Unit tests cover the pure logic it introduced (README §8 names grid math, coordinate transforms, schema parsing).
2. A Playwright test drives the flow across **two browser contexts** where the requirement is multi-user.
3. CI is green — lint, test, build, health smoke.
4. Its requirement IDs move from `D` to `P` in §10, honestly.

### 8.4 Sequencing traps to avoid

| Trap | Why it bites | Avoidance |
| --- | --- | --- |
| Building auth last | Everything downstream needs `participants.id` to reference | Slice 1 immediately after foundations |
| Auto grid detection before manual alignment | A flaky CV pipeline blocks the playable path | Manual first, detection as enhancement |
| Deferring the Pixi perf benchmark | Renderer choice becomes unchangeable | Benchmark in the first week of Slice 3 |
| Letting three slices diverge on protocol shapes | Painful merges in Slice 4 | Freeze `packages/shared` types in Slice 0 |
| Adding the event log in M2 instead of M1 | Becomes a data migration | Write events from the first committed action |

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

## 11. UI Reference

Visual direction for the board and panels — deep slate-teal ground, parchment text, gold action accent — is captured in [`../assets/ui-reference/`](../assets/ui-reference/) and already reflected in the prototype's palette. The reference boards cover room setup (map upload → grid alignment → tokens → invite), the GM and player tabletop views, chat/dice, connection-loss states, and the between-sessions room hub.

---

## 12. Known Gaps and Open Decisions

| Item | Status | Plan |
| --- | --- | --- |
| Wall detection: service or client-side? | **Decided — Python service** | Wall extraction runs in the Map Analysis Service alongside grid detection, not in the browser. See §12.1 for the references we build on. |
| Guest returning on a second device | Open | Either GM reassignment or a claim code carried by the invite link (§5.3). Pick before FR-PL-02 ships. |
| PixiJS unproven at 100 tokens / 60 FPS | Open | Benchmark in the first week of Slice 3; it can still invalidate the renderer choice. |
| No load testing against 150 ms / 500 ms targets | Deferred | k6 or Artillery benchmark once the ephemeral channel exists |
| Prototype is single-package | Deferred | Workspace split is Slice 0 |
| Undo semantics for concurrent edits | Designed, unvalidated | Prototype compensating events on token moves first, where they are easiest to reason about |
| Express vs Fastify | Deferred | Revisit before the socket surface grows (§3) |

### 12.1 Prior art for map analysis

Wall and portal detection (FR-GM-11) adapts existing MIT-licensed work rather than starting from scratch. Both references implement the same pipeline shape — colour masking → morphological cleanup → contour tracing → segment simplification and endpoint welding — so the approach is well-trodden.

| Reference | What we take from it | Licence |
| --- | --- | --- |
| [`ThreeHats/auto-wall`](https://github.com/ThreeHats/auto-wall) — **primary** | Python/OpenCV implementation of the detection pipeline; closest to our service architecture and directly adaptable | MIT |
| [`DimitroffVodka/foundry-auto-wall`](https://github.com/DimitroffVodka/foundry-auto-wall) — secondary | A later derivative of the same project; useful for its centreline tracing mode, which fixes the double-wall artefact thick drawn lines produce | MIT |

Attribution and licence text for any adapted code will be carried in the service directory. Our output target is UVTT wall and portal geometry (FR-GM-06, FR-GM-12), not Foundry `WallDocument`s, so the serialization layer is ours regardless of which pipeline we adapt.
