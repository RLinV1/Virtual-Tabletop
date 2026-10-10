## Why

Two gaps in the full-screen map editor (`map-editor`) showed up in use:

- **The map is too small.** The canvas shares the screen with the dialog's title bar, the step tabs, padding on every side and a 20 rem side panel, so the map appears shrunk. The GM's board shows the map at close to full size; the editor should feel like that board view, with setup tools around it.
- **Fog can't be made there.** Fog is a map-setup job as much as walls are: the GM hides rooms before the table arrives. Today it is only on the board's Fog tool and the Manage tab's keyboard section, so setting up a map means leaving the editor. `map-editor` listed fog as a non-goal; this change reverses that.

## What Changes

- **More map.** The editor keeps its layout (a steps bar and a side panel) but gives the canvas nearly the whole window:
  - The dialog's separate title bar merges into the steps bar, so the editor has one header row.
  - Padding around the body and between header and canvas shrinks.
  - The side panel narrows and, on wide screens, overlays nothing: it stays beside the canvas but is slimmer.
  - Each step shows the map fitted to the canvas, with no extra frame, and the canvas fills the remaining height.
- **Fog step.** The steps become **Map**, **Grid**, **Walls**, **Fog**. The Fog step shows the map with its current fog as the GM sees it, and offers:
  - **Rectangle:** drag to fog a rectangle.
  - **Polygon:** click corners, close on the first corner or with Enter.
  - **Reveal:** click a fogged region to remove it.
  - **Pan** and wheel zoom, as in Walls.
  - **Fog whole map**, fog a block of cells, and the list of fogged regions with Reveal, shared with the Manage tab's Fog of war section.
- **Shared canvas.** The wall canvas's camera, zoom, pan and pointer-to-map mapping move into a shared map canvas that both the Walls and Fog steps use.

## Non-goals

- No changes to commands, events, room state or visibility. Fog uses the existing `fog.add` and `fog.remove`; the server still rejects fog from anyone but the GM.
- The board's Fog tool and the Manage tab's Fog of war section stay. The board tool is for fog during play, and the section is the pointer-free route (FR-GM-17).
- No new fog shapes, no fog undo changes (the activity log's existing undo applies).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `map-editor` (introduced by the in-flight `map-editor` change): the canvas gets the window; a fourth step, Fog, is added. This change adds requirements to it. If `map-editor` is archived first, the "steps follow the setup order" requirement should be modified at sync time to list Fog.

## Impact

- `apps/web`: new `pages/mapEditor/MapCanvas.tsx` (extracted from `WallCanvas.tsx`) and `FogSetup.tsx`; `WallCanvas.tsx` becomes a thin layer on `MapCanvas`; `FogPanel.tsx` splits into the section wrapper and a reusable `FogControls`; `GmPanel.tsx` (steps, header); `ui/Modal.tsx` gains an option to omit its title bar, or the editor sets its own; styles.
- `apps/web/test`: the editor tests from `mapEditorWalls.test.tsx` extend to the Fog step and cover the canvas size.
- `packages/shared`, `apps/server`: none.
- Docs: `docs/DESIGN.md` map editor notes; `guide.ts` text.
