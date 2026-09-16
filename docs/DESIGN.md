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
| A repo someone else can clone, with a CI skeleton | §7, and [`../.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| A minimal prototype that runs | §6, and [`../src`](../src) |
| Design doc connected to the requirements | §8 traceability matrix |

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
              │  - rooms        │  │ - seq    │      ┌────────▼─────────┐
              │  - tokens       │  │ - pub/sub│      │  Object Storage  │
              │  - event log    │  │ - guest  │      │  (MinIO / S3)    │
              │    (append-only)│  │   sessions│     │  - map images    │
              │  - checkpoints  │  │ - job q  │      │  - token art     │
              └─────────────────┘  └───┬──────┘      └────────▲─────────┘
                                       │                      │
                         ┌─────────────▼──────────┐           │
                         │  Job Workers (BullMQ)  │───────────┘
                         │  - grid detection      │
                         │  - checkpoint snapshot │
                         │  - asset GC            │
                         │  - invite expiry       │
                         └─────────────┬──────────┘
                                       │ HTTP
                         ┌─────────────▼──────────┐
                         │  Vision Service        │
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
                                └──> BullMQ job ──> Vision Service (OpenCV)
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

**Reconnect (FR-PL-05, FR-PL-06)**

```
Client reconnects ──> rebind guest token (Redis) ──> load current state
                                                   ──> send full snapshot
```

Reconnect re-sends a complete snapshot rather than replaying missed deltas. Replaying a delta stream correctly across an unknown-length disconnect is materially harder and is the documented source of the "stale or conflicting state" risk in README §11.

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
| Job queue | **BullMQ** | Grid detection, vision segmentation, checkpoint snapshots and asset GC are all async work, and BullMQ rides the Redis instance the system already requires. |
| Vision service | **Python + FastAPI + OpenCV** | Grid detection and wall extraction are solved problems in the Python CV ecosystem and nowhere else, and isolating it matches the microservice boundary FR-GM-11 specifies. |
| GM auth | **JWT access + httpOnly refresh cookie** | Standard, stateless, and sufficient for the single trusted role in FR-GM-01. |
| Guest identity | **Opaque token in `localStorage`** | Implements FR-PL-02 literally, and makes revocation (FR-GM-20) a matter of rotating one value. |
| Unit tests | **Vitest** | Shares Vite's transform pipeline, so the same TypeScript runs in tests and in the app. |
| E2E tests | **Playwright** | It can drive two browser contexts inside one test, which is the only practical way to assert the cross-client convergence and undo semantics in README §8. |
| CI | **GitHub Actions** | Free for the repo, and the lint/test/build matrix is three lines of YAML. |
| Local environment | **Docker Compose** | A new teammate gets Postgres, Redis, MinIO and the vision service with one command. |
| Hosting | **Fly.io or Railway** | Both hold persistent WebSocket connections; serverless platforms cannot. |

### Choices we deliberately did not make

- **Konva instead of PixiJS** — friendlier API and better agent familiarity, but dynamic line of sight (FR-GM-19) needs cheap masking. If LoS is cut to stretch-only, Konva becomes the better call.
- **Fastify instead of Express** — built-in payload schema validation would directly serve FR-GM-15 and the forged-payload tests in README §8. Worth revisiting before the socket surface grows.
- **A CRDT (Yjs/Automerge)** — rejected: CRDTs converge without a referee, but this system *needs* a referee. A player must not be able to move another player's token, and merge-anything semantics contradict authorization and hidden information.

---

## 4. Data Model (target)

```
users ──1:N── rooms ──1:N── scenes ──1:N── tokens
                 │              │
                 │              └──1:1── map_asset ──> object storage key
                 │
                 ├──1:N── participants (role, guest_token_hash, owned_token_ids)
                 ├──1:N── events        (append-only: seq, actor, type, payload)
                 └──1:N── checkpoints   (named snapshot of scene state at a seq)
```

`events` is the spine. Current state is a materialized projection of the log; checkpoints are periodic snapshots so replay (FR-PL-07) and restore never need to walk the entire history.

---

## 5. Security and Visibility

- Authorization is enforced **server-side on every message**, not at connection time — role is data, and a socket that was a player's at handshake must not be trusted to still be one (FR-GM-15).
- Hidden tokens, unrevealed fog, and GM-only rolls are filtered **before serialization**, so player payloads never contain data the player may not see (FR-GM-23). Filtering at render time would leak through devtools.
- Guest tokens are opaque and stored hashed; revoking a participant or regenerating an invite invalidates them (FR-GM-20).

---

## 6. The Prototype (Heartbeat)

Deliberately not the product. It exists to prove the riskiest path in the whole system — server-authoritative sync — end to end, before any of it is built for real.

**What it demonstrates**

| Behavior | Requirement |
| --- | --- |
| Server owns state; clients send intents and render what comes back | FR-SYNC-01 |
| Every accepted action increments one monotonic per-room `seq` | FR-SYNC-04 |
| Players may move only tokens they own; the GM may move any | FR-PL-04, FR-GM-15 |
| Hidden tokens are stripped from player payloads server-side | FR-GM-16, FR-GM-23 |
| New clients receive a full authoritative snapshot on connect | FR-PL-06 |
| Rejected moves roll back the optimistic client render | FR-SYNC-01 |

**What it deliberately omits:** Postgres, Redis, object storage, the vision service, job workers, the Pixi renderer, fog, walls, undo. Each has a designed home above; none is needed to prove the sync path.

**Layout**

```
src/
  shared/protocol.ts   wire types shared by both sides
  shared/room.ts       pure authoritative kernel — the only place state changes
  shared/room.test.ts  10 unit tests over that kernel
  server/index.ts      Express /health + Socket.IO gateway
  client/useRoom.ts    socket lifecycle, optimistic apply, rollback
  client/Board.tsx     plain-DOM board (Pixi comes later, on purpose)
```

The kernel is pure and I/O-free, so the rules that matter — ownership, bounds, sequencing — are unit-tested without a network or a browser. That property is the reason to write it this way now rather than later.

**Run it**

```bash
npm install
npm run dev          # server :3001, client :5173
```

Open two tabs: the first is the GM, the rest are players. Drag a token in one and it moves in the other. Try dragging a token you do not own and the move is rejected and rolled back.

---

## 7. Repository and CI

```
.github/workflows/ci.yml   lint → test → build → server health smoke test
docs/DESIGN.md             this document
openspec/                  spec-driven change proposals for future work
src/                       prototype source
README.md                  product specification (the requirements)
```

CI runs on every push to `main` and `design` and on every PR into `main`:

| Step | Command | Guards against |
| --- | --- | --- |
| Lint | `npm run lint` | Style drift and unused/unsafe code across four contributors |
| Test | `npm test` | Regressions in the authoritative kernel's rules |
| Build | `npm run build` | Type errors and a client that compiles locally but not cleanly |
| Smoke | `curl /health` | A server that builds but does not boot |

It is intentionally thin. It exists so that the *habit* and the *wiring* are in place before there is enough code to make setting it up painful.

---

## 8. Requirements Traceability

How each specified requirement maps onto the architecture above. **P** = exercised by the prototype, **D** = designed here, built later.

| ID | Requirement | Component | M2 |
| --- | --- | --- | --- |
| FR-GM-01 | Authenticated GM session | App Server + Postgres (JWT) | D |
| FR-GM-02 | Battle-map setup | REST upload → Object Storage | D |
| FR-GM-03 | Automatic grid detection | Vision Service (OpenCV) via BullMQ | D |
| FR-GM-04 | Grid preview and correction | React setup UI + scene metadata | D |
| FR-GM-05 | Viewport-independent grid metadata | Board coordinates in `scenes` | P |
| FR-GM-06 | UVTT import | App Server parser → scenes/walls | D |
| FR-GM-07 | UVTT validation | Schema validation at parse time | D |
| FR-GM-08 | Token setup | `tokens` table + REST | D |
| FR-GM-09 | Editable walls and portals | Scene geometry + Pixi editor | D |
| FR-GM-10 | Token ownership assignment | `tokens.ownerId` | P |
| FR-GM-11 | Vision-based map parsing | Vision Service (isolated) | D |
| FR-GM-12 | UVTT export | App Server serializer | D |
| FR-GM-13 | Reusable encounter templates | Scene/token template rows | D |
| FR-GM-14 | GM and player roles | `participants.role` | P |
| FR-GM-15 | Server-side authorization | Room kernel, checked per message | P |
| FR-GM-16 | Token visibility controls | `tokens.hidden` + filtering | P |
| FR-GM-17 | Manual fog of war | Scene fog regions + committed channel | D |
| FR-GM-18 | Interactive portal states | Portal state in scene geometry | D |
| FR-GM-19 | Dynamic line of sight | Pixi masking + 2D raycast | D |
| FR-GM-20 | Guest revocation / invite regeneration | Redis guest sessions | D |
| FR-GM-21 | Initiative and turn-order tracking | Committed channel + scene state | D |
| FR-GM-22 | Public and GM-only dice rolls | Server-side roll + filtered broadcast | D |
| FR-GM-23 | Player-safe state filtering | `filterForParticipant` | P |
| FR-GM-24 | Focusable token roster | React roster panel | D |
| FR-PL-01 | Shareable guest link | Invite code → room | D |
| FR-PL-02 | Durable guest identity | `localStorage` token + Redis binding | D |
| FR-PL-03 | Responsive Player Board | React player layout | D |
| FR-PL-04 | Owned-token control | Room kernel ownership check | P |
| FR-PL-05 | Automatic reconnection | Socket.IO reconnect | P |
| FR-PL-06 | Full-state resynchronization | `state:snapshot` on connect | P |
| FR-PL-07 | Encounter replay for late joiners | Event log + checkpoints | D |
| FR-TAC-01 | Independent pan and zoom | Per-client Pixi viewport | D |
| FR-TAC-02 | Continuous coords + grid snapping | Board coordinate system | P |
| FR-TAC-03 | Movement Budget Ruler | Ephemeral channel | D |
| FR-TAC-04 | Drawing overlays | Committed channel + scene overlays | D |
| FR-TAC-05 | Target Pings | Ephemeral channel | D |
| FR-TAC-06 | AoE templates | Ephemeral preview → committed placement | D |
| FR-TAC-07 | Token statistics and conditions | `tokens` metadata | D |
| FR-TAC-08 | Accessible condition markers | React markers (shape + text) | D |
| FR-TAC-09 | Shared dice expressions | Server-side parser/roller | D |
| FR-SYNC-01 | Server-authoritative room state | Room kernel | P |
| FR-SYNC-02 | Real-time persistent synchronization | Committed channel | P |
| FR-SYNC-03 | Ephemeral interaction channel | `volatile.emit` path | D |
| FR-SYNC-04 | Ordered conflict handling | Monotonic `seq` (Redis `INCR`) | P |
| FR-REC-01 | Human-readable activity log | `events` table | D |
| FR-REC-02 | Undo for reversible actions | Compensating events | D |
| FR-REC-03 | Append-only recovery history | `events` is insert-only | D |

---

## 9. UI Reference

Visual direction for the board and panels — deep slate-teal ground, parchment text, gold action accent — is captured in [`../assets/ui-reference/`](../assets/ui-reference/) and already reflected in the prototype's palette. The reference boards cover room setup (map upload → grid alignment → tokens → invite), the GM and player tabletop views, chat/dice, connection-loss states, and the between-sessions room hub.

---

## 10. Known Gaps

| Gap | Plan |
| --- | --- |
| Prototype is single-package; the real system needs workspaces | Split into `apps/web`, `apps/server`, `services/vision`, `packages/shared` when the server and client dependency sets diverge |
| No load testing against the 150 ms / 500 ms targets yet | Add a k6 or Artillery benchmark once the ephemeral channel exists |
| Pixi renderer unproven against the 100-token / 60 FPS target | Build a throwaway 100-token render benchmark before committing to the full board |
| Undo semantics for concurrent multi-user edits are designed, not validated | Prototype compensating events on token moves first, where they are easiest to reason about |
