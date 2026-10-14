## Purpose

Lets the table aim and place spell areas on the map so everyone sees the same squares, with live aiming shared as it happens and only the final placement kept in the room.

## ADDED Requirements

### Requirement: Line templates
A participant SHALL be able to place a line template. A line SHALL start at its origin and extend toward its aim point for its length in grid units, with a width in grid units that defaults to one cell. Without Alt, the origin SHALL snap to the nearest half cell and the length to whole cells. Length and width MUST be positive, and width MUST NOT exceed 10 cells.

#### Scenario: Place a 60 ft line
- **WHEN** a player on a 5 ft grid drags a line from a cell corner 12 cells long and releases
- **THEN** every client shows a 60 ft by 5 ft line from that corner in the dragged direction, and the activity log says the player placed a 60 ft line

#### Scenario: 10 ft wide line
- **WHEN** the GM places a line with a width of 2 cells
- **THEN** every client shows the line 10 ft wide

#### Scenario: Invalid width
- **WHEN** a client sends a line placement with a width of 0 or more than 10 cells
- **THEN** the server rejects it and no template is added

### Requirement: Aiming is shared live
While a participant drags the Area tool, every other client allowed to see the result SHALL see a live preview of the template at its current position, size and direction, marked as a preview and labelled with the aiming participant's name. A preview SHALL disappear when the aiming participant places or cancels, and by itself within 1 second of the last update.

#### Scenario: Player aims a cone
- **WHEN** a player drags to aim a 15 ft cone
- **THEN** the GM and other players see a dashed 15 ft cone following the drag, labelled with that player's name

#### Scenario: Aim cancelled
- **WHEN** the aiming player presses Escape
- **THEN** the preview disappears from every other client

#### Scenario: Sender disconnects mid-aim
- **WHEN** the aiming player's connection drops during a drag
- **THEN** the preview disappears from other clients within 1 second

### Requirement: Previews are never persisted
An aim preview MUST NOT change room state, MUST NOT be written to the event log, and MUST NOT take a sequence number. Only placing a template SHALL commit it.

#### Scenario: Aim, then place
- **WHEN** a player aims a template for several seconds and then places it
- **THEN** the room's log gains exactly one template-placed event, at the next sequence number, and nothing for the aiming

#### Scenario: Reload during aim
- **WHEN** another client reloads while a player is still aiming
- **THEN** the reloaded client's state contains no template from that aim

### Requirement: GM-only aiming stays hidden
A preview of a GM-only template MUST be delivered to GMs only. The server MUST drop a GM-only preview sent by a player, and MUST drop any preview whose origin is off the map or that is sent while the scene has no map.

#### Scenario: GM aims a hidden trap area
- **WHEN** the GM aims a GM-only circle
- **THEN** no player receives any message about it

#### Scenario: Forged GM-only preview
- **WHEN** a player sends a preview marked GM-only
- **THEN** no client receives it
