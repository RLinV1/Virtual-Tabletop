# Proposal

## Why

KAN-43/44/49 (FR-GM-06/07/12) need interoperable UVTT scenes with strict validation and no partially published maps. PR #94 supplies editable walls; KAN-66 supplies atomic map/grid/token application and guarded undo.

## What Changes

- Prepare and edit validated UVTT files privately, with GM-bound expiring revisions; publish only through Apply.
- Preserve the existing typed door/window contract; extend walls with separate GM-only UVTT metadata and source, endpoint/metadata editing, open/closed movement blocking, and full-value undo guards.
- Replace image, grid, geometry and fog through one composite MapSet, adjusting current tokens and filtering player snapshots.
- Export the applied map with safe private asset resolution, integer grid spacing and supported geometry.
- Bound parsing, image decoding, uploads, diagnostics and draft retention. Preserve legacy event replay.

## Capabilities

### New Capabilities

- `uvtt`: Validation, private preparation APIs, coordinates and applied-scene export.
- `map-walls`: Extend the merged wall/editor foundation with editable generic portals and full-value geometry.
- `map-editor`: Extend the merged wall/editor foundation with private UVTT draft geometry and download controls.
- `room-undo`: Extend the existing pending undo capability with composite geometry and wall edits.

### Modified Capabilities

- `map-preparation`: Atomic image/grid/walls/token publication and cancellation of UVTT preparations.

## Impact

Shared schemas, decision/reduction/filtering/undo, LiveRoom queue, authorized REST routes, bounded worker threads, AssetStore, and React map editor. Adds server runtime image decoding. No new database migration. Reconcile main ec9aa66 (merged #94/#99) with KAN-66/KAN-67 b7a8ba1. ADR 0042 records the prerequisite and ADR 0041 records these extensions; both require Raymond Lin's review. Preserve accepted ADR 0030 doors/windows, locking and player controls. Dynamic LoS and persistent scenes (KAN-83) remain separate. Deploy web/server together; rollback readers must understand new events.
