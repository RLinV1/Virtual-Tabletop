## Why

The GM picks a grid line colour, thickness and opacity in the Grid step, but the map editor's Walls and Fog steps draw the grid in a fixed faint white. While placing walls or fog the GM sees a different grid from the one they set and from the one on the board, and on some maps the white lines are hard to see.

## What Changes

- The map editor canvas draws the grid with the room's grid line style (colour, thickness, opacity) in every step, using the same style the board uses.
- A grid with no style set still looks as it does on the board today: black, 1 pixel, 35% opacity.
- The thickness slider gains a sixth preset, Heavy at 8 board pixels, the most the saved grid format already allows. No schema change.
- No command, event or state change.

## Capabilities

### Modified Capabilities
- `grid-line-style`: the style shows in the editor's Walls and Fog steps, and thickness goes up to 8 px.

## Impact

- `apps/web/src/pages/mapEditor/MapCanvas.tsx`, `apps/web/src/pages/GridForm.tsx` (preset names), `packages/shared/src/geometry.ts` (`GRID_LINE_WIDTHS` constant only; the `GridSpec` schema and its 8 px limit are unchanged).
- Verified in the browser on the Walls and Fog steps; web tests still pass.
