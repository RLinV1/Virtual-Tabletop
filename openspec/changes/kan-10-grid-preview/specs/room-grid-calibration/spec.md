# Spec Delta

## Purpose

Lets a GM align the active room grid to a battle map while seeing manual corrections privately on the board before accepting them for everyone in the room.

## ADDED Requirements

### Requirement: GM can correct the active room grid
The GM SHALL be able to open Adjust grid from the Battle map controls and edit the accepted cell size, horizontal and vertical offsets, and distance per cell. The form SHALL identify the alignment as manual. Pixel nudge controls SHALL adjust cell size and offsets in one- and five-pixel steps. Players SHALL NOT see the editing control.

#### Scenario: Open manual correction
- **WHEN** the GM opens Adjust grid
- **THEN** the form shows the room's accepted grid values and identifies confidence as manual

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
