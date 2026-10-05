# ADR 0023: Atomic token adjustment when applying a map

**Status:** Proposed — Raymond Lin's Real-Time Architecture review has not been requested or received.
**Owner:** Real-Time Architecture (Raymond Lin) · **Ticket:** KAN-66 · **Change:** `openspec/changes/kan-66-map-token-adjustment`
**Amends:** ADR 0004 (map/grid action), ADR 0013 (undo), ADR 0016 (fog filtering)

## Context

Map preparation is private until Apply, but replacing a map can leave tokens outside the image. Map-specific grid resnapping currently produces separate `TokenMoved` events. A complete map action needs deterministic footprint adjustment, atomic state delivery, and exact undo while preserving hidden data and historical replay.

## Decision

### Command and event contract

`scene.setMap` gains optional `tokenPolicy: "scale" | "keep" | "recenter"`; the command still requires a map. `MapSet.map` becomes nullable for inverse first-map placement. `MapSet` gains optional `tokenChanges: Array<{ tokenId, from, to }>`.

Every newly generated map event includes `gridChange: { grid, previous }` and `tokenChanges`, including an empty array. If the command omits a grid, record the current effective grid on both sides. Both fields identify a complete reversible map action; omission retains legacy semantics.

### Geometry and atomicity

Authorize the GM and validate the grid before computing changes from the current authoritative state in the room queue. Before any placement, verify every token's square tactical footprint (`size * effectiveGrid.cellSize`), including hidden tokens, fits both dimensions. Reject the entire command with the offending token and corrective options if it cannot fit; append nothing.

Replacement defaults to scaling token centers independently by new/old width and height. `keep` preserves candidate coordinates. With no previous map, all policies preserve candidates. Constrain centers to `[h, width-h] × [h, height-h]`, where `h` is half the footprint. Only tokens aligned on the previous grid are resnapped to the nearest fitting aligned position. Bounds take priority on axes without a fitting lattice point. Token sizes in cells stay unchanged.

Replacement `recenter` visits tokens in stable string ID order, searching outward from valid central positions with the same bounded square-ring pattern as multi-token placement, avoiding prior footprints. Twenty rings bound candidate work. Crowding or exhaustion falls back to a valid central position, permitting overlap. Individual oversize still rejects.

Emit one composite `MapSet` through the existing append/reduce/broadcast pipeline. Reduction copies recorded map, grid, and positions; it never runs geometry. The post-reduction fog concealment pass includes the adjusted token IDs so unowned tokens entering fog permanently conceal historical attack sides. Fog and templates retain their coordinates and visibility rules.

### Guarded exact undo

Only complete new events are reversible through the existing bounded, replay-derived command history. Undo checks the current map and complete applied grid (including style/units), and every adjusted token's existence and exact `to` position. Unrelated fields and unadjusted tokens do not block or get overwritten. Conflicts reject without append.

Undo appends one inverse `MapSet`, swapping maps, grids, and every `from`/`to`, followed by `ActionUndone`. Restore exact coordinates without resnapping, bounding, or revalidating old geometry. This can restore off-map positions or a null first map. Existing command IDs, append-only semantics, and history bounds remain.

### Visibility and client behavior

GMs receive the full committed event. Players receive a fresh filtered snapshot for every composite event and inverse, even with an empty change array. Reuse current token/fog/attack-side/initiative/template/history filtering. Nested changes, prior positions, and server command IDs never reach players. The snapshot advances to the map event's sequence; the inverse's `ActionUndone` advances players through a redacted next sequence.

Existing upload/library preparation, error retention, automatic view fitting, and Activity log Undo remain the client flow. Activity descriptions include map/grid and adjusted count; inverse first placement describes removing the map. KAN-67 will add the selector and post-change confirmation, sending `tokenPolicy` through `RoomConnection.command` and using the GM event's change count.

## Compatibility and delivery

- No database migration, event rewrite, or backfill. Optional fields preserve legacy parsing and replay. Historical `MapSet` plus `TokenMoved` batches retain recorded effects and non-undoability.
- This supersedes only map-specific resnapping in the unsynced `token-grid-snap` change. Standalone `scene.setGrid` and size-change behavior remain unchanged.
- Deploy web and server together after architecture review. Older clients do not reduce nested positions, and older schemas do not understand a nullable map inverse. Rollback after inverses are persisted needs a compatible reader; committed events must remain intact.
- The completed unrelated `undo-reversible-actions` change currently fails strict validation because its activity-log delta omits “Attack roll.” Preserve it; reconcile that omission before later specification consolidation or archival.

## Alternatives considered

- Separate map and move events: more intermediate states, multiple log entries, and hidden-position filtering complexity.
- Snap then clamp: can miss a nearer fitting aligned position. Choose within the valid lattice interval instead.
- Force undo after concurrent edits: overwrites newer state. Keep value-based conflict guards.
- Reject recenter crowding: a room can contain more footprints than simultaneous free space. Permit bounded central overlap while enforcing individual fit.
