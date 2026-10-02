# room-grid-calibration

## Purpose

Lets a GM align the active room grid to a battle map while seeing manual corrections privately on the board before accepting them for everyone in the room.

## Requirements

### Requirement: GM can correct the active room grid
The GM SHALL be able to open Adjust grid from the Battle map controls and use the shared two-click sample editor to align the grid. Cell size, horizontal and vertical offsets, pixel nudges, and line style SHALL be available under Advanced. Distance per square and its unit label SHALL remain visible. Players SHALL NOT see the editing control.

#### Scenario: Open manual correction
- **WHEN** the GM opens Adjust grid
- **THEN** the editor previews the room's accepted grid values and awaits anchor A

#### Scenario: Nudge an offset
- **WHEN** the GM uses a positive or negative offset nudge
- **THEN** the draft offset changes by the selected pixel step and stays within one cell by wrapping at its edge

#### Scenario: Player views the room
- **WHEN** a player views the room
- **THEN** the player has no Adjust grid control

### Requirement: Draft changes preview only for the GM
When the GM enters a valid grid different from the accepted grid, the board SHALL draw that grid in a visually distinct style and label it as an unapplied preview. The draft SHALL remain local to that GM's browser and SHALL NOT update room state, send an event or ephemeral message, or change what players see. Token interactions SHALL continue to use the accepted grid until application succeeds.

The draft SHALL retain any accepted grid line colour, thickness, and opacity. Editing those fields in Advanced SHALL use the same local draft and Apply action, with a true-style preview over the map inside the modal.

#### Scenario: Valid edit previews locally
- **WHEN** the GM changes the cell size from its accepted value to another valid value
- **THEN** the GM sees a distinct grid and an unapplied-preview label, while a connected player continues to see the accepted grid

#### Scenario: Draft does not move tokens
- **WHEN** the GM previews a different grid while tokens are on the board
- **THEN** those tokens keep their accepted positions and sizes

#### Scenario: Draft returns to accepted values
- **WHEN** the GM edits the draft back to the accepted grid values
- **THEN** the distinct preview and its label disappear

#### Scenario: Edit line style during calibration
- **WHEN** the GM changes line colour, thickness, or opacity in Advanced
- **THEN** the modal preview updates locally, Apply becomes available, and the accepted style remains visible to players until Apply succeeds

### Requirement: Invalid drafts cannot be applied
The form SHALL accept incomplete text while the GM edits it, but SHALL disable Apply for an empty or invalid value. Cell size SHALL be greater than zero and at most 2000 pixels and SHALL not exceed the board renderer's line-count limit for the current map; distance per cell SHALL be positive; each offset SHALL be at least zero and less than the cell size. An invalid edit SHALL leave the last valid preview visible and show a correction message. The shared grid schema SHALL reject noncanonical offsets in room commands and library updates.

#### Scenario: Clear a numeric field
- **WHEN** the GM clears the cell-size field while editing
- **THEN** Apply is disabled, no command is sent, and the last valid preview remains visible

#### Scenario: Offset reaches a cell size
- **WHEN** the GM enters an offset equal to the cell size
- **THEN** Apply is disabled and the form explains the valid offset range

#### Scenario: Cell size exceeds the line-count limit
- **WHEN** the GM enters a positive cell size that would draw more lines than the board's limit
- **THEN** Apply is disabled, the last valid preview remains visible, and the form states the minimum cell size for the current map

#### Scenario: A client bypasses the form with a noncanonical offset
- **WHEN** a client sends a grid command with an offset equal to or greater than its cell size
- **THEN** the server rejects that command and does not change the accepted grid

### Requirement: Dismissal discards the uncommitted grid
Before application, activating Cancel or dismissing the Adjust grid modal SHALL clear its draft and preview without changing the accepted room grid. A new map, a newly accepted grid, or loss of the GM role SHALL also invalidate an existing preview.

#### Scenario: Cancel a preview
- **WHEN** the GM previews a different grid and selects Cancel
- **THEN** the modal closes, the board returns to the accepted grid, and no grid command is sent

#### Scenario: Dismiss with Escape
- **WHEN** the GM previews a different grid and presses Escape
- **THEN** the modal closes, the preview clears, and focus returns to Adjust grid

#### Scenario: Map changes during a draft
- **WHEN** the active map changes while a grid draft exists
- **THEN** the draft and preview are discarded rather than shown over the new map

### Requirement: Apply commits only a valid changed grid
Apply SHALL be available only for a valid grid that differs from the accepted grid. Activating it SHALL request one authoritative room grid change. On success, the modal SHALL close and the accepted grid SHALL become visible to all room participants. If the server rejects the change, the modal SHALL remain open and show the rejection reason.

