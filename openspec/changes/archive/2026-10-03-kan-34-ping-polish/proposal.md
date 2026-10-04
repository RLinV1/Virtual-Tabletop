## Why

KAN-34 (FR-TAC-05, Target Pings) is mostly built. A double-click on the board sends a `ping` over the ephemeral channel, and every other client draws an expanding ring that fades out after 1.2 s. Nothing is persisted. Three gaps remain against the ticket and the project rules:

- **No tests.** No test anywhere sends a `ping`. "Never persisted or written to the event log" is true in the code but nothing guards it.
- **No latency evidence.** The ≤150 ms NFR has no measurement. KAN-39 adds the shared ephemeral benchmark, which measures pings, and this change depends on it for that criterion.
- **Edge cases the dice drop already handles.** The server relays a ping anywhere, even off the map or in a room with no map, while `diceDrop` rejects those (ADR 0014). The pulse also animates under `prefers-reduced-motion`, which the condition effects (KAN-76) already respect.

## What Changes

- Server: drop a `ping` whose point is off the map or sent when the scene has no map, using the existing `onMap` check.
- Web: under reduced motion, show a ping as a static ring that fades out over the same 1.2 s, with no expansion.
- Web: pull the ring's radius and alpha over time into a pure function so expiry is unit-tested.
- Tests: server integration tests for the ping path and web unit tests for the pulse.
- Playwright check with two browser contexts.
- The ≤150 ms latency criterion is met by KAN-39's benchmark, which includes pings. This change links to it and adds nothing duplicate.

## Capabilities

### New Capabilities

- `target-pings`: what a ping shows, who sees it, how long it lasts, and what the server refuses.

### Modified Capabilities

None.

## Impact

- `apps/server/src/domain/liveRoom.ts`: an `onMap` check for `ping` in `relayEphemeral`.
- `apps/web/src/board/boardView.ts`: `showPing` uses the pure pulse function and the reduced-motion flag.
- `apps/web/src/board/effects.ts` (or a new `ping.ts`): the pulse function.
- New tests in `apps/server/test/` and `apps/web/test/`.
- No change to `packages/shared` schemas, so no ADR.
- Depends on KAN-39 for the latency measurement. It can merge before KAN-39, but the ticket closes only after both.
