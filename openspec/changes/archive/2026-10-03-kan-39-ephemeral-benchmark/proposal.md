## Why

KAN-39 (FR-SYNC-03) has three acceptance criteria. Only the first is met today.

- **Separate channel, never persisted.** Met: `ephemeral` messages are relayed by `LiveRoom.relayEphemeral`, get no seq, and never reach the store.
- **Client-side throttling/coalescing of pointer traffic.** Partly met. Token drag previews are throttled to one per 50 ms inside `boardView.ts`, but with no trailing send, so the last position before a drop is often never sent. Nothing coalesces, and every future preview (KAN-32 ruler, KAN-35 aim) would need its own copy of the throttle.
- **Latency benchmark ≤150 ms under the benchmark network profile.** Not met. There is no benchmark, the README never defines the profile, and only the dice-drop payload has an integration test.

There is also a latency bug the benchmark would expose. `apps/server/src/ws/socket.ts` handles every message from a socket through one serial promise queue, so a ping or drag preview waits behind any command still awaiting `store.append`. With Postgres that wait is a database round trip.

## What Changes

- Server: handle `ephemeral` messages as soon as they arrive, outside the per-socket command queue, so they never wait for a commit. Commands keep their ordered queue.
- Client: add one coalescing sender for ephemeral pointer traffic in `RoomConnection`. It keeps the latest payload per stream (for example per dragged token), sends at most once per 50 ms per stream, and always sends the trailing value. Pings and dice drops are one-shot and bypass it.
- Move the drag-preview throttle in `boardView.ts` onto that sender.
- Define the benchmark network profile in the README §6 NFR table: 50 ms one-way delay on each client link with ±10 ms jitter, about 100 ms RTT for a residential connection.
- Add a server benchmark test that runs a GM and two players through a delaying TCP proxy with that profile, sends 100 pings and 100 drag previews, and asserts p95 sender-to-receiver latency ≤150 ms.
- Add integration tests for `ping` and `tokenDragPreview`: relayed to everyone else, never sequenced or persisted, and a hidden token's preview never reaches players.

## Capabilities

### New Capabilities

- `ephemeral-channel`: delivery, isolation from committed state, throttling and the latency target for pings and previews.

### Modified Capabilities

None.

## Impact

- `apps/server/src/ws/socket.ts`: the ephemeral path leaves the command queue.
- `apps/web/src/net/roomConnection.ts`: new coalescing sender. `apps/web/src/board/boardView.ts` and `Board.tsx` use it.
- `apps/server/test/`: new `ephemeral.test.ts` and `ephemeralLatency.test.ts`, plus a small delaying-proxy helper.
- `apps/web/test/roomConnection.test.ts`: coalescing tests.
- `README.md` §6: benchmark profile definition.
- No change to `packages/shared` schemas, so no ADR.
- Unblocks the latency criteria of KAN-34 (pings), KAN-32 (ruler) and KAN-35 (aim preview).
