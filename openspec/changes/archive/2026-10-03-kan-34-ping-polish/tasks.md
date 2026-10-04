## 1. Server

- [x] 1.1 In `LiveRoom.relayEphemeral`, drop a `ping` that fails `onMap(this.state.scene.map, payload.at)`; verify with 1.2
- [x] 1.2 Add `describe("target pings (KAN-34, FR-TAC-05)")` to `apps/server/test/sync.test.ts`: a ping reaches the GM and the other player but not the sender; the next command gets the very next seq; a reconnecting client's `welcome` and the activity log contain nothing from it; an off-map ping and a no-map ping are never delivered (send a valid ping after each and assert it is the first one received, as the dice-drop test does); verify with `npm test --workspace=@vtt/server -- -t "target pings"`

## 2. Web

- [x] 2.1 Add a pure `pingPulse(t, reducedMotion)` returning `{ radiusCells, alpha }` or `null` once expired, and make `showPing` use it with `this.reducedMotion`; verify with `apps/web/test/ping.test.ts`: radius grows with t without reduced motion, stays constant with it, alpha falls to 0, and the pulse returns `null` at t ≥ 1 (1.2 s)
- [x] 2.2 Run `npm run typecheck` and `npm run lint`; verify both pass

## 3. Verification

- [x] 3.1 Run `npm run lint && npm run typecheck && npm test`; verify all pass
- [x] 3.2 In Playwright with a GM context and a player context, double-click the map as the player and confirm the GM sees the pulse at the same map point at a different zoom; emulate `prefers-reduced-motion: reduce` on the GM context and confirm the ring does not grow; take screenshots
- [x] 3.3 After KAN-39 merges, confirm its latency benchmark reports ping p95 ≤150 ms and link the result on the KAN-34 ticket
