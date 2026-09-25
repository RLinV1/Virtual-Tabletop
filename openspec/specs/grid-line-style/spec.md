# grid-line-style Specification

## Purpose
TBD - created by archiving change grid-line-style. Update Purpose after archive.

## Requirements

### Requirement: Line style lives under Advanced, closed by default
The line-style controls SHALL sit behind an "Advanced" disclosure in the Grid modal, closed each time the modal opens. The closed row SHALL show only its label and an expand indicator, with no controls or chips that look interactive but aren't.

#### Scenario: Default view
- **WHEN** the GM opens the Grid modal
- **THEN** only the cell size, units and offsets are shown, plus a closed "Advanced" row

#### Scenario: Expanding
- **WHEN** the GM opens "Advanced"
- **THEN** the preview, colour wheel, thickness and opacity controls appear

### Requirement: GM sets grid line colour
The GM SHALL be able to choose the grid's line colour from a colour wheel with a brightness control, a hex field, and quick swatches. The chosen colour SHALL be drawn on every participant's board once applied.

#### Scenario: Pick a colour on the wheel
- **WHEN** the GM picks a red from the colour wheel and applies the grid
- **THEN** the grid lines on the GM's and every player's board are drawn in that red

#### Scenario: Exact colour
- **WHEN** the GM types `#3fa7ff` in the hex field and applies
- **THEN** the grid is drawn in `#3fa7ff`

### Requirement: GM sets grid line thickness from presets
The GM SHALL be able to choose the grid line thickness with a slider that snaps to five named presets: Hairline 1, Thin 2, Medium 3, Thick 4 and Bold 6 board pixels. Thickness SHALL be in board pixels, so it scales with each viewer's zoom.

#### Scenario: Thicker grid
- **WHEN** the GM moves the slider to Thick and applies
- **THEN** grid lines are drawn 4 board pixels wide for everyone

### Requirement: GM sets grid line opacity
The GM SHALL be able to set the grid line opacity with a slider from 5% to 100% in 5% steps, starting from the current value (35% for a grid that has never been styled). The chosen opacity SHALL be drawn on every participant's board once applied.

#### Scenario: Stronger white grid on a light map
- **WHEN** the GM chooses white lines at 80% opacity and applies
- **THEN** everyone's grid is drawn white at 80% opacity

#### Scenario: Grid cannot vanish by accident
- **WHEN** the GM drags the opacity slider to its minimum
- **THEN** it stops at 5% and the grid stays visible

### Requirement: Style preview before applying
The Grid modal SHALL show a live preview of the chosen colour, thickness and opacity before the GM applies it. Nothing SHALL change for other participants until Apply.

#### Scenario: Preview only
- **WHEN** the GM changes the colour but has not pressed Apply
- **THEN** the preview updates and the players' boards do not change

### Requirement: Style is part of the grid
The line style SHALL be stored with the rest of the grid. It SHALL be undoable like any grid change, SHALL persist across reloads, and SHALL travel with "Save grid to library" and with placing a library map. A grid without a style SHALL render as black 1-pixel lines at 35% opacity, as before.

#### Scenario: Existing rooms unchanged
- **WHEN** a room created before this change is opened
- **THEN** its grid is drawn exactly as before

#### Scenario: Only the GM can change it
- **WHEN** a player sends a grid change with a new colour
- **THEN** the server rejects it and the grid is unchanged
