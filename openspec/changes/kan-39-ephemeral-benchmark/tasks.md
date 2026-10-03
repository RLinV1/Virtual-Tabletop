## 1. Server: ephemeral path off the command queue

- [ ] 1.1 In `apps/server/src/ws/socket.ts`, parse each message before queueing and handle `ephemeral` at once, keeping commands and `resync` on the ordered queue; verify existing `sync.test.ts` and `chat.test.ts` still pass
- [ ] 1.2 Add `apps/server/test/ephemeral.test.ts` (`describe("ephemeral channel (KAN-39, FR-SYNC-03)")`): a ping reaches all others and not the sender, no seq is consumed, other rooms receive nothing, a hidden token's drag preview never reaches a player, and a non-owner's preview is dropped; verify with `npm test --workspace=@vtt/server -- -t "ephemeral channel"`
- [ ] 1.3 Add a test with a store whose `append` is held open by a deferred promise: a ping sent after a command reaches the other clients before that command's event; verify it fails on the old queue code and passes after 1.1

## 2. Client: coalescing sender

- [ ] 2.1 Add `preview(key, payload)` and `cancelPreview(key)` to `RoomConnection`, with leading and trailing edges per key and a 50 ms window; verify with new cases in `apps/web/test/roomConnection.test.ts` using fake timers (30 calls in 100 ms send ≤3 messages and the last carries the final value; `ephemeral()` sends at once)
- [ ] 2.2 Replace the drag throttle in `boardView.ts` so `dragPreview` goes through `connection.preview("drag:" + tokenId, ...)`, and cancel the key on drop; verify `npm run typecheck` passes and `PREVIEW_INTERVAL_MS` is gone from `boardView.ts`

## 3. Benchmark

- [ ] 3.1 Add a delaying TCP proxy helper `apps/server/test/latencyProxy.ts` (per-direction delay 50 ms ± 10 ms, order kept) and a `connect` option in `helpers.ts` that routes a client through it with the WebSocket transport only; verify a round trip through it takes ≥100 ms
- [ ] 3.2 Add `apps/server/test/ephemeralLatency.test.ts`: GM and two players behind the proxy, 100 pings and 100 drag previews at 20 per second, per-message latency recorded, p50/p95/max logged, p95 ≤150 ms asserted at each receiver, skipped when `VTT_SKIP_BENCH=1`; verify it passes locally three runs in a row
- [ ] 3.3 Define the benchmark network profile in `README.md` §6 under the Ephemeral Interaction Latency row and point to the test; verify the README renders

## 4. Verification

- [ ] 4.1 Run `npm run lint && npm run typecheck && npm test`; verify all pass
- [ ] 4.2 In Playwright with two browser contexts (GM and player), drag a token and confirm the other context's ghost follows it and ends at the drop point; take a screenshot
