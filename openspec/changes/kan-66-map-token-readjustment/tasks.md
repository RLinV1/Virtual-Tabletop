# Tasks

## 1. Shared contract and geometry

- [ ] 1.1 Write `docs/adr/0012-map-token-readjustment.md` for the `scene.undoMap` and `MapSet` shared-schema changes, single-event token moves, nullable compensating map, latest-action undo, privacy, and replay compatibility; link ADR 0001 and ADR 0004. Verify the ADR explains why an inverse event rather than direct state mutation restores all three kinds of state.
- [ ] 1.2 Extend `packages/shared/src/events.ts` with optional `MapSet.tokenMoves` (`tokenId`, exact `from`/`to`) and `undoOfSeq`, and permit null `MapSet.map` only when `undoOfSeq` is present; add `scene.undoMap { targetSeq }` to `commands.ts`. Verify schema tests parse old `MapSet` JSON, parse a new replacement and a null-map inverse, and reject bare null maps, malformed moves, and sequence numbers.
- [ ] 1.3 Add a pure shared geometry helper and use it in `decide.ts` for `scene.setMap`: scale X and Y by image ratios, clamp by the resulting grid-cell footprint, center an oversized footprint, skip unchanged centers, and leave first-map token centers alone. Verify focused shared tests for proportional scaling, off-edge and negative coordinates, fractional free placement, new-grid cell size, oversized tokens, hidden tokens, and a 100-token room; assert one `MapSet` and unchanged `Token.size`.
- [ ] 1.4 Update `packages/shared/src/reducer.ts` to apply `MapSet` map, optional grid, and all named token moves in one immutable transition; keep absent `tokenMoves` as the old no-movement behavior. Verify `reduceAll` tests replay legacy events, a map replacement, and a compensating event to the exact pre-change map, grid, and floating-point centers.

## 2. Authorized compensating undo

- [ ] 2.1 Add the `scene.undoMap` decision in `packages/shared/src/decide.ts`, taking the trusted latest committed event through `DecideContext`: authorize GM first, require matching `targetSeq`, require a latest non-compensating `MapSet`, verify its after-values against current state, then emit one inverse `MapSet` with `undoOfSeq`. Verify shared tests for library grid restoration, direct-upload replacement, first placement back to null, legacy `MapSet`, player rejection, stale target, intervening event, and repeated undo with no emitted event.
- [ ] 2.2 In `apps/server/src/domain/liveRoom.ts`, cache the last authoritative committed event on load and after each append, and pass it to `decide` inside the existing FIFO command queue. Verify a server test that two concurrent requests cannot undo a stale target or append twice, and that a server restart still permits undo of the latest eligible map event.
- [ ] 2.3 Update `packages/shared/src/activityLog.ts` to describe a compensating `MapSet` as an undo and retain normal legacy map descriptions. Verify focused activity-log tests show the replacement and its compensating action as two timestamped, sequenced entries without claiming that the undo set a new map.

## 3. Player privacy and live convergence

- [ ] 3.1 Extend `filterEventForViewer` in `packages/shared/src/visibility.ts` so a player receives a filtered post-event snapshot for any `MapSet` with token moves, including undo; retain pass-through for a map event with no token moves. Verify `packages/shared/test/visibility.test.ts` covers visible and hidden moves, inverse moves, old-shape events, and filtered snapshots with no hidden IDs or coordinates.
- [ ] 3.2 Add `apps/server/test/sync.test.ts` coverage using `startServer`/`TestClient`: GM and player converge after direct-upload and library-grid map changes; the player's raw Socket.IO log never contains hidden-token IDs or old/new coordinates; revealing later shows the adjusted center. Verify with `npm test --workspace=@vtt/server -- sync.test.ts`.
- [ ] 3.3 Add a server restart/reconnect test over a shared `MemoryRoomStore`: replay both active and undone replacements, reconnect GM and player, compare authoritative map/grid/centers and player-filtered state, and reject player history access. Verify with `npm test --workspace=@vtt/server -- sync.test.ts`.

## 4. GM recovery action

- [ ] 4.1 Wire `apps/web/src/panels/ActivityLog.tsx` and its room-page caller to `RoomConnection.command`: show a plain Undo map action only on the unsearched latest non-compensating `MapSet` whose seq matches the live room, then refresh history after success or rejection and show errors. Verify a web component test or browser walk that the GM can undo after reload, stale activity hides or rejects the action, the player sees no control, and KAN-67's mode picker and confirmation are absent.
- [ ] 4.2 In `apps/web/src/board/boardView.ts`, cancel an active unsent drag and clear `pendingMoves` when an accepted scene changes before syncing authoritative token positions. Verify a focused board test or browser walk where a map replacement during a drag snaps the token to its adjusted center and releasing the pointer sends no stale move.
- [ ] 4.3 Walk an upload replacement and a library-map replacement in two browsers, undo each from Activity log, and compare the GM and player boards before replacement and after undo, including a hidden token in GM view. Verify the maps, grids, and token centers return exactly and no hidden token appears on the player board.

## 5. Review and release gate

- [ ] 5.1 Request and obtain Real-Time Architecture owner review of ADR 0012 and the shared command/event, undo, visibility, and replay diff; resolve findings. Verify the review record or PR explicitly covers backward replay and hidden-token filtering before merge.
- [ ] 5.2 Run `npm run lint && npm run typecheck && npm test` after review fixes, then `openspec validate kan-66-map-token-readjustment --strict --no-interactive`. Verify all pass and record any environment-dependent skipped tests in the implementation handoff.