#### Scenario: Apply a correction
- **WHEN** the GM applies a valid changed grid
- **THEN** the room commits one grid change, the modal closes, and GM and player boards show the accepted correction

#### Scenario: Server rejects a correction
- **WHEN** the server rejects an Apply request
- **THEN** the modal stays open with the error shown and the accepted grid remains unchanged

#### Scenario: No-op correction
- **WHEN** the draft matches the accepted grid
- **THEN** Apply is disabled and no grid change is requested

### Requirement: Two-click sample anchors
The shared room/library editor SHALL qualify stationary clicks or taps on pointer release with at most 6 CSS pixels of movement. The first click SHALL place A in image coordinates and seed an interior-facing provisional square from the current cell size and 1×1, 3×3, or 5×5 sample count. Hover or the next touch press SHALL preview B locally without updating the form draft. The second click SHALL finalize B using the dominant-axis square constraint, all four quadrants, image-edge clamping, fractional pixels, and canonical offsets. Placement and pointer resizing SHALL snap the grid cell side to the nearest 0.5 image pixels unless Shift is held for freeform fractional placement. Cell-side snapping SHALL preserve all quadrants and image bounds, choosing the largest fitting snapped side at an edge. X/Y offsets from anchor placement and adjustment SHALL snap to 0.5 image pixels, with Shift preserving freeform offsets. Offset snapping SHALL translate the sample to the nearest fitting grid phase, preserve spacing, and keep its handles aligned with the preview; converting a freeform sample MAY slightly shift A even when resizing B. Stored snapped cell size and offsets SHALL be exact despite floating-point coordinate transforms. Only valid finalized geometry SHALL update the form draft; invalid candidates SHALL retain the last valid grid and allow retry.

#### Scenario: Pause between anchors
- **WHEN** the GM places A, pauses, blurs the window, or navigates the camera
- **THEN** A remains placed and the next qualified map click can finalize B

#### Scenario: Preview an opposite corner
- **WHEN** the GM hovers over the map after placing A
- **THEN** the editor previews a square and full-map grid without changing the draft, sending traffic, or changing a player's board

#### Scenario: Snapping and freeform placement
- **WHEN** the GM places or pointer-resizes B without Shift
- **THEN** the cell size is a multiple of 0.5 image pixels, including for 3×3 and 5×5 samples

#### Scenario: Hold Shift for fractional placement
- **WHEN** the GM holds Shift while placing or pointer-resizing B
- **THEN** the editor preserves freeform fractional cell size and updates the preview to match

#### Scenario: Snapped offsets on placement and movement
- **WHEN** the GM places or repositions an anchor without Shift
- **THEN** X/Y offsets are exact multiples of 0.5 image pixels, remain less than the cell size, and match the sample handles within image bounds

#### Scenario: Move a fractional grid with snapped offsets
- **WHEN** the GM repositions A on an existing fractional-cell sample without Shift
- **THEN** its spacing is preserved and both anchors translate to a fitting half-pixel canonical grid phase

### Requirement: Live advanced geometry readouts
During valid provisional placement or anchor repositioning, the Advanced cell size and X/Y fields SHALL display the same geometry as the editor preview, including half-pixel snapping and Shift freeform behavior. These temporary readouts SHALL NOT update the confirmed draft, change save eligibility, send traffic, or affect player views. A valid placement click or keyboard confirmation SHALL copy the geometry into the local draft; only Apply or Save grid SHALL persist it.

Cancellation, capture loss, pointer departure, blur, navigation, resizing, Start over, and invalid preview geometry SHALL restore the confirmed draft values. Pending A and completed samples SHALL remain recoverable according to the existing placement rules. Focusing a geometry field or its nudge controls SHALL clear the temporary preview and give numeric editing precedence. Hover and modifier changes SHALL NOT replace focused or typed text, including an empty or invalid value; numeric edits SHALL continue to invalidate anchors. Accessible help SHALL distinguish temporary preview values from confirmed draft values.

#### Scenario: Inspect provisional values
- **WHEN** the GM places A and moves the pointer to preview B, or selects an anchor and previews a reposition
- **THEN** the Advanced fields match the editor preview without changing the confirmed draft, save eligibility, network traffic, or player board

#### Scenario: Interrupt a live readout
- **WHEN** the GM interrupts a valid provisional preview by cancellation, blur, pointer departure, or navigation
- **THEN** the map and Advanced fields return to the confirmed draft while pending A or completed anchors remain available for retry

