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
