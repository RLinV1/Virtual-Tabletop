## ADDED Requirements

### Requirement: The GM chooses a new token's square on the board
After filling in Add token, the GM SHALL choose where the token is created by pointing at the board. While choosing, the board SHALL show the token under the pointer, snapped to the square or squares it would occupy, and highlight them. Nothing SHALL be sent to the server, and players SHALL see nothing, until the GM places it.

#### Scenario: Hover and click
- **WHEN** the GM fills in Add token for "Goblin", presses Choose a square, moves the pointer over a square and clicks
- **THEN** a faded Goblin follows the pointer square by square, and the click creates Goblin centred on that square

#### Scenario: Free placement
- **WHEN** the GM holds Alt while clicking
- **THEN** the token is created exactly at the pointer, with no snapping

#### Scenario: Looking around first
- **WHEN** the GM drags or zooms the board while placing
- **THEN** the view pans or zooms and no token is created

### Requirement: Placing can be finished without a pointer, or abandoned
While placing, the board SHALL offer Place automatically, which creates the token at the next spot around the map's centre, and Cancel. Place automatically SHALL receive keyboard focus when placing starts. Esc, right-click, Cancel or picking a board tool SHALL end placing without creating the token.

#### Scenario: Keyboard only
- **WHEN** the GM submits Add token with Enter and presses Enter again
- **THEN** the token is created at the automatic spot

#### Scenario: Cancel
- **WHEN** the GM presses Esc while placing
- **THEN** the ghost disappears and no token is created

#### Scenario: Rejected
- **WHEN** the server rejects the new token
- **THEN** the board stays in placing mode and shows the reason