#### Scenario: Numeric editing takes precedence
- **WHEN** the GM focuses a numeric geometry field and clears or types a value while the pointer moves over the map
- **THEN** the temporary preview clears, the field retains the typed text, and existing numeric validation controls saving

#### Scenario: Save during an unconfirmed preview
- **WHEN** the GM activates Apply while a provisional hover readout differs from the confirmed draft
- **THEN** only the valid confirmed draft is submitted through the existing save path

### Requirement: Select and adjust anchors
Visible handles and labeled Select A and Select B controls SHALL select completed anchors, including small or overlapping samples. Clicking another anchor SHALL switch selection. A subsequent qualified map click SHALL reposition the selected anchor and clear selection after success. A SHALL translate both anchors with spacing preserved and boundary clamping; B SHALL change spacing with A fixed before any translation required by offset snapping. Changing sample count SHALL reinterpret the same bounds only after validation. Accessible status and help SHALL communicate the placement stage and selection. Start over SHALL clear anchors, selection, provisional preview, and placement errors while retaining the last valid draft, camera, sample count, units, and style.

#### Scenario: Reposition A
- **WHEN** the GM selects A and clicks a new map location
- **THEN** both anchors translate within image bounds and cell spacing stays unchanged

#### Scenario: Reposition B
- **WHEN** the GM selects B and clicks a new map location
- **THEN** valid new square spacing updates the draft, with any required offset snapping translating both anchors together

### Requirement: Navigation and keyboard placement
Anchor dragging SHALL be removed. Movement above 6 CSS pixels SHALL pan and suppress placement for the entire gesture. Pan mode, Space-drag, and the middle mouse button SHALL always navigate. Two active touch pointers SHALL suppress placement until all fingers lift; pinch zoom SHALL attach the starting midpoint to its map point, subject to camera limits. Cancellation, lost capture, pointer departure, window blur, camera changes, and resizing SHALL clear transient gestures and cursor previews without clearing completed anchors or pending A. Wheel zoom and Fit map SHALL preserve placement.

Enter on the focused map SHALL place A at the view center; arrows SHALL adjust provisional B, and Enter SHALL confirm its current visible candidate or recoverable keyboard corner. Focused or selected A SHALL translate by 1 image pixel. Normal B arrows SHALL change each grid cell by 0.5 image pixels regardless of sample count, with directional snapping from existing fractional spacing; Shift SHALL retain freeform 10-image-pixel sample-side adjustments. A SHALL stay fixed when resizing a sample already using half-pixel geometry. Canonical offsets MAY change as spacing changes to keep A on a grid intersection; the Advanced fields SHALL match the rendered geometry and explain the offset wrapping. Arrows otherwise SHALL pan the camera. Explicit numeric geometry edits SHALL invalidate anchors; units and style edits SHALL preserve them.

Keyboard adjustment of a focused handle or A/B control SHALL select that anchor. Enter from the map, a handle, or an A/B control SHALL confirm a valid visible candidate or retain the latest keyboard-adjusted sample, clear selection and temporary preview state, and focus the map. This SHALL work while Pan is enabled, without submitting the form or resnapping a confirmed freeform sample. Invalid candidates SHALL retain selection and allow retry. Subsequent hover SHALL NOT change confirmed geometry until an anchor is selected again; Apply/Save grid SHALL persist the confirmed draft through the existing API.

#### Scenario: Swipe instead of tap
- **WHEN** a pointer travels more than 6 CSS pixels and returns to its starting point before release
- **THEN** the gesture navigates and places no anchor

#### Scenario: Multi-touch navigation
- **WHEN** two fingers pan or pinch and lift one at a time
- **THEN** no release places an anchor and a later single-finger tap can place one

#### Scenario: Keyboard-only setup
- **WHEN** the GM focuses the map, presses Enter, adjusts B with arrows, and presses Enter again
- **THEN** a valid square sample is finalized without a pointer gesture

#### Scenario: Keyboard resizing with multiple sample cells
- **WHEN** the GM adjusts B with normal arrows in a 3×3 or 5×5 sample
- **THEN** each cell changes by 0.5 pixels, the Advanced values match the displayed grid, and A remains on its fixed intersection

#### Scenario: Confirm a keyboard adjustment
- **WHEN** the GM adjusts A or B with arrows, presses Enter, and moves the pointer toward Apply
- **THEN** selection clears without a command, geometry stays unchanged during hover, and Apply submits the keyboard-adjusted draft

#### Scenario: Confirm a freeform adjustment
- **WHEN** the GM adjusts B with Shift held, releases Shift and presses Enter
- **THEN** selection clears without rounding the confirmed fractional spacing or offsets
