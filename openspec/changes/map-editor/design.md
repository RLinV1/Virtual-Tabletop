# Design

## Context

Map setup is currently spread across several places:

- `MapSection` in `GmPanel.tsx` owns the upload and library buttons, the Prepare map modal (`prep-sheet`, built on `GridForm`) and the Edit grid modal.
- `WallsPanel` is its own Manage section.
- The `wall-editing` change added a Walls tool to the board's rail.

`Modal` wraps the native `<dialog>`, so stacking, focus return and Escape already work.

## Decisions

### D1. A full-screen `<dialog>`, not a route

The editor is a `Modal` with a `map-editor` class that fills the viewport. It is not a route. The room's socket, state and grid-draft preview stay mounted, which keeps the existing "preparation does not interrupt the room" behaviour. The pickers and the discard confirmation keep stacking as they do today. A route would remount the room and reconnect.

### D2. Steps share the editor's HUD

- **Header:** "Edit map", the step tabs (a `tablist`; a step needing an applied map is still selectable but explains itself) and Close.
- **Body:** the step's content.
- **Map step:** a summary of the current map, Upload map and From library.
- **Grid step:** `GridForm` for the draft (`Apply map`) or for the room (`Apply grid`, `Save grid to library`), unchanged.
- **Walls step:** `WallSetup`, a canvas plus a side panel.

The MapSection draft state (`prep`, discard confirmation, upload generation) moves into the editor unchanged, so `map-preparation` behaviour stays the same. Applying a draft moves to the Walls step, where the upload's automatic detection has usually finished.

### D3. Wall canvas in SVG

`WallCanvas` is React and SVG, like `MapGridPreview`. CLAUDE.md keeps Pixi for the board.

- **Drawing:** the map is an `<image>` with walls as `<line>`s in board coordinates (invariant 8) and a viewBox camera. The wheel zooms around the pointer. Space-drag, middle-drag, or the Pan mode pans. Fit resets the view.
- **Modes:** Draw, Erase and Detect like this behave as the `wall-editing` board tool did. Draw snaps ends to a grid corner or to an existing wall end within 12 screen pixels, and Alt places freely. Erase highlights the wall within 10 screen pixels and a click removes it. Detect like this sends the clicked point.
- **Shared helpers:** `closestOnSegment`, `wallAt` and `wallPoint` stay in `board/tools.ts`.

### D4. Availability

`WallDetections.availability()` returns `{ available, reason? }`:

- No queue: unavailable ("not set up on this server").
- A queue but `getWorkersCount()` is 0: unavailable ("the vision worker isn't running").
- The answer is cached for 10 seconds.

`GET /api/wall-detection/availability` returns it. It holds no room data, so it needs no credential. The Walls step fetches it on open and greys out the detect controls with the reason.

The POST route keeps its 503 for a GM who acts on a stale answer.

### D5. Removing the board's Walls tool

These come out: `BoardTool` `walls`, the rail entry, the `boardView` input handling, `Board`'s callbacks and hints, and `RoomPage`'s `onDetectWalls`. The wall layer that draws applied walls for the GM stays.

## Risks / Trade-offs

- **Two editors for one grid:** the editor's Grid step and the board's grid preview overlay both exist. The overlay stays as it is.
- **Worker count:** BullMQ counts connected workers by Redis client name. If a worker's client name isn't recognised, the server reports detection unavailable even though jobs would run. This is verified against the Python worker in the end-to-end run.
