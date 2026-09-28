# Proposal

## Why

Replacing a room's battle map currently leaves token centers at their old image coordinates. A map with different dimensions or grid can strand tokens off the board, and the existing `MapSet.previous` value cannot by itself undo the token movement KAN-66 requires.

## What Changes

- On every `scene.setMap` replacement of an existing map, proportionally scale every token center from the old image dimensions to the new ones, then clamp it so the token footprint fits where possible. Include hidden tokens. Keep `Token.size` in grid cells; the new grid determines the rendered pixel footprint.
- Commit the map, optional copied library grid, and changed token positions as **one** `MapSet` event. Players receive a filtered snapshot when that event contains token positions, so no hidden token identifier or coordinate reaches them.
- Add a GM-only, latest-action map undo command and a basic Activity log action. It appends one compensating `MapSet` that restores the preceding map, grid when changed, and exact original token centers. It also supports undoing an initial map placement back to no map. Stale or repeated undo requests are rejected without an event.
- Preserve old `MapSet` replay and filtered reconnect behavior. Add shared unit and server wire/restart coverage. Record the shared contract changes in an ADR and obtain Real-Time Architecture owner review.
- Keep GM-selectable handling modes, board refit, and the post-change confirmation with its immediate Undo affordance in KAN-67. Its later UI can call this undo command.

## Capabilities

### New Capabilities

- `map-token-readjustment`: Authoritative token geometry, privacy, replay, and scoped undo when a room map changes.

### Modified Capabilities

None. The existing `asset-library` requirement to copy a placed map's grid in one undoable action still applies; this change defines the token and actual undo behavior shared by direct uploads and library placements.

## Impact

- `packages/shared`: `scene.undoMap` command; backward-compatible `MapSet` extension, plus nullable target map for compensating first placement; pure decision, reduction, visibility, and activity-log formatting.
- `apps/server`: `LiveRoom` supplies the latest authoritative committed event to the pure undo decision inside the room queue; existing store log and snapshot paths remain the persistence and reconnect seams.
- `apps/web`: a plain GM Activity log Undo action for the most recent eligible map event. KAN-67 owns the map-handling choice and richer confirmation UI.
- No database migration or map-upload API change is expected. Schema review is required by `CLAUDE.md` and ADR 0001.
