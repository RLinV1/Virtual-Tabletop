# Proposal — Walking Skeleton (`vincent/walking-skeleton`)

**Author:** Vincent Chen · **Status:** For team review — not for merge as-is
**Base:** `design` @ `8a4ef17` · **Relates to:** [`DESIGN.md`](DESIGN.md) §8 Slice 0 (workspace split), Slice 3 (Pixi board), Slices 1 & 4 (join UX, panels)

---

## 1. What this branch is

A runnable, end-to-end slice built on the same architecture as `DESIGN.md`: server-authoritative room kernel, monotonic per-room `seq`, server-side visibility filtering, full snapshot on reconnect, append-only events carrying undo data.

It is offered as **reference material** for Slice 0/1/3/4, not as a replacement for decisions in `DESIGN.md`. Where it deviates from the documented stack (§4 below), those are open questions for the owners — mainly Raymond (real-time architecture) and Antonio (board) — not changes being pushed through.

On this branch the single-package prototype in `src/` is replaced by the workspace layout `DESIGN.md` §8 already plans. `design` itself is untouched.

## 2. Run it

```bash
corepack enable pnpm      # once
pnpm install
pnpm dev                  # server :3001, web :5173
pnpm lint && pnpm typecheck && pnpm test
```

Open http://localhost:5173 → create a room → copy the invite link. To be a player on the same machine, open the link in a private window or with `127.0.0.1` instead of `localhost` (different origin → separate `localStorage` identity).

## 3. What works

| Area | Behavior | Requirement | DESIGN.md §10 today → here |
| --- | --- | --- | --- |
| Layout | `apps/web`, `apps/server`, `packages/shared` (pnpm workspaces) | Slice 0 | — → done |
| Rooms & join | Create room (creator is GM), invite link, guest join with no account | FR-PL-01 | D → P |
| Identity | Opaque token in `localStorage`, server stores SHA-256 only; reload/reconnect rebinds same participant and role | FR-PL-02, FR-PL-05 | P → P |
| Resync | Full filtered snapshot on connect; client detects `seq` gaps / reducer errors and requests a resync | FR-PL-06 | P → P |
| Ordering | Per-room FIFO queue → gap-free `seq`; store rejects appends on seq mismatch | FR-SYNC-01, FR-SYNC-04 | P → P |
| Authorization | Owner-only token moves, GM-only admin commands, checked per message; hidden tokens answer `not_found` (no existence leak) | FR-GM-14, FR-GM-15, FR-PL-04 | P → P |
| Visibility | Hidden tokens stripped from snapshots; events about them sent to players as `redacted {seq}`; reveal/hide forces a fresh snapshot | FR-GM-16, FR-GM-23 | P → P |
| Map | Upload PNG/JPEG/WebP (GM only, type + size checked), rendered as board | FR-GM-02 | D → P (local disk, not MinIO) |
| Grid | Manual cell size / offset / units form; grid in board coordinates | FR-GM-04 (manual path), FR-GM-05 | D/~ → ~/P |
| Tokens | Create, delete, assign owner, hide/reveal from GM panel | FR-GM-08 (partial), FR-GM-10 | D/~ → ~/P |
| Board | PixiJS v8, per-viewer pan/zoom, drag with grid snapping (Alt = free), auto-fit | FR-TAC-01, FR-TAC-02 | D/~ → P |
| Ephemeral | Pings (double-click) and live drag previews; relayed, rate-limited, never persisted, filtered for hidden tokens | FR-SYNC-03, FR-TAC-05 | D → ~ |
| Events | Every change is a `PastTense` event carrying the replaced value (`from`, `previous`, deleted entity) | FR-REC-03 groundwork | D → ~ |

**Tests:** 11 unit tests over the pure kernel (`packages/shared/test`) and 7 multi-client integration tests over real WebSockets (`apps/server/test/sync.test.ts`): convergence, forbidden moves, 20 concurrent commands → gap-free seqs, no hidden-token bytes in player payloads, reconnect after missed events, GM stays GM after reconnect, bad token refused.

**Not here:** Postgres/Redis/MinIO (in-memory store behind a `RoomStore` interface; target SQL in `apps/server/db/001_init.sql`), GM accounts (FR-GM-01), auto grid detection, Playwright, undo UI, everything else in M2/M3.

