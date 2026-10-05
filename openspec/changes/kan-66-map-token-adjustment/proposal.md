# Proposal

## Why

Applying a differently sized battle map can leave tokens outside the playable image or with misaligned tactical footprints. The GM needs map, grid, and token adjustment to commit and undo together without exposing hidden positions to players (KAN-66, FR-GM-02, FR-TAC-02, FR-REC-02, FR-GM-23).

## What Changes

- Adjust all tokens against authoritative state at Apply: scale centers independently for replacement maps by default, preserve first-map positions, and bound square footprints without changing sizes in cells.
- Preserve grid intent: previously aligned tokens use the nearest fitting aligned center; off-grid tokens are not forcibly snapped. Bounds take priority when an axis has no fitting grid position.
- Support optional `scale`, `keep`, and deterministic compact `recenter` policies. Reject the whole command if any footprint, including a hidden token's, cannot fit.
- Commit one composite `MapSet` containing the effective grid pair and explicit token position changes, including an empty array. Make complete new map actions undoable; allow a nullable event map to undo first placement.
- Deliver composite map changes and inverses to players through fresh filtered snapshots. Keep legacy events and standalone grid resnapping behavior unchanged.
- Use existing private map preparation, errors, view fitting, and activity-log Undo controls. KAN-67's policy selector and confirmation UI remain deferred.

## Capabilities

### New Capabilities

- `map-token-adjustment`: bounded token adjustment policies, atomic reduction, guarded undo, compatibility, and player-safe delivery.

### Modified Capabilities

- `map-preparation`: Apply publishes one map/grid/token entry instead of separate token resnap entries, and retains the draft on footprint rejection.

## Impact

- Shared command/event schemas, pure geometry, decision/reduction, undo, visibility, and activity descriptions; existing Socket.IO append/reduce/broadcast and web preparation flows.
- Add ADR 0023. Required reviewer: Raymond Lin, Real-Time Architecture owner. Review has not been requested or received; deploy web and server together after review.
- Restore dependencies from the committed lockfile before integration verification. No event rewrite or database migration.
- Map-specific adjustment supersedes the `scene.setMap` resnap behavior in the unsynced `token-grid-snap` change; `scene.setGrid` and size-change behavior remain intact. The unrelated completed `undo-reversible-actions` change fails strict validation because its activity-log delta omits the existing “Attack roll” scenario. Preserve it and reconcile that omission before later specification consolidation or archival.
