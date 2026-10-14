# map-editor Specification

## Purpose
Gives the GM one full-screen place to set up a battle map (its image, its grid and its walls), separate from the board the table plays on.

## Requirements

### Requirement: Map setup opens as its own screen
When the room has a map, Manage › Battle map SHALL offer the GM four controls: Change Map, Edit Grid, Manage Walls and Manage Fog. Players SHALL NOT see them. Each SHALL open the same full-screen editor, on the Map, Grid, Walls or Fog step respectively. The editor SHALL have its own header, step navigation, a map canvas and a side panel. When the room has no map, Manage › Battle map SHALL offer Upload map and, with a library, From library instead. Opening and closing the editor SHALL NOT disconnect the GM or trigger a resync. Closing it SHALL return focus to the control that opened it.

#### Scenario: Open the editor
- **WHEN** the room has a map and the GM presses Manage Walls
- **THEN** a full-screen editor opens on the Walls step, and the room keeps updating behind it

#### Scenario: Each control opens its own step
- **WHEN** the GM presses Change Map, Edit Grid or Manage Fog
- **THEN** the editor opens on the Map, Grid or Fog step respectively, and the other steps are still reachable from its step navigation

#### Scenario: No map yet
- **WHEN** the room has no map
- **THEN** Manage › Battle map offers Upload map and From library, and none of the four step controls

#### Scenario: Close the editor
- **WHEN** the GM opens the editor with Manage Fog and closes it with nothing unsaved
- **THEN** the board is shown again and focus is on Manage Fog

### Requirement: The editor's steps follow the setup order
The Map step SHALL offer uploading an image and choosing one from the library. A chosen image SHALL become a private draft and the editor SHALL move to the Grid step to align it, with Apply map publishing both. With no draft, the Grid step SHALL edit the room's current grid. The Walls step SHALL need an applied map, and SHALL say so when there is none.

#### Scenario: New map end to end
- **WHEN** the GM uploads an image in the Map step, aligns the grid, and presses Apply map
- **THEN** the table shows the new map and grid, and the editor offers the Walls step

#### Scenario: Walls before a map
- **WHEN** the room has no map and the GM opens the Walls step
- **THEN** the step asks the GM to apply a map first

### Requirement: Walls are edited in the editor's Walls step
The Walls step SHALL show the map with its walls, and offer Draw, Erase and Detect like this, plus automatic detection with its preview, Apply walls and Clear walls. The board's tool rail SHALL NOT offer a Walls tool. The GM's board SHALL still draw applied walls.

#### Scenario: Erase a false wall
- **WHEN** the GM chooses Erase in the Walls step and clicks a wall on the canvas
- **THEN** that wall is removed from the room

### Requirement: The app runs without wall detection
The server SHALL report whether it can detect walls: a queue is configured and at least one vision worker is connected. When it cannot, Detect walls and Detect like this SHALL be shown disabled with the reason. Drawing and erasing walls, and everything else, SHALL work.

#### Scenario: No Redis or no worker
- **WHEN** the app runs without Redis, or with no wall worker connected
- **THEN** the Walls step shows detection as unavailable, its detect controls are disabled, and Draw and Erase still work

### Requirement: The editor works on phones and tablets
The editor SHALL fit the viewport at phone, tablet and desktop sizes with its close button visible. On narrow or portrait screens the canvas SHALL sit above the side panel, and the panel SHALL scroll on its own instead of pushing the canvas off-screen. Every editor control SHALL be at least 44 by 44 CSS pixels. On the wall canvas, a two-finger pinch SHALL zoom about the fingers' midpoint and a two-finger drag SHALL pan in every mode. A single-finger tap SHALL do the mode's action, and a single-finger drag SHALL pan in Pan mode.

#### Scenario: Pinch while drawing
- **WHEN** the GM is in Draw mode on a phone and pinches the wall canvas
- **THEN** the canvas zooms about the pinch midpoint and no wall is added

#### Scenario: Phone portrait
- **WHEN** the GM opens the Walls step at 390 by 844
- **THEN** the canvas shows above the tools, the tools panel scrolls, and the close button stays reachable

### Requirement: Leaving a step with unsaved changes asks
When the GM chooses another step in the editor while the current step has unsaved changes, the editor SHALL ask whether to save, discard, or keep editing before switching. Unsaved changes are walls or fog that differ from the room, grid edits to the room's current map that differ from its grid, or a draft map. A draft map SHALL only be asked about when leaving the Map and Grid steps for another step. Save SHALL use the existing save for that kind of change (Save changes, applying the grid, or Apply map) and SHALL switch only if it succeeds. If it fails, the editor SHALL stay on the current step and show why. Save SHALL be unavailable, with the reason shown, when the grid is not valid. Discard SHALL drop those changes and switch. Keep editing SHALL stay on the current step with the changes kept. Step changes the editor makes itself SHALL NOT ask. Closing the editor with unsaved grid edits to the current map SHALL ask the same way.

#### Scenario: Walls to Fog with unsaved walls
- **WHEN** the GM draws a wall in the Walls step and chooses the Fog step
- **THEN** the editor asks Save, Discard or Keep editing, and stays on Walls until the GM chooses

#### Scenario: Save then switch
- **WHEN** the GM chooses Save in that prompt
- **THEN** the wall is sent to the room and the editor shows the Fog step

#### Scenario: Discard then switch
- **WHEN** the GM chooses Discard in that prompt
- **THEN** nothing is sent, the wall is gone from the draft, and the editor shows the Fog step

#### Scenario: Keep editing
- **WHEN** the GM chooses Keep editing in that prompt
- **THEN** the editor stays on the Walls step with the drawn wall still in the draft

#### Scenario: Grid changes when switching
- **WHEN** the GM changes the cell size in the Grid step and chooses the Walls step
- **THEN** the editor asks, and Save applies the new grid to the room before showing Walls

#### Scenario: Uploading goes from Map to Grid without asking
- **WHEN** the GM uploads a map in the Map step, or chooses the Grid step while a draft map is open
- **THEN** the editor shows the Grid step without asking

#### Scenario: Draft map before Walls
- **WHEN** a draft map is open and the GM chooses the Walls step
- **THEN** the editor asks, Save applies the map with its grid and shows Walls, and Discard drops the draft map and shows Walls for the room's current map

#### Scenario: Nothing unsaved
- **WHEN** the GM switches steps with nothing unsaved
- **THEN** the editor switches without asking

#### Scenario: Closing with grid changes
- **WHEN** the GM changes the grid of the current map and closes the editor
- **THEN** the editor asks Save, Discard or Keep editing instead of silently dropping the change
