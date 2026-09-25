# Design Document — Virtual Tabletop

**Course:** CSE 416 · **Team:** Antonio Cottone, Raymond Lin, Vincent Chen, Christos Psimadas

Requirements live in [`../README.md`](../README.md) and are referenced by ID (FR-PL-02).
This document covers architecture, stack, repository, and the running prototype.

| Document | Contents |
| --- | --- |
| [`DELIVERY.md`](DELIVERY.md) | Slice sequencing, task split, cut order |
| [`INTERFACE.md`](INTERFACE.md) | Page inventory, information architecture, design system |
| [`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) | Accepted frontend decisions; overrides older statements |
| [`adr/0001-event-model.md`](adr/0001-event-model.md) | Why state is an event log |
| [`adr/0002-transport-and-identity.md`](adr/0002-transport-and-identity.md) | Socket.IO handshake, guest tokens |
| [`adr/0003-tactical-state.md`](adr/0003-tactical-state.md) | Stats, conditions, initiative, dice |

---

## 1. Architecture

```
  Browser (GM)         Browser (player)        Browser (player)
       │                      │                       │
       │  HTTP /api/*         │  WebSocket            │
       └──────────┬───────────┴───────────┬───────────┘
                  │                       │
         ┌────────▼───────────────────────▼────────┐
         │          App Server (Node)              │
         │                                         │
         │  Express routes      Socket.IO gateway  │
         │  /api/rooms          handshake auth     │
         │  /api/invites/:c     committed channel  │
         │  /api/uploads        ephemeral channel  │
         │                                         │
         │  ┌───────────────────────────────────┐  │
         │  │  LiveRoom — per-room FIFO queue   │  │
         │  │  decide() → events → append →     │  │
         │  │  reduce() → filter → broadcast    │  │
         │  └───────────────────────────────────┘  │
         └───┬──────────────┬─────────────┬────────┘
             │  :5432       │  :6379      │  :9000
   ╔═════════╪══════════════╪═════════════╪═══════════════════════╗
   ║  Docker Compose        │             │    docker-compose.yml ║
   ║ ┌───────▼──────┐ ┌─────▼─────┐ ┌─────▼──────┐                ║
   ║ │  PostgreSQL  │ │   Redis   │ │   MinIO    │                ║
   ║ │  event log   │ │  seq,     │ │  map and   │                ║
   ║ │  snapshots   │ │  pub/sub  │ │  token art │                ║
   ║ │  credentials │ │  sessions │ │            │                ║
   ║ └──────┬───────┘ └─────┬─────┘ └─────┬──────┘                ║
   ║     pgdata          redisdata     miniodata   (named volumes)║
   ║                                                              ║
   ║ ┌──────────────────────────────────────────┐                 ║
   ║ │  Vision service — PLANNED                │                 ║
   ║ │  Python / FastAPI / OpenCV               │                 ║
   ║ │  grid detection, wall extraction         │                 ║
   ║ │  driven by a BullMQ queue on Redis       │                 ║
   ║ └──────────────────────────────────────────┘                 ║
   ╚══════════════════════════════════════════════════════════════╝

   The App Server and the web client run on the host, not in Docker.
   Each service is optional: with DATABASE_URL, REDIS_URL or
   MINIO_ENDPOINT unset the server falls back to in-memory state,
   Postgres-only sequencing, and uploads on local disk (dev only,
   and only when no MinIO answers at 127.0.0.1:9000).
```

`packages/shared` is the contract both sides import: zod schemas, `decide`, `reduce`,
visibility filters. Pure TypeScript, no I/O, so the rules are unit-testable without a
network or a browser.

### The one rule

Persistent state changes only along this path:

```
Command → decide() → DomainEvent[] → store.append → reduce() → filter → broadcast
```

`decide` and `reduce` are pure and deterministic. Nothing else mutates `RoomState`. Events
are append-only; undo is a compensating event, never a delete. Events that replace data
carry the old value, which is what makes undo and the activity log possible later.

### Two channels, one socket

| Channel | Carries | Persisted | Ordered | Delivery |
| --- | --- | --- | --- | --- |
| Committed | Commands in, events out | Yes, with `seq` | Yes | Reliable |
| Ephemeral | Pings, drag previews | No | No | `volatile.emit`, dropped under backpressure |

Pointer chatter must never queue ahead of committed state, which is why the ephemeral
channel gets no sequence number and no persistence (FR-SYNC-03).

### Request paths

| Action | Path |
| --- | --- |
| Create a room | `POST /api/rooms` → `RoomCreated` + `ParticipantJoined`, returns invite code |
| Join by link | `POST /api/invites/:code/join` → `ParticipantJoined` |
| Upload map or token art | `POST /api/uploads` (GM only, 25 MB, PNG/JPEG/WebP) |
| Connect | Socket.IO handshake carries `{ roomId, guestToken }`; server replies `welcome` with a filtered snapshot |
| Act | `command` → `ack` with a seq, or `rejected` with a code |
| Recover | Client detects a seq gap, sends `resync`, gets a fresh `welcome` |

Every payload containing room data passes through `filterStateForViewer` or
`filterEventForViewer` first — snapshots, events, and REST responses alike. A seq a viewer
may not see arrives as `redacted`, so their counter advances without leaking the content.

---

## 2. Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Board renderer | PixiJS v8 | WebGL masks are what keep 100 tokens plus fog at 60 FPS; canvas2d will not. |
| App shell | React + TypeScript | Where the WCAG 2.2 AA target lives, and agents are strong at React, so UI parallelizes across four people. |
| Build | Vite | Instant HMR during canvas work, zero-config production build. |
| Transport | Socket.IO | Rooms map one-to-one onto VTT rooms; reconnection, acks and `volatile.emit` are built in. |
| Server | Node + Express | Sharing the kernel and protocol types with the client removes a whole class of desync bug. |
| Validation | zod | Express validates nothing on its own; zod guards every trust boundary (FR-GM-15). |
| Database | PostgreSQL + Prisma | An append-only event table with snapshots is inherently relational, and migrations stop four people fighting over schema drift. |
| Cache and bus | Redis | Atomic `INCR` gives the per-room seq, pub/sub fans out across instances, guest sessions rebind through it. |
| Object storage | MinIO → S3/R2 | Map images do not belong in Postgres, and MinIO speaks S3 so local dev needs no cloud account. |
| Jobs | BullMQ | Grid detection, wall extraction and snapshots are async, and BullMQ rides the Redis already required. |
| Map analysis | Python + FastAPI + OpenCV | Grid and wall detection are solved in the Python CV ecosystem; isolating it matches the boundary FR-GM-11 specifies. |
| Auth | argon2id, opaque session tokens | Memory-hard hashing, and server-side sessions revoke instantly with no refresh-token choreography. |
| Tests | Vitest + Playwright | Vitest shares Vite's transform; Playwright drives two browser contexts in one test, the only practical way to assert convergence. |
| CI | GitHub Actions | Free for the repo, and the whole matrix is one YAML job. |
| Local services | Docker Compose | Everyone runs identical versions of Postgres, Redis and MinIO with one command. |
| Hosting | Fly.io or Railway | Both hold persistent WebSocket connections; serverless cannot. |

### Running the backing services

Every stateful dependency runs in Docker, declared in [`../docker-compose.yml`](../docker-compose.yml).
Nobody installs Postgres, Redis or MinIO locally, so a broken environment is fixed by
deleting a volume rather than by debugging one laptop.

| Service | Image | Ports | Volume | Holds |
| --- | --- | --- | --- | --- |
| `postgres` | `postgres:17` | 5432 | `pgdata` | Event log, snapshots, credentials |
| `redis` | `redis:7-alpine` | 6379 | `redisdata` | Sequence numbers, pub/sub, sessions |
| `minio` | `minio:latest` | 9000, 9001 | `miniodata` | Uploaded map and token images |

```bash
docker compose up -d
npm run prisma:migrate --workspace=@vtt/server

DATABASE_URL=postgres://vtt:vtt@localhost:5432/vtt \
REDIS_URL=redis://localhost:6379 \
MINIO_ENDPOINT=http://localhost:9000 \
npm run dev
```

Credentials are `vtt`/`vtt` and `vtt`/`vttvttvtt` — local development values committed on
purpose. Deployment supplies its own and must never reuse them. `docker compose down` keeps
the data; `down -v` discards it, which is the reset when a migration goes wrong.

**The application is not containerised.** The server and web client run on the host, because
the inner loop wants Vite HMR and `tsx watch`.

**Containers are optional, deliberately.** Each service is selected by an environment
variable and the server falls back when one is absent: no `DATABASE_URL` means an in-memory
store, no `MINIO_ENDPOINT` means the compose MinIO at `127.0.0.1:9000` if it answers and local disk
otherwise (never in production, which refuses to start without it), no `REDIS_URL` means sequencing from
Postgres alone. A fresh checkout runs with no containers, which is what keeps CI free of a
service matrix. Startup states the mode:

```
[vtt] using Postgres event store                    # persistent
[vtt] DATABASE_URL unset — using in-memory store    # lost on every reload
```

In-memory mode loses every room on restart, including the restart `tsx watch` performs on
each save. Any manual test of persistence or reconnection must run against the containers,
and the Postgres store tests skip themselves until `DATABASE_URL` is set.

The vision service is not in the compose file yet; `services/vision` does not exist. It
becomes a fourth service when automatic grid detection (FR-GM-03) and wall extraction
(FR-GM-11) start. Its own container keeps the CV dependency tree out of the Node services.

### Choices we did not make

- **Konva over PixiJS** — friendlier API, but dynamic line of sight needs cheap masking. If LoS is cut, Konva becomes the better call.
- **JWT for sessions** — stateless verification buys nothing with one app server, and opaque tokens revoke instantly.
- **Fastify over Express** — built-in schema validation would serve FR-GM-15 directly. Worth revisiting as the socket surface grows.
- **A CRDT** — rejected. CRDTs converge without a referee; this system *needs* one. Merge-anything semantics contradict authorization and hidden information.

---

## 3. Repository and CI

npm workspaces, one install from the root.

```
packages/shared    the contract: schemas, decide, reduce, visibility filters. No I/O.
apps/server        Express + Socket.IO. domain/liveRoom.ts is the pipeline;
                   store/ holds memory, Postgres, Redis and MinIO adapters.
apps/web           React panels + PixiJS board (board/boardView.ts).
                   net/roomConnection.ts is the sync client.
services/vision    planned — Python/OpenCV grid and wall detection.
```

```bash
npm install
npm run dev         # server :3001, web :5173 (proxies /api, /socket.io, /uploads)
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs on every push to `main` and every pull request: install → generate Prisma client →
lint → typecheck → test → build → boot the server and poll `/health`. The smoke test is the
reason the in-memory fallback exists; CI starts no containers.

Conventions: commands are `noun.verb`, events are `PastTense`, tests and PR titles carry the
FR ID. Schema changes in `packages/shared` need an ADR and review by the real-time
architecture owner.

---

## 4. The Prototype (Heartbeat)

Not the product. It proves the risky paths — server-authoritative sync, durable guest
identity, and player-safe filtering — end to end.

**Working today.** Create a room and get an invite link. Join as a guest with no account.
Upload a battle map, set the grid, place tokens with images, colours, sizes, HP and
conditions. Assign ownership; players move only their own tokens and the GM moves any.
Hide a token and it never reaches player clients. Roll dice publicly or GM-only. Run
initiative. Pan, zoom and ping. Reload and come back as the same participant with the same
role. Kill the server and, with Postgres configured, the room is still there.

68 tests cover it: 54 unit tests over the pure kernel, 11 multi-client integration tests
over real sockets, and 3 Postgres store tests that run when a database is configured.

**Not built yet.** GM accounts (room creation is still open to anyone), automatic grid
detection, UVTT import and export, walls, portals, fog of war, line of sight, the movement
ruler, drawing overlays, AoE templates, undo, the activity log, encounter templates, and
guest revocation.

**Run it — no containers.** This is the deliberate default: a fresh clone plays without
Docker, because the store, sequencer and asset sink each fall back when their environment
variable is unset (§2).

```bash
npm install && npm run dev
```

Open <http://localhost:5173>, create a room, copy the invite link, and open it in a private
window to join as a player. Everything in "working today" holds **except persistence** —
rooms live in memory and die on every server restart, including the restart `tsx watch`
performs each time you save a file.

**Run it — with persistence.** Needed to exercise the Postgres event store, MinIO uploads
and Redis sequencing, and therefore needed for any manual test of restart survival,
reconnection or recovery.

```bash
docker compose up -d
npm run prisma:migrate --workspace=@vtt/server

DATABASE_URL=postgres://vtt:vtt@localhost:5432/vtt \
REDIS_URL=redis://localhost:6379 \
MINIO_ENDPOINT=http://localhost:9000 \
npm run dev
```

The startup line tells you which one you got: `using Postgres event store` or
`DATABASE_URL unset — using in-memory store`.

---

## 5. Data and Identity

### Schema

| Table | Key | Purpose |
| --- | --- | --- |
| `rooms` | `id`, unique `invite_code` | One room; the invite code is the share link |
| `events` | `(room_id, seq)` | Append-only log. The composite key *is* the ordering guarantee (FR-SYNC-04) — a duplicate seq is a constraint violation, not an application bug |
| `snapshots` | `(room_id, seq)` | Periodic state for fast load; derivable, never authoritative |
| `checkpoints` | `id` | Named restore points (FR-REC) |
| `credentials` | `token_hash` | Guest token → participant, with `revoked_at` |

Room state is the fold of its events. Snapshots are an optimization and can be deleted
without data loss.

### Identity

The browser generates an opaque token, keeps it in `localStorage`, and the server stores
only its SHA-256 — so the server never holds a secret it could leak. Socket.IO replays the
handshake `auth` on every automatic reconnect, so a dropped client rebinds to the same
participant with no extra round trip (FR-PL-02, FR-PL-05).

`participants` is the identity the game uses. Tokens are owned by participants, not
accounts, so guests are first-class and accounts remain a GM convenience.

One consequence to keep in mind: guest identity is one browser. A player who joins from
their phone is a new participant, and a GM who switches device loses the room outright until
accounts land (FR-GM-01). See [`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) §13.1.

### Visibility

Hidden information never leaves the server. Both filters in `visibility.ts` are updated
together whenever a new kind of hidden data is added — fog regions, GM-only rolls, private
metadata. Authorization is decided in `decide()`; the client's `can.*` helpers are UI hints
with no security value.

---

## 6. Requirements Traceability

**B** = built · **~** = partial · **D** = designed, not built.

| ID | Requirement | Where | |
| --- | --- | --- | --- |
| FR-GM-01 | Authenticated GM session | `credentials`, argon2id | D |
| FR-GM-02 | Battle-map setup | `POST /api/uploads` → `MapSet` | B |
| FR-GM-03 | Automatic grid detection | Vision service via BullMQ | D |
| FR-GM-04 | Grid preview and correction | React setup UI | D |
| FR-GM-05 | Viewport-independent grid metadata | `GridSet`, board coordinates | B |
| FR-GM-06 | UVTT import | Server parser → scene + walls | D |
| FR-GM-07 | UVTT validation | zod at parse time | D |
| FR-GM-08 | Token setup | `token.create` | ~ |
| FR-GM-09 | Editable walls and portals | Scene geometry + Pixi editor | D |
| FR-GM-10 | Token ownership assignment | `token.setOwners`, roster UI | B |
| FR-GM-11 | Vision-based map parsing | Vision service | D |
| FR-GM-12 | UVTT export | Server serializer | D |
| FR-GM-13 | Reusable encounter templates | Template rows | D |
| FR-GM-14 | GM and player roles | `Participant.role` | B |
| FR-GM-15 | Server-side authorization | `decide()` | B |
| FR-GM-16 | Token visibility controls | `token.setHidden` + filters | B |
| FR-GM-17 | Manual fog of war | Scene fog regions | D |
| FR-GM-18 | Interactive portal states | Portal state in geometry | D |
| FR-GM-19 | Dynamic line of sight | Pixi masking + raycast | D |
| FR-GM-20 | Guest revocation, invite regeneration | `credentials.revoked_at` | D |
| FR-GM-21 | Initiative and turn order | `initiative.*` | B |
| FR-GM-22 | Public and GM-only rolls | `DiceVisibility` + filters | B |
| FR-GM-23 | Player-safe state filtering | `visibility.ts` | B |
| FR-GM-24 | Focusable token roster | `TokenRoster.tsx` | B |
| FR-PL-01 | Shareable guest link | `rooms.invite_code` | B |
| FR-PL-02 | Durable guest identity | Hashed `localStorage` token | B |
| FR-PL-03 | Responsive Player Board | `RoomPanel`, `MyTokens` | B |
| FR-PL-04 | Owned-token control | Ownership check in `decide()` | B |
| FR-PL-05 | Automatic reconnection | Handshake replay | B |
| FR-PL-06 | Full-state resynchronization | `welcome` + `resync` | B |
| FR-PL-07 | Replay for late joiners | Event log + checkpoints | D |
| FR-TAC-01 | Independent pan and zoom | `boardView.ts` | B |
| FR-TAC-02 | Continuous coords, grid snapping | `snapTokenCenter` | B |
| FR-TAC-03 | Movement budget ruler | Ephemeral channel | D |
| FR-TAC-04 | Drawing overlays | Committed channel | D |
| FR-TAC-05 | Target pings | Ephemeral `ping` | B |
| FR-TAC-06 | AoE templates | Ephemeral preview → committed | D |
| FR-TAC-07 | Token statistics and conditions | `token.setStats/setConditions` | B |
| FR-TAC-08 | Accessible condition markers | `ConditionMarker.tsx` | B |
| FR-TAC-09 | Shared dice expressions | `dice.ts`, server-rolled | B |
| FR-SYNC-01 | Server-authoritative state | `LiveRoom` | B |
| FR-SYNC-02 | Real-time persistent sync | Postgres store | B |
| FR-SYNC-03 | Ephemeral interaction channel | `volatile.emit` | B |
| FR-SYNC-04 | Ordered conflict handling | `(room_id, seq)` primary key | B |
| FR-REC-01 | Human-readable activity log | `events` table | D |
| FR-REC-02 | Undo for reversible actions | Compensating events | D |
| FR-REC-03 | Append-only recovery history | Schema enforces insert-only | ~ |

**Why the partials are partial.** FR-GM-08 has every field the requirement asks for, but no
dedicated setup screen — tokens are created from the GM panel. FR-REC-03 holds structurally,
since events are never updated or deleted and every mutating event carries its replaced
value, but nothing reads the history back yet.

---

## 7. Open Decisions

- **Accounts.** Resolved in [`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) §13.1: hosting requires an account, players never need one. Not implemented; room creation is still open.
- **Grid detection accuracy.** The fallback when detection is wrong is manual correction (FR-GM-04), which must ship before or with FR-GM-03.
- **Undo scope.** Which events are reversible, and whether undo is per-actor or per-room.
- **Duplicate names.** Participant and token names are not unique (KAN-61, KAN-62).
- **Fog and filtering.** Fog must be filtered server-side, not masked in Pixi — masking alone ships the hidden map to the client.

### Prior art for map analysis

Wall and portal detection (FR-GM-11) adapts existing MIT-licensed work rather than starting from scratch. Both references implement the same pipeline shape — colour masking → morphological cleanup → contour tracing → segment simplification and endpoint welding — so the approach is well-trodden.

| Reference | What we take from it | Licence |
| --- | --- | --- |
| [`ThreeHats/auto-wall`](https://github.com/ThreeHats/auto-wall) — **primary** | Python/OpenCV implementation of the detection pipeline; closest to our service architecture and directly adaptable | MIT |
| [`DimitroffVodka/foundry-auto-wall`](https://github.com/DimitroffVodka/foundry-auto-wall) — secondary | A later derivative of the same project; useful for its centreline tracing mode, which fixes the double-wall artefact thick drawn lines produce | MIT |

Attribution and licence text for any adapted code will be carried in the service directory. Our output target is UVTT wall and portal geometry (FR-GM-06, FR-GM-12), not Foundry `WallDocument`s, so the serialization layer is ours regardless of which pipeline we adapt.
