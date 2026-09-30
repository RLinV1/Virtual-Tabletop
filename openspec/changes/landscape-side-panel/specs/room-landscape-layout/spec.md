## ADDED Requirements

### Requirement: Side panel on narrow landscape viewports
When the room page uses its compact layout (viewport width 720 px or less) and the viewport is in landscape orientation, the control panel SHALL sit to the right of the board, below the top bar, rather than below the board. The room SHALL fill the viewport height without the page scrolling, the board SHALL take the full height below the top bar, and the panel SHALL scroll within its own column.

#### Scenario: Phone held sideways
- **WHEN** a participant opens a room at 667×375
- **THEN** the panel's left edge is at or right of the board's right edge, the board and panel share the same top edge below the top bar, and the page has no vertical scroll

#### Scenario: Long panel content in landscape
- **WHEN** the panel's content is taller than the viewport at 667×375
- **THEN** the panel body scrolls and the board stays fully visible

### Requirement: Portrait compact layout unchanged
In portrait orientation at 720 px wide or less, the room page SHALL keep the stacked layout: board above, panel below, with the page scrolling.

#### Scenario: Phone held upright
- **WHEN** a participant opens a room at 375×667
- **THEN** the panel's top edge is at or below the board's bottom edge

#### Scenario: Rotating the phone
- **WHEN** the viewport changes from 375×667 to 667×375 and back
- **THEN** the panel moves beside the board and then back below it, and the board refits to its new area each time
