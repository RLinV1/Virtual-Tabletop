# Proposal

## Why

A GM can correct a map's grid only inside a room: they must create or open a room, place the map, open Battle map → Adjust grid, apply, and then choose "Save grid to library". The README setup flow (§5, steps 3–4) expects the GM to accept or correct the grid right after upload, and the library is where uploads happen. Grid correction (FR-GM-04) should be possible while a GM is preparing assets, before any room exists.

## What Changes

- Each map the GM owns in the asset library (`/library`) gets an **Edit grid** action. It opens a modal with the grid correction form used in rooms (cell size, offsets, units per cell, nudges, line style) and a preview of the whole map.
- The preview draws the draft grid over the map image with SVG. The GM can zoom and pan to line up the grid precisely. No room, socket connection or Pixi board is involved.
- Saving writes the grid to the library asset through the existing `PATCH /api/library/:id`. Cancel or dismissing the modal discards the draft.
- Built-in example maps and token assets have no Edit grid action.
- Editing a library grid does not change any existing room. Rooms keep the grid they copied when the map was placed, and only later placements use the new grid. The editor says so.
- The server rejects a library grid whose cell size would exceed the board's line limit for that map's stored width and height. This is the same rule `decide` already applies to `scene.setMap` and `scene.setGrid`. Today `PATCH /api/library/:id` is the only write path without it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `asset-library`: adds a requirement for editing a map's grid in the library, including the renderable-grid limit on saved grids. The "Later library edits do not change the room" scenario stays unchanged.

## Impact

- `apps/server/src/http/library.ts`: `PATCH /api/library/:id` checks `canRenderGrid` against the stored asset's size before saving a grid, and responds 400 when the check fails.
- `apps/web/src/pages/LibraryPage.tsx`: Edit grid action and modal on owned map cards.
- `apps/web/src/pages/GmPanel.tsx`: `GridForm` and its line-style fields move to a separate module so the room and the library share one form. The room keeps its current wording and behavior.
- A new SVG map-and-grid preview component in `apps/web` (outside `board/`, no Pixi), and a small pure helper for grid line positions that it shares with the existing line-style preview.
- Tests: a server integration test for the limit check in `apps/server/test/library.test.ts`, and unit tests for the line-position helper in `apps/web/test`.
- No changes to `packages/shared` schemas, commands, events or visibility filters, so no ADR is needed. The library is outside the room event log, and no room state changes.
- Related: the completed but unarchived `kan-10-grid-preview` change introduced `GridForm` and the `room-grid-calibration` capability. This change reuses that form without changing the behavior it specifies.
