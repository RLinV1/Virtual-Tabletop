# ADR 0002 — Socket.IO transport and browser-generated guest identity

**Status:** Accepted · **Supersedes:** the deviations recorded in `docs/PROPOSAL-walking-skeleton.md` §4
**Owner:** Real-Time Architecture (Raymond)

## Context

The walking skeleton merged in #2 shipped a stack that diverged from `docs/DESIGN.md` §3 in
four places: plain `ws` instead of Socket.IO, Fastify instead of Express,
`useSyncExternalStore` instead of Zustand, and server-issued instead of browser-generated
guest tokens. The proposal framed these as open questions; merging answered them by
accident rather than by decision, leaving the design document and the running code
contradicting each other on the points a new contributor is most likely to read first.

## Decision

The code follows `DESIGN.md`. All four are reverted, using the heartbeat prototype on the
`design` branch (`src/server/index.ts`, `src/client/useRoom.ts`, `src/shared/identity.ts`)
as the reference implementation.

### Transport: Socket.IO

Identity moves from a `hello` message to the Socket.IO handshake (`io(url, { auth })`).
Socket.IO replays `auth` on every automatic reconnect, so a dropped client rebinds to the
same participant with no application round trip (FR-PL-05) — which is what the prototype
did, and it removes the client-side reconnect/backoff loop entirely.

The ephemeral channel now uses `socket.volatile.emit` (DESIGN.md §2.2), so pointer and
drag traffic is genuinely dropped under backpressure rather than queued ahead of committed
events (FR-SYNC-03). The hand-rolled transport could not express that distinction.

`packages/shared/src/protocol.ts` changes: `hello` is removed from `ClientMessage`, a
`HandshakeAuth` schema is added, `SOCKET_EVENTS` names the two channels, and
`RoomCredentials` no longer carries a token.

### Server framework: Express

`DESIGN.md` §3 specifies Express; §3's "choices we deliberately did not make" listed
Fastify as a possible revisit, not a decision. Multipart upload moves from
`@fastify/multipart` to multer, and static serving to `express.static`.

### Client state: Zustand

`RoomConnection` publishes its snapshot through a Zustand vanilla store instead of a
hand-rolled listener set behind `useSyncExternalStore`.

### Guest identity: generated in the browser

The browser generates 32 bytes and sends them on create/join; the server stores only the
SHA-256 (DESIGN.md §5.1). The server no longer mints participant secrets, so it never
holds a credential it could leak.

This closes the "unknown hash → new participant" hole the proposal worried about by a
different route than server-issued tokens did: a hash is only ever written by an explicit
create or join request that carries a display name, so an unrecognised hash resolves to
nothing rather than silently creating a participant.

## What did not change

The kernel is untouched. `decide`, `reduce`, the visibility filters and the event model in
ADR 0001 are transport-agnostic and survive verbatim — which is the property that made
this affordable at all (~700 lines, five files).

zod validation is **kept**. The "TS types only" characterisation appears only in
`PROPOSAL-walking-skeleton.md` §4; `DESIGN.md` itself never asks for zod's removal. What it
does say (§3) is that Fastify's "built-in payload schema validation would directly serve
FR-GM-15 and the forged-payload tests in README §8" — it wants runtime validation and
assumed the framework would supply it. Having moved to Express, which has none, removing
zod would leave the codebase with less validation than either document asks for.

## Toolchain

pnpm is replaced by **npm workspaces** (`DESIGN.md` §7 and §9 both use npm), with
`concurrently` driving `npm run dev` as the prototype on `design` does. Raw `pg` is
replaced by **Prisma** (`DESIGN.md` §3 "PostgreSQL + Prisma", §8.3 "Prisma schema from
§4.1, with migrations"): `apps/server/prisma/schema.prisma` replaces the hand-written
`db/001_init.sql`, and `prisma/migrations/` is now the single source of schema truth.

## Consequences

- Two dependencies where there were none: `socket.io` and `socket.io-client`.
- CI gains a `prisma generate` step, since the client is code-generated.
- A fresh database needs `npm run prisma:migrate --workspace=@vtt/server` before first run.
- The asset bucket is created with a public-read policy. Objects are named by UUID and
  carry no room data; access control is at the room level, not the object level, and
  DESIGN.md §6 wants uploads served from an origin separate from the app. Without the
  policy every URL the server hands back is a 403 in the browser.
- MinIO is pulled from `quay.io/minio/minio`; the Docker Hub `minio/minio` image is no
  longer publicly pullable.
- The Vite dev proxy forwards `/socket.io` instead of `/ws`.
- Multi-instance deployment is now a Socket.IO Redis adapter away, rather than requiring a
  bespoke fan-out.
- If the team later decides the protocol does not need Socket.IO's reconnect and ack
  machinery, reverting is again a five-file change.
