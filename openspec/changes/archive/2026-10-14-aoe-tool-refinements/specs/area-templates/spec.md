## ADDED Requirements

### Requirement: Area color
A participant SHALL be able to choose an area's color before placing it, from red, orange, yellow, green, blue, purple and grey, with orange chosen at first. The color SHALL be part of the placed area. Every client that receives the area SHALL draw it in that color, and the live aim preview SHALL show it while aiming. The server MUST reject a placement or a preview with any other color. An area with no color, including one placed before colors existed, SHALL be drawn orange. The activity log SHALL name a placed area's color. The color of a GM-only area MUST NOT reach any player, just as the area itself does not.

#### Scenario: Red fireball
- **WHEN** a player chooses red and places a 20 ft circle
- **THEN** every client draws a red 20 ft circle, and the activity log says the player placed a red 20 ft circle

#### Scenario: Color while aiming
- **WHEN** the GM chooses blue and drags to aim a cone
- **THEN** the other clients see the cone's preview in blue

#### Scenario: Unknown color
- **WHEN** a client sends a placement with a color that isn't one of the seven
- **THEN** the server rejects it and no area is added

#### Scenario: Area from before colors
- **WHEN** a room is opened whose log has an area placed before colors existed
- **THEN** that area is drawn orange

#### Scenario: GM-only area's color
- **WHEN** the GM places a GM-only green circle
- **THEN** no player receives the area or its color

### Requirement: GM-only areas are hatched
A GM-only area SHALL be drawn, for the GMs who receive it, with diagonal hatching in its own color and a solid outline. Other areas SHALL have a plain translucent fill. A GM-only area's aim preview SHALL be hatched too. Being GM-only SHALL NOT change an area's color.

#### Scenario: GM-only and public side by side
- **WHEN** the GM places a red circle and a GM-only red circle
- **THEN** the GM sees both in red, the GM-only one with diagonal hatching, and players see only the first

### Requirement: Line width control
The Area tool SHALL take a line's width as a whole number of squares from 1 to 10 in a number field with decrease and increase buttons, starting at 1. Decrease SHALL be disabled at 1 and increase at 10. A typed value SHALL be rounded to a whole number and kept within 1 to 10 when the field loses focus or Enter is pressed. An empty or invalid entry SHALL keep the last valid width. The server's limit of 10 cells SHALL be unchanged.

#### Scenario: Step the width
- **WHEN** the line width is 1 and the participant presses increase three times
- **THEN** the field shows 4, and a line placed next is 4 squares wide on every client

#### Scenario: Out of range
- **WHEN** the participant types 14 in the width field and presses Enter
- **THEN** the field shows 10

#### Scenario: Cleared field
- **WHEN** the width is 3 and the participant clears the field and clicks away
- **THEN** the field shows 3 again

### Requirement: Square areas are placed by their centre
A square area's placed point SHALL be its centre. Without Alt, the centre SHALL snap to the nearest half cell. The square SHALL turn around its centre to face the aim point. When sized by dragging, its side SHALL be twice the distance from the centre to the pointer, snapped to whole cells unless Alt is held. A square placed before this change SHALL be drawn centred on its stored point. It moves by half its side, and nothing in the log is rewritten.

#### Scenario: Click a square's centre
- **WHEN** a player clicks the centre of a cell with a 5 ft square chosen on a 5 ft grid
- **THEN** every client shows a square covering exactly that cell

#### Scenario: Drag to size
- **WHEN** a player presses on a cell's centre and drags 1.5 cells to the right
- **THEN** a 15 ft square is centred on that cell and faces right

#### Scenario: Old square
- **WHEN** a room has a 10 ft square placed before this change
- **THEN** it is drawn centred on its stored point, 5 ft from where it was drawn before
