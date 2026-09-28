# Design

## Context

See `proposal.md` and `specs/map-token-readjustment/spec.md`. `scene.setMap` currently emits one `MapSet { map, previous, gridChange? }`; `reduce` changes `scene` only. `Token.position` is a board-image-pixel **center** and `Token.size` is in grid cells. `BoardView.drawToken` already derives its radius from `size * grid.cellSize`, so no pixel-size field needs migration. A library pick supplies `grid`; a direct upload does not. `LiveRoom` decides and commits inside a per-room FIFO queue, then broadcasts through `filterEventForViewer`; reconnect and resync send `filterStateForViewer` snapshots. Stored logs replay through `reduceAll`. The existing test claiming `MapSet` is undoable constructs an inverse event in memory; no undo command or UI action exists.

`CLAUDE.md` and ADR 0001 require append-only compensating events, prior values, pure `decide`/`reduce`, server authorization, and filtering of every player payload. ADR 0004 established a single `MapSet` for map plus copied grid. The canonical `asset-library` spec calls a library map placement undoable; its scenario currently describes intended behavior rather than a working command.

## Goals / Non-Goals

**Goals:** Keep replacement and compensation each at one sequence number; preserve original floating-point centers exactly on undo; use the existing room queue, event store, history, and filtered snapshot seams. Make the scoped undo invocable by a GM rather than leaving only inverse data in the log.

**Non-Goals:** General undo of arbitrary actions, redo, undoing a map action after another persistent action, visual map refit, or a mode selector. KAN-67 owns the GM's keep/scale/recenter choice and immediate confirmation with Undo. It can reuse `scene.undoMap`.

## Decisions

### D1. Scale centers, then clamp for the resulting grid

In a pure shared helper called from the `scene.setMap` decision, use the old and new `MapImage` dimensions: `scaledX = oldX * newWidth / oldWidth` and likewise for Y. Compute `half = token.size * (command.grid ?? state.scene.grid).cellSize / 2` for each axis. If `2 * half <= extent`, clamp the scaled center to `[half, extent - half]`; otherwise use `extent / 2` on that axis. Calculate every token, including hidden tokens, and include only changed positions in the event. Keep `Token.size`, token identity, ownership, and other fields untouched. On an initial placement (`state.scene.map === null`), emit no token moves because no old image dimensions exist. Do not snap to a grid line: the old position may be a deliberately free placement, and snapping would discard relative placement.

The footprint bound uses the square's full edge rather than the renderer's disc radius (`edge / 2 - 2`), so it conservatively keeps the token on the image. When the footprint is larger than the image, physical containment is impossible without changing the token's size; midpoint is the stable exception.

### D2. Extend `MapSet` rather than emit `TokenMoved` events

Extend the shared event schema with optional `tokenMoves: Array<{ tokenId: Id; from: Point; to: Point }>` and optional `undoOfSeq: positive safe integer`. Keep both optional so old stored `MapSet` JSON replays unchanged. The `from` values meet invariant 6 and support exact compensation; the `to` values make replay deterministic. `scene.setMap` still yields exactly one event, regardless of token count. `reduce` updates the map, optional grid, and each named token position in one immutable state transition; a referenced missing token is a corrupt stream error, consistent with its current `required` behavior. The shared decision constructs unique token IDs from `state.tokens`, so new events cannot contain duplicates through the command path.

Change only the **event** `MapSet.map` to `MapImage.nullable()` so the inverse of the first placement can restore no map. The client `scene.setMap` command continues to require a map. `MapSet.previous` remains nullable. Require `undoOfSeq` when the event's `map` is null; the server's undo decision is the only producer of that shape. Update `formatActivity` so a compensating event says that the map action was undone, rather than claiming a map was set. No database migration is required; the event store persists JSON. A separate `TokenMoved` per token would consume many seqs and expose a partially adjusted scene between events.

### D3. Use the room's latest committed event as the authoritative undo target

Add `scene.undoMap { targetSeq }` to `Command`. `LiveRoom` already loads every committed event for replay; retain its last committed event when loaded and update that cache after each commit. Inside the same FIFO queue as ordinary commands, pass it through `DecideContext` to pure `decide`. The command checks GM role first, then requires the latest event to be a `MapSet` at `targetSeq` with no `undoOfSeq`. This target check rejects a stale UI, an intervening token move or other committed action, and a repeated undo without rewriting history. The server never trusts a client-supplied map, grid, token list, or inverse event. For legacy `MapSet` events the absent `tokenMoves` simply mean none to reverse.