## 4. Deviations from DESIGN.md — for discussion

| Topic | DESIGN.md | This branch | Why it was done this way | Cost to switch to DESIGN.md |
| --- | --- | --- | --- | --- |
| Realtime transport | Socket.IO | Plain `ws` | Ordering, resync, and redaction are our own protocol (`packages/shared/src/protocol.ts`), so Socket.IO's reconnect/acks overlapped with it. | Small: transport is isolated in `apps/server/src/ws/socket.ts` and `apps/web/src/net/roomConnection.ts`. Message shapes stay. |
| Server framework | Express (Fastify "revisit", §3) | Fastify | Schema validation + `@fastify/websocket`/multipart; §3 already names Fastify as the likely revisit. | Small: `app.ts` + `http/routes.ts`. |
| Package manager | npm | pnpm workspaces | Workspace split (Slice 0) with `workspace:*` links. | Small: npm workspaces work the same way. |
| Validation | TS types only | zod schemas for every command/event/wire message | Forged-payload tests (README §8) need runtime validation. | — |
| Guest token origin | Browser generates 32 bytes (§5.1) | Server issues token on join/create | Server controls when a participant row is created (join form with display name); no "unknown hash → new participant" path to abuse. | Small: resolution logic is the same hash lookup. |
| Seq source | Redis `INCR` | In-process FIFO queue + store-level `expectedLastSeq` check | Single process for now; the store check is what a Postgres `UNIQUE (room_id, seq)` would enforce. | Medium once multi-instance is needed. |
| Client state | Zustand | `useSyncExternalStore` over `RoomConnection` | Not needed yet at this size. | Small. |
| Agent workflow | OpenSpec (`/opsx:*`) | Adds `CLAUDE.md` invariants, `implement-fr` skill, `sync-reviewer` / `visibility-auditor` subagents alongside OpenSpec | Reviewers encode the invariants from `DESIGN.md` §2/§6. | Keep, drop, or fold into OpenSpec `config.yaml` rules. |
| UI palette | Slate-teal / parchment / gold (`assets/ui-reference`) | Neutral dark | Not yet applied. | Styling only. |

## 5. Mapping from the prototype on `design`

| `design` prototype | Here |
| --- | --- |
| `src/shared/protocol.ts` | `packages/shared/src/{state,commands,events,protocol}.ts` |
| `src/shared/room.ts` `applyIntent` | `packages/shared/src/decide.ts` (authorize/validate → events) + `reducer.ts` (apply) |
| `src/shared/room.ts` `filterForParticipant` | `packages/shared/src/visibility.ts` (`filterStateForViewer`, `filterEventForViewer`) |
| `src/shared/identity.ts` `resolveParticipant` | `apps/server/src/domain/credentials.ts` + `store/roomStore.ts` credential lookup |
| `src/shared/*.test.ts` | `packages/shared/test/*` + `apps/server/test/sync.test.ts` (GM-reload case ported) |
| `src/server/index.ts` | `apps/server/src/{app,index}.ts`, `ws/socket.ts`, `domain/liveRoom.ts` |
| `src/client/useRoom.ts` | `apps/web/src/net/roomConnection.ts` + `net/identity.ts` |
| `src/client/Board.tsx` (DOM) | `apps/web/src/board/boardView.ts` (Pixi) + `Board.tsx` |

## 6. Questions for the team

1. **Transport:** keep Socket.IO per DESIGN.md, or adopt the transport-agnostic protocol here on `ws`? (Raymond)
2. **Layout:** use this branch as the starting point for Slice 0's workspace split, or cherry-pick pieces into a split done from `design`?
3. **Board:** is this Pixi board a useful base for Slice 3, or should Antonio start clean (and run the 100-token benchmark first)?
4. **Redaction:** players learn *that* something happened at seq N (not what). Acceptable? (`docs/adr/0001-event-model.md`)
5. **Guest token origin:** client-generated (DESIGN.md §5.1) or server-issued (here)?
6. **Agent tooling:** keep the `CLAUDE.md` invariants and reviewer subagents next to OpenSpec?
