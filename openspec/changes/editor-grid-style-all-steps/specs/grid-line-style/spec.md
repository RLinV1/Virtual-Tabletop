## ADDED Requirements

### Requirement: The grid style shows in every map editor step
The map editor SHALL draw the grid with the room's line colour, thickness and opacity in the Grid, Walls and Fog steps, so the grid looks the same while placing walls or fog as it does on the board.

#### Scenario: Styled grid in the Walls step
- **WHEN** the GM has applied a grid with a custom line colour and opens the Walls step
- **THEN** the grid lines use that colour, thickness and opacity

#### Scenario: Unstyled grid
- **WHEN** the room's grid has no line style
- **THEN** the Walls and Fog steps draw the default black, 1 pixel, 35% opacity lines, as the board does

## MODIFIED Requirements

### Requirement: GM sets grid line thickness from presets
The GM SHALL be able to choose the grid line thickness with a slider that snaps to six named presets: Hairline 1, Thin 2, Medium 3, Thick 4, Bold 6 and Heavy 8 board pixels. Thickness SHALL be in board pixels, so it scales with each viewer's zoom.

#### Scenario: Thicker grid
- **WHEN** the GM moves the slider to Thick and applies
- **THEN** grid lines are drawn 4 board pixels wide for everyone

#### Scenario: Heaviest grid
- **WHEN** the GM moves the slider to Heavy and applies
- **THEN** grid lines are drawn 8 board pixels wide for everyone
