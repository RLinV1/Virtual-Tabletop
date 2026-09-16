# ADR 0001 — Server-authoritative event log with per-viewer filtering

- **Status:** Proposed (team review needed before M1 feature work)
- **Context:** Same architecture as `docs/DESIGN.md` §2; differs on transport and seq source — see `docs/PROPOSAL-walking-skeleton.md` §4
- **Covers:** FR-SYNC-01..04, FR-PL-02/05/06, FR-GM-15, FR-GM-23, groundwork for FR-REC-01..03

## Decision

Room state is the fold of an append-only, per-room ordered event log.

```
client ──command──▶ server: validate (zod) → decide(state, actor, command) → append events (seq) → reduce → broadcast filtered
                                                     │
                                          reject: forbidden / not_found / invalid
```

| Concept | Where | Rule |
| --- | --- | --- |
| `Command` | `packages/shared/src/commands.ts` | A request. `noun.verb`. May be rejected. |
| `DomainEvent` | `packages/shared/src/events.ts` | A fact. `PastTense`. Never edited or deleted. Carries the value it replaced. |
| `decide` | `packages/shared/src/decide.ts` | Pure. Authorization + validation. Only the server's result counts. |
| `reduce` | `packages/shared/src/reducer.ts` | Pure. Same code on server and client. The only way state changes. |
| `filterStateForViewer` / `filterEventForViewer` | `packages/shared/src/visibility.ts` | Every payload to a player passes through these. |
| `LiveRoom` | `apps/server/src/domain/liveRoom.ts` | Per-room FIFO queue → consecutive seqs. |

### Ordering (FR-SYNC-04)
- `seq` starts at 1 per room, is gap-free, and is assigned inside the room's FIFO queue.
- Storage enforces it: `PRIMARY KEY (room_id, seq)` + `append(expectedLastSeq)` (optimistic concurrency).
- Concurrent commands are resolved by arrival order at the server. The later command is decided against
  the state produced by the earlier one (e.g. two players move the same token → last write wins, both logged).

### Sync protocol (`packages/shared/src/protocol.ts`)
1. Client connects, sends `hello { roomId, token }`.
2. Server replies `welcome { you, seq, state }` — a full **filtered** snapshot.
3. Server pushes each subsequent seq as exactly one of:
   - `event` — apply with `reduce`
   - `redacted { seq }` — viewer may not see it; advance `lastSeq` only
   - a fresh `welcome` — the viewer's visible world changed shape (e.g. token revealed/hidden)
4. Client applies only `seq === lastSeq + 1`. A gap or a reducer error → client sends `resync` → server sends `welcome`.
5. On disconnect the client reconnects with backoff and repeats from step 1 (FR-PL-05/06).

### Identity (FR-PL-02)
- Room creation and guest join return an opaque 256-bit token. The browser stores it in `localStorage`.
- The server stores only `sha256(token)` → `(roomId, participantId)`.
- Reconnecting with the same token rebinds the same participant, so token ownership is unchanged.

### Ephemeral channel (FR-SYNC-03)
Same socket, `ephemeral` messages. Relayed to other clients in the room; never persisted, no seq.
Rate-limited per socket. Still filtered (drag previews of hidden tokens are not relayed to players).

## Consequences
- Undo (FR-REC-02) becomes "append the inverse event", because every event carries its prior value.
- Activity log (FR-REC-01) is a projection over the events table.
- Checkpoints = named `seq` + snapshot; restore appends a `CheckpointRestored`-style event rather than truncating.
- Snapshot-on-reconnect is O(state) per reconnect; fine for 1 GM + 8 players. Optimize later with
  "send events since lastSeq" if benchmarks require it.
- **Single process per room.** Horizontal scaling needs sticky routing of a room to one instance.

## Open questions for the team
1. **Undo semantics with multiple users:** GM undo of the *latest* action only, or any reversible action? What if
   a later event depends on it (undo token create after it was moved)?
2. **Redaction leaks timing:** players see that *something* happened at seq N. Acceptable?
3. **Snapshot cadence:** store a snapshot every N events for fast room load (proposal: N = 200).
4. **GM auth (FR-GM-01):** Better Auth with GitHub OAuth vs. email magic links.
