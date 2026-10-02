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

## KAN-09 two-click anchors (2026-09-30)

`MapGridPreview` separates durable placement (awaiting A, awaiting B, placed, repositioning A/B) from seed/keyboard geometry, cursor previews, and pointer gestures. Frontend-only transitions in `gridSampleInteraction.ts` commit geometry only after a qualified release or valid keyboard adjustment. `gridSample.ts` keeps dominant-axis square geometry, fractional image coordinates, canonical offsets, edge clamping, and existing draft validation. A translates both anchors; B changes spacing before any translation needed for offset snapping. Reposition previews keep committed handles stationary so they remain selectable. Labeled selection controls support overlapping handles. Count changes reinterpret the same sample bounds after validation.

A click or tap travels at most 6 CSS pixels. Exceeding the threshold permanently turns that gesture into pan. Pan mode, Space and middle-button presses always navigate; two touch pointers suppress placement until all lift. Pinch zoom uses the original midpoint map coordinate and current screen midpoint, with the existing camera limits. Capture cancellation, departure, blur, external camera changes and resize discard transient input without discarding A or completed anchors. Start over preserves the last valid form draft and camera. Numeric field edits invalidate anchors even while temporarily invalid; units and style edits preserve them.

The provisional square and full-map preview stay inside the editor and send no draft callback. Existing room/library Apply, dismissal, scene/asset/accepted-grid/role resets, duplicate-submit guards, failed-save retry and upload/setup flows remain in place. No shared schema, database or save API changes are needed. Physical Safari/Chromium trackpad testing is a separate manual check; the original drag interruption cause remains unconfirmed.

### Half-pixel cell-size snapping

Placement and pointer resizing snap the cell side to the nearest 0.5 image pixels by quantizing the sample side in multiples of `count × 0.5`. The cell-side calculation keeps A fixed before applying offset snapping; Shift retains freeform coordinates. At a boundary, the side is capped at the largest fitting snapped value. Holding Shift disables quantization and immediately updates hover/press previews; release reads the current modifier, so freeform applies when Shift is held at commit. Enter confirmation of a pointer preview follows the same modifier; confirmation of a committed keyboard adjustment preserves that geometry. Normal B arrows use 0.5-pixel cell steps; Shift retains freeform 10-pixel sample-side adjustment. Changing sample count still reinterprets the same bounds rather than moving anchors.

A frontend-only exact side value travels with the sample, so adding a snapped side to fractional A coordinates does not turn an exact half-pixel cell size into a floating-point remainder in the form or saved grid. Translation and count reinterpretation retain that exact side. No sample metadata enters the save API.

### Half-pixel X/Y offset snapping (2026-10-01)

Anchor placement and adjustment now snap both canonical offsets to 0.5 image pixels unless Shift is held. Initial A snaps within image bounds; finalized placement and reposition previews translate the whole sample to the nearest fitting snapped phase of its cell size. This keeps both handles on the displayed grid rather than rounding only the saved values. Existing fractional cell spacing is preserved when moving A, including at reverse-quadrant boundaries. Converting a freeform sample to snapped offsets can slightly translate A during B resizing; Shift retains precise freeform coordinates.

The phase search considers the nearest grid periods and sample bounds on each axis, so both corners stay inside the image. Canonical offsets are normalized to exact half pixels at draft conversion, including zero near a floating-point period boundary. Keyboard anchor adjustments apply the same offset snapping unless Shift is held. A retains its 1/10 image-pixel translation steps; normal B arrows now use half-pixel cell steps. Numeric editing and sample-count reinterpretation retain their existing validation and geometry behavior.

### Live Advanced geometry values (2026-10-02)

`MapGridPreview` exposes a temporary preview callback separate from the valid confirmed-draft callback. `GridForm` uses temporary geometry only to display cell size and offsets, with accessible help identifying unconfirmed values. Validation, nudges, save eligibility and submitted payloads continue to use the string-valued confirmed draft. Hover sends no room command, ephemeral message, or library request and cannot affect a player board.

An explicit active-preview flag distinguishes the durable seed/keyboard corner from transient visible geometry. Cancellation, capture loss, pointer departure, blur, navigation, resizing, Start over and invalid attempts clear visible temporary geometry and readouts, but retain recoverable pending A/completed placement and the keyboard corner. Hover, a new touch press, or provisional keyboard adjustment resumes the preview. A valid click/keyboard confirmation transfers geometry into the draft.

Focusing numeric fields or their nudge controls immediately displays confirmed values, clears temporary geometry, and suppresses pointer previews while focus remains in that group. Numeric typing retains incomplete text and invalidates anchors as before. Returning focus to the map explicitly permits new previews; units/style editing retains its existing behavior.

### Keyboard resizing and Enter confirmation (2026-10-02)

The previous B arrow path moved the sample side by one image pixel and divided by its cell count. That produced thirds for 3×3 samples and fifths for 5×5, bypassing normal cell-size snapping. Normal B arrows now move to the adjacent half-pixel cell value in the arrow's quadrant direction, scaling the whole side by the sample count. Shift preserves the previous freeform 10-image-pixel sample-side steps. Default half-pixel samples keep A fixed; canonical offsets still change as spacing changes because they are the remainder of A's image coordinates within one cell. Advanced explains this wrapping and continues to show actual geometry rather than rounding just the text.

Keyboard adjustment selects the focused anchor. Enter handles the map, SVG handles and selection controls consistently: a valid active cursor candidate commits locally; otherwise a frontend confirm transition retains the keyboard-adjusted sample and clears selection without another draft callback or snapping pass. Focus returns to the map so a focused handle cannot immediately adjust again after deselection. Enter prevents native button activation/form submission, handles Pan mode, and preserves invalid-selection retry. Pending B uses the visible cursor candidate when active or its durable keyboard corner after interruption. Hover over a completed unselected sample cannot change its geometry. Existing Apply/Save requests continue to submit only confirmed draft values.

### PR #66 review corrections (2026-10-02)

Pending B now retains a complete sample, including its exact side and count, instead of only a corner that was reconstructed and quantized on each render. Arrow adjustment starts from the displayed candidate when active. After interruption, it uses the recoverable seed/keyboard sample. Count reinterpretation and Shift keyboard adjustments survive Enter without changing the bounds. Pointer previews and untouched seeds still respond to the current Shift modifier; placing only A with Shift does not bypass default B snapping after Shift is released. Confirming a pending sample uses the same draft validation as placement. Enter also consumes activation on focused unselected handles and A/B controls, leaves selection cleared and returns focus to the map, including in Pan mode.

A library upload started before opening an editor can finish during that editor's PATCH request and replace its target. Editor cleanup now releases its save lock, and late request completion is guarded by the originating editor's lifetime. Successful obsolete saves still refresh the asset list, but cannot close a reopened editor (even for the same asset), unlock a newer save or display errors there.
