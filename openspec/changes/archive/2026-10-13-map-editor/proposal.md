## Why

Setting up a battle map now spans three things: the image, its grid, and its walls. They are spread across a sidebar section, two modals (Prepare map, Edit grid), a Walls section, and a Walls tool on the board's rail. Wall editing needs room to zoom in on a map, and it belongs with the other setup steps, not on the board the table plays on. The GM asked for map management to be its own screen with its own HUD. They also asked that the app run without automatic wall detection set up, with the controls that need it shown as unavailable.

## What Changes

- **Edit map screen.** Manage › Battle map gets one **Edit map** button. It opens a full-screen editor over the room with its own HUD: a header with the steps **Map**, **Grid** and **Walls**, a large map canvas, and a side panel for the step's controls. The room stays connected underneath; closing the editor returns to the table.
  - **Map:** upload an image or choose one from the library. A new map is a private draft until applied (unchanged `map-preparation` behaviour), and choosing one moves to Grid.
  - **Grid:** the existing grid editor, for the draft map (Apply map) or the room's current map (Apply grid).
  - **Walls:** the wall canvas with Draw, Erase and Detect like this, plus automatic detection with its preview, Apply and Clear. This replaces the board's Walls tool and the Manage tab's Walls section.
- **Board.** The Walls tool leaves the tool rail; the GM's board still draws applied walls.
- **Detection is optional.** `GET /api/wall-detection/availability` says whether the server can detect walls: Redis is configured and a vision worker is connected. When it can't, Detect walls and Detect like this are shown disabled, with the reason. Hand-drawn walls, and everything else, work as before.

## Non-goals

- Fog editing stays on the board, where the GM uses it during play.
- No changes to commands, events or room state.

## Capabilities

### New Capabilities
- `map-editor`: the Edit map screen, its steps, and how wall detection's availability shows in it.

### Modified Capabilities
- None in `openspec/specs`. `map-preparation` behaviour is kept as is: drafts stay private, Apply publishes map and grid together, and Cancel discards. Only its host changes, from a modal sheet to the editor's Map and Grid steps. The in-flight `wall-editing` change moves its tool into the editor's Walls step.

## Impact

- `apps/web`: new `pages/mapEditor/` (`MapEditor.tsx`, `WallCanvas.tsx`, `WallSetup.tsx`); `GmPanel.tsx` (MapSection becomes a summary and the Edit map button; the Walls section is removed); `WallsPanel.tsx` folded into `WallSetup.tsx`; the Walls tool is removed from `ToolRail.tsx`, `Board.tsx`, `boardView.ts` and `RoomPage.tsx`; `guide.ts` text; styles.
- `apps/server`: `GET /api/wall-detection/availability`; `WallDetections.availability()` counts queue workers.
- `packages/shared`: `WallDetectionAvailability` schema.
- Docs: `WALL-DETECTION.md`, `DESIGN.md`.
