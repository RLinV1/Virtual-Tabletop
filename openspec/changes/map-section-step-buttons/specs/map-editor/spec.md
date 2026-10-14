## MODIFIED Requirements

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

## ADDED Requirements

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
