# Design

## Context

See proposal.md for motivation. `scene.setMap` currently emits `MapSet` plus separate `TokenMoved` events when a supplied grid resnaps tokens. It does not bound footprints or provide map undo. The room queue decides against current state; the pipeline atomically appends batches, reduces them, and filters each broadcast. Checkpoint restores already replace player views through filtered snapshots. Undo uses bounded, replay-derived command history and exact current-value guards.

## Goals / Non-Goals

**Goals:** Record complete, deterministic map/grid/position changes once; preserve off-grid intent; restore exact recorded coordinates; reuse the existing pipeline and privacy rules.

**Non-Goals:** KAN-67 policy/confirmation controls, fog/template coordinate transforms, token-size changes, event rewrites, database migrations, redo, or changing standalone grid and token-resize behavior.

## Decisions

### Pure adjustment before one committed event

Extend the command with optional `tokenPolicy: scale | keep | recenter`. An omitted policy selects `scale`. Extend `MapSet` with nullable `map` and optional `tokenChanges: {tokenId, from, to}[]`. Every newly decided map event records `gridChange`, even when the command omits a grid, and `tokenChanges`, even when empty. This distinguishes complete actions from historical ones. The command still requires a map.

Authorize and validate grid rendering before geometry. Validate every token's square footprint against both new dimensions before finding positions. Reject with the token name, required footprint, and a suggestion to use a larger map, reduce cell size, or reduce token size. Compute from current queued state, never the preparation draft's token state. Emit exactly one event. Separate move events were rejected because they expose intermediate states and complicate whole-action undo and hidden-position filtering.

### Footprint bounds and preserved grid intent

With half-side `h = size * effectiveGrid.cellSize / 2`, bound centers to `[h, width-h] × [h, height-h]`. For replacement `scale`, multiply coordinates by separate new/old axis ratios; `keep` preserves candidate coordinates. Without a previous map, every policy preserves candidate coordinates. Sizes stay in cells.

Use the existing snapped predicate on the previous grid. For aligned tokens, find the nearest lattice position within each valid center interval, using the existing size-dependent grid phase and rounding. If an axis has no lattice point, clamp that axis. Free tokens only clamp. This preserves deliberate free placement and avoids snapping past an edge. Simply snapping then clamping was rejected because it can miss a nearer fitting grid point.

### Deterministic recenter with bounded work

For replacements using `recenter`, sort by token ID using deterministic string order. Each token starts at a fitting center nearest the map center, with preserved grid intent. Search the existing placement pattern: up to twenty square perimeter rings in row order, one footprint apart. Share that candidate iteration with multi-token creation while preserving its behavior. Avoid overlap with already placed square footprints; edge contact is allowed. If no candidate is free within the budget, use the valid central center even if occupied. Packing is not a rejection condition; individual oversize is. This bounds work for caller-controlled dimensions and fractional sizes.

### Reduction and permanent attack-side concealment

The reducer copies recorded map, grid, and positions without geometric calculation. Missing referenced tokens still signal a corrupt stream. Include adjusted token IDs in the fog concealment pass after the complete state change, so historical attack sides stay concealed after a later move, undo, or deletion. Fog and templates keep their existing coordinates and semantics.

### Guarded, exact undo

Only complete map events with both explicit fields enter the reversible history. Undo checks the current map, complete grid including units/style, and every adjusted token's existence and exact resulting position. It ignores other token fields and tokens absent from the change array. Invert one `MapSet` by swapping map/grid values and every `from`/`to`, then append `ActionUndone`. Do not run geometry or validate old bounds; undo may restore off-map positions or no map. Existing command grouping, conflict behavior, history bounds, and reload reconstruction remain.

### Filtered player snapshots

Composite events and inverses always request a filtered snapshot for players, including empty change arrays. GMs receive the full event. Legacy map events without nested changes continue through their existing filter. Reuse hidden-token, viewer-specific fog, attack-side, template, initiative, and history filtering. The server sends the snapshot at the composite sequence, then the inverse batch's redacted `ActionUndone` at the next sequence. No nested changes, prior positions, or command IDs reach players.

### Existing client flow and readable actions

Preparation continues to send through `RoomConnection.command`; its error handler retains the draft. Map identity changes already trigger automatic fitting. Describe set, replacement, and removal with grid and adjusted-token count in the activity log, and provide matching Undo labels. KAN-67 can send the optional policy later and read the GM event's change count without another contract change.

## Risks / Trade-offs

- Recenter crowding/search limits → permit overlap only at a valid central position; test mixed sizes, deterministic order, and exhaustion.
- Hidden data nested in composite events → players always receive filtered snapshots; assert raw socket payloads, reconnect/resync, and persisted-log replay.
- Legacy meaning changes → optional event fields distinguish new complete actions; retain historical map/move replay and non-undoability.
- Contract deployment mismatch → deploy web and server together after Raymond Lin's review. Review is not requested or received.
- Unrelated undo delta fails strict validation → preserve it; reconcile its missing “Attack roll” scenario before later spec consolidation/archive. Map adjustment supersedes only the map branch of the unsynced token-grid-snap requirements.

## Migration Plan

No storage migration or log backfill. Verify shared/server/web tests, latency benchmark, lint/typecheck/build, private upload/library Apply, oversize draft retention, and Undo. Obtain architecture review before release. Deploy web and server together. Rollback to older reducers after nullable map inverses have been persisted requires a compatible reader; do not rewrite committed events to enable rollback.
