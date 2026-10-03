## Context

Ephemeral messages share the socket's single `message` event with commands. `socket.ts` chains every message onto one promise (`queue = queue.then(...)`) so commands commit in the order sent. The ephemeral branch is synchronous, but it still waits its turn behind any pending `room.submit`, which awaits `store.append`. The relay itself (`LiveRoom.relayEphemeral`) already does the right things: no seq, a permission check for drag previews, hidden-token filtering, and `volatile` delivery except for dice drops (ADR 0014).

On the client, `boardView.ts` throttles drag previews with a leading-edge check (`now - lastPreview > 50`). There is no trailing send.

## Goals / Non-Goals

**Goals:**
- Ephemeral latency bounded by the network, not by commit time.
- One reusable client sender that later previews (ruler, AoE aim) plug into.
- A repeatable, CI-safe benchmark that proves the 150 ms target.

**Non-Goals:**
- New ephemeral payload types. KAN-32 and KAN-35 add those.
- Measuring committed-event latency (the separate ≤500 ms target).
- Real WAN testing. The profile is simulated.

## Decisions

### 1. Branch on message type before queueing
Parse the message first. If it is `ephemeral`, handle it at once. Otherwise chain it onto the queue as today. Parsing is synchronous and cheap, so moving it ahead of the queue does not change command ordering.

*Alternative:* a second Socket.IO event name for ephemeral traffic. It would also work, but it changes `SOCKET_EVENTS` in `packages/shared` (a schema change needing an ADR) for no extra benefit.

### 2. Coalescing sender in `RoomConnection`
`connection.preview(key, payload)` stores the latest payload per key. A key with no send in the last 50 ms flushes immediately (leading edge). Later calls within the window replace the stored payload, and a timer flushes it at the window's end (trailing edge). `connection.ephemeral(payload)` stays as the one-shot path. Keys are strings such as `drag:<tokenId>`, so a later ruler or aim stream gets its own budget.

*Alternative:* keep throttling inside each board feature. Rejected: duplicated logic, and the missing trailing edge is exactly this kind of bug.

### 3. Benchmark through a delaying TCP proxy
A small Node `net` proxy sits between each test client and the server. It forwards each chunk after a delay drawn from 50 ms ± 10 ms per direction, keeping chunk order within a direction. Clients use the WebSocket transport only (no polling upgrade), so the proxy carries one long-lived connection. The receiver records `performance.now()` in its handler. Sender and receivers run in one process, so they share a clock. The test reports p50, p95 and max, and asserts p95 ≤150 ms.

*Alternative:* `tc netem`. It is not available on Windows dev machines or in plain CI containers.

### 4. Profile numbers
50 ms one-way per client link gives about 100 ms of network time from sender to receiver (two links). That leaves 50 ms for server and client processing. With ±10 ms jitter, the worst network-only path is 120 ms.

## Risks / Trade-offs

- [The benchmark is flaky on a loaded CI runner] → Assert on p95, not max. Allow skipping with `VTT_SKIP_BENCH=1`, and run it in the normal suite otherwise.
- [An ephemeral message overtakes a command sent just before it] → Acceptable and intended. A drag preview has no ordering relation to commits, and the drop itself is a command.
- [The trailing flush fires after the token was dropped] → Cancel the key's pending flush when the drag ends. The receiver's ghost already expires after 600 ms, and the committed `TokenMoved` replaces it.
