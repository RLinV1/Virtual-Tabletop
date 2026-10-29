## ADDED Requirements

### Requirement: The editor has a Sight step
The room's map editor SHALL have a fifth step, "5 · Sight", after Fog. It SHALL need an applied map, and SHALL say so when there is none. It SHALL offer the room's Line of sight switch and a Sight range control with Unlimited and a distance in the grid's units (a number field with the unit label beside it, and a slider in whole squares styled like the editor's other sliders). Both SHALL be part of the editor's draft: they reach the room only with Save changes, Discard drops them, and leaving the step with unsaved changes asks as the other steps do. The step SHALL preview the draft for a chosen player: the map darkened outside that player's sight, computed from the room's walls and the draft settings. The library map editor SHALL NOT have this step.

#### Scenario: Set a range and save
- **WHEN** the GM opens the Sight step, turns line of sight on, sets the range to 60 ft and presses Save changes
- **THEN** the room's line of sight is on with a 60 ft range, and players' boards update

#### Scenario: Discard
- **WHEN** the GM changes the range and presses Discard
- **THEN** the room's range is unchanged

#### Scenario: Preview
- **WHEN** the GM picks a player in the Sight step and drags the range slider
- **THEN** the preview shows that player's sight shrinking or growing, and nothing is sent until Save changes

#### Scenario: Sight before a map
- **WHEN** the room has no map and the GM opens the Sight step
- **THEN** the step asks the GM to apply a map first

### Requirement: The Sight step previews sight from a test token
The Sight step's preview SHALL offer a test token, selected by default in Preview as, that the GM drags on the map or moves one square with the arrow keys. Its sight SHALL update when it is dropped, using the step's walls, fog and range. The test token SHALL exist only in the editor: it SHALL NOT be sent to the server, saved, or shown to anyone else.

#### Scenario: Move the test token behind a wall
- **WHEN** the GM moves the test token past a wall towards a token it could not see
- **THEN** the preview lights the new area, the count reads that it now sees that token, and no command is sent

## MODIFIED Requirements

### Requirement: Map setup opens as its own screen
When the room has a map, Manage › Battle map SHALL offer the GM one control, Edit map. Players SHALL NOT see it. It SHALL open the full-screen editor on its first step (Map, or Grid for a fixed map); the editor's step navigation SHALL reach the other steps. The editor SHALL have its own header, step navigation, a map canvas and a side panel. When the room has no map, Manage › Battle map SHALL offer Upload map and, with a library, From library instead. Opening and closing the editor SHALL NOT disconnect the GM or trigger a resync. Closing it SHALL return focus to Edit map.

#### Scenario: Open the editor
- **WHEN** the room has a map and the GM presses Edit map
- **THEN** a full-screen editor opens on its first step, the other steps are reachable from its step navigation, and the room keeps updating behind it

#### Scenario: Each control opens its own step
- **WHEN** the GM opens the editor with Edit map and picks Grid, Walls, Fog or Sight in its step navigation
- **THEN** the editor shows that step

#### Scenario: No map yet
- **WHEN** the room has no map
- **THEN** Manage › Battle map offers Upload map and From library, and no Edit map control

#### Scenario: Close the editor
- **WHEN** the GM opens the editor with Edit map and closes it with nothing unsaved
- **THEN** the board is shown again and focus is on Edit map
