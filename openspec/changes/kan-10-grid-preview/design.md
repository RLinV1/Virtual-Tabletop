# Design

## Context

The room already stores one accepted `GridSpec` and commits changes through the GM-authorized `scene.setGrid` command. The room page owns both the PixiJS board and the GM controls. KAN-65 moved Adjust grid into a native dialog in the Battle map section; the asset-library change can also copy a saved map grid into a room. This change documents the implemented KAN-10 manual calibration path and the `room-grid-calibration` behavior contract.

## Goals / Non-Goals

**Goals:**

- Show a local preview without changing the room's accepted grid or another viewer's board.
- Keep draft values usable while a numeric field is temporarily empty, and make validation explicit before Apply.
- Fit the editor into the room's existing modal UI while leaving the board visible on desktop.

**Non-Goals:**

- Automatic grid detection, inferred confidence, persisted preparation drafts or stale-revision reconciliation. Those are future work in FR-GM-03 and the broader preparation design.
- Implicitly changing a library map's stored grid when the room grid changes. Its Save grid to library action remains explicit.

## Decisions

### Keep the draft at the room-page level

`RoomPage` owns string-valued alignment fields, optional line-style fields, and the last valid preview so the modal and board can share them. `gridDraft.ts` converts accepted grid values to editable strings and validates the complete draft against `GridSpec`, including the canonical offset range, then checks the board's line-count limit. It retains the line style added on mainline and compares resolved defaults so a style-only edit can be applied without making a historical default grid look changed. This preserves an empty input while editing. Keeping a numeric draft inside the modal would lose that intermediate state or require a second synchronization path to the board.

The draft is reset when the map identity, accepted grid or viewer role changes. The identity uses grid and map values, so unrelated room events such as token movement do not discard an in-progress correction.

### Render the preview in the existing board view

`Board` passes the optional preview to `BoardView`; the renderer draws the draft with a distinct stroke and shows an unapplied label. The renderer continues using the accepted grid for token layout and movement. The preview is not sent through `RoomConnection`, and only the GM receives a non-null preview prop. This uses the existing canvas instead of adding a second overlay whose pan and zoom could drift from the map.

The renderer keys redraws by grid geometry and line style, board dimensions, missing-map state and preview mode. The GM board uses a distinct calibration stroke; the Advanced section shows the precise line style over the map inside the modal. The on-demand renderer invalidates its frame when the preview changes. Draft validation and the renderer share the same line-count limit: an excessive draft pauses the last valid preview, disables Apply, and shows the minimum cell size for the current map. The renderer keeps the guard for previously accepted or external grids.

### Apply through the existing authoritative command

The form enables Apply only for a valid changed grid. `RoomPage` sends one `scene.setGrid` command and waits for its result; success closes the modal and rejection displays the error in place. The shared `GridSpec` enforces canonical offsets at the server's command and library-update boundaries. A malformed command with a valid request ID receives a matching rejection so Apply does not wait forever. GM authorization and the existing grid event remain unchanged; no protocol or persistence shape change is needed. A library map's initial grid is already copied into the room by `scene.setMap`; later Save grid to library remains a separate request.

### Reuse the KAN-65 modal

The form stays in the Battle map section's Adjust grid dialog, now reached through the GM's Manage tab. The draft lives in `RoomPage`, while `RoomPanel` passes it to the selected Manage content and `Board` renders it beside the new tool rail. A grid-specific class places the dialog near the right edge and lightens its backdrop on desktop so the board preview remains legible. On narrow screens the dialog uses the shared centered layout. Native dialog behavior supplies focus trapping and dismissal; each close path clears the room-page draft. Switching screen widths keeps the selected tab and open dialog mounted, so an active preview remains available through the resize.

## Risks / Trade-offs

- **Dialog obscures the board on small screens** → The dialog stays scrollable and centered there; verify the correction flow at phone widths during browser review.
- **A command can finish after the user dismisses an in-flight Apply** → The command is already authoritative once sent. The Apply button and numeric inputs are disabled while waiting; browser review should check the resulting state after reconnect or dismissal.
- **Grid drawn with extremely small cells can be expensive** → The editor prevents applying drafts that exceed the renderer's line-count limit and shows the minimum usable size for the current map. The renderer retains the guard for older or external grids.

## Migration Plan

No KAN-10 data migration is needed. New commands and library updates must use canonical offsets; historical events are replayed without reparsing. The existing room command and optional line-style fields remain in use.
