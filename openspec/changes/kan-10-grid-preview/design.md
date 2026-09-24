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

`RoomPage` owns string-valued draft fields and the last valid preview so the modal and board can share them. `gridDraft.ts` converts accepted grid values to editable strings and validates the complete draft against `GridSpec`, including the canonical offset range. This preserves an empty input while editing. Keeping a numeric draft inside the modal would lose that intermediate state or require a second synchronization path to the board.

The draft is reset when the map identity, accepted grid or viewer role changes. The identity uses grid and map values, so unrelated room events such as token movement do not discard an in-progress correction.

### Render the preview in the existing board view

`Board` passes the optional preview to `BoardView`; the renderer draws the draft with a distinct stroke and shows an unapplied label. The renderer continues using the accepted grid for token layout and movement. The preview is not sent through `RoomConnection`, and only the GM receives a non-null preview prop. This uses the existing canvas instead of adding a second overlay whose pan and zoom could drift from the map.

The renderer keys redraws by grid geometry, board dimensions, missing-map state and preview mode. A line-count guard prevents very small valid cell sizes from producing an unbounded draw loop.

### Apply through the existing authoritative command

The form enables Apply only for a valid changed grid. `RoomPage` sends one `scene.setGrid` command and waits for its result; success closes the modal and rejection displays the error in place. The server already enforces GM authorization and emits the existing grid event, so KAN-10 needs no protocol or persistence change. A library map's initial grid is already copied into the room by `scene.setMap`; later Save grid to library remains a separate request.

### Reuse the KAN-65 modal

The form stays in the Battle map section's Adjust grid dialog. A grid-specific class places the dialog near the right edge and lightens its backdrop on desktop so the board preview remains legible. On narrow screens the dialog uses the shared centered layout. Native dialog behavior supplies focus trapping and dismissal; each close path clears the room-page draft.

## Risks / Trade-offs

- **Dialog obscures the board on small screens** → The dialog stays scrollable and centered there; verify the correction flow at phone widths during browser review.
- **A command can finish after the user dismisses an in-flight Apply** → The command is already authoritative once sent. The Apply button and numeric inputs are disabled while waiting; browser review should check the resulting state after reconnect or dismissal.
- **Grid drawn with extremely small cells can be expensive** → The renderer caps line generation and does not draw a grid that exceeds its line-count threshold.

## Migration Plan

No data migration is needed. The change is client-side and uses the existing room command and grid schema. Reverting the UI changes restores the prior editor without changing stored room data.