Build one compensating `MapSet`: `map = target.previous`, `previous = target.map`; reverse `gridChange` only if the target had one; reverse each `tokenMoves` entry (`from = original.to`, `to = original.from`); set `undoOfSeq = targetSeq`. Validate that the current map, relevant grid, and moved token positions still match the target's after-values before accepting, so even a malformed historical event cannot produce a misleading inverse. Because the target is the latest committed event, this check is normally trivial. The inverse is appended, reduced, and broadcast by the existing `LiveRoom.commit` path. A broader undo policy after interleaved player actions needs a separate conflict rule and is outside this scoped command.

### D4. Deliver a player-safe snapshot for map events with token deltas

`filterEventForViewer` currently passes every `MapSet` raw. For a player, return `resync` when `tokenMoves` is nonempty, including for compensation. `LiveRoom.broadcast` then sends a `welcome` containing the **post-event** `filterStateForViewer` state and the new seq. That existing filter removes hidden tokens, and the player never receives raw `from`, `to`, or hidden token IDs. A `MapSet` without token moves remains safe to pass, preserving legacy behavior. The GM receives the complete event. The Activity log endpoint is GM-only and uses the same filter; player requests are denied. Snapshot reconnect already uses the state filter, so no transport protocol change is needed.

### D5. Put a plain Undo action on the latest eligible Activity log entry

The GM Activity log already returns committed events with their seq and has room credential gating. Show an Undo map action only when its unfiltered, newest entry is a `MapSet` without `undoOfSeq`, the entry's seq equals the live room seq, and no actor search hides newer actions. Send `scene.undoMap { targetSeq: entry.committed.seq }` through `RoomConnection.command`; on success refresh the log, and on rejection show the server error and refresh. The server check remains authoritative if another action wins the race. This works after a browser reload because eligibility comes from history, and it supplies KAN-66's actual undo path. KAN-67 can add a more prominent post-change affordance using the same command. No change to history response schema or REST route is needed.

### D6. Drop stale local drags when the accepted scene changes

`BoardView.syncTokens` currently leaves a dragged token or a `pendingMoves` token at its local container position even after authoritative state changes. In `BoardView.update`, detect a changed accepted `scene` reference before syncing (both `MapSet` and `GridSet` replace it), cancel the active token drag, and clear pending move overlays so `syncTokens` places tokens from the new state. A pointer release after cancellation sends no stale drop. This is visual and transient; it does not mutate `RoomState`. A move command already sent before replacement can still commit later under the current last-write-wins policy, and then behaves like any other subsequent token move.

## Risks / Trade-offs

- **[Another persistent action lands before Undo]** → The latest-only rule rejects the request and preserves that action. The Activity log hides the old Undo control and displays a rejection if the click raced the newer action. Broader conflict semantics require a separate product decision.
- **[A very large token roster enlarges one `MapSet`]** → Store only changed token centers, not full tokens; verify a representative 100-token replacement and replay. The current room token count has no contract cap.
- **[A token exceeds the new image in one dimension]** → Center it on that axis, keep its grid-cell size, and document that its full footprint cannot fit.
- **[Old event JSON has no token moves or grid change]** → Optional fields preserve old replay; unit and restart tests cover old and new shapes.
- **[An unfiltered event leaks hidden positions]** → Force player snapshot delivery whenever token deltas exist, assert against raw socket payloads, and keep the GM-only history route gated.
- **[A player is dragging when the map changes]** → Cancel the unsent drag and local pending display on accepted-scene change. A move already queued at the server can commit after the map; the latest-action undo rule then refuses to overwrite it.

## Migration Plan

1. Add the schema and reducer support before or with any producer of adjusted `MapSet` events. Keep old fields optional and the old event meaning unchanged.
2. Add the undo command, server latest-event context, filtering, history text, and UI in the same release. No backfill or database schema change is needed.
3. Verify replay against legacy and new logs, including a server restart. Rollback must not run an older server against logs containing adjusted `MapSet` events: its reducer would ignore `tokenMoves` and reconstruct incorrect token positions. Retain the compatible reducer during any rollback, or repair affected rooms through a forward deploy.
