# gm-view-as-player Specification

## Purpose
Lets the GM check what a player sees by previewing the room as that player, read-only, and control how fog appears on the GM's own board.

## Requirements

### Requirement: GM can view the room as a player
The GM SHALL be able to choose any player who has joined the room and see the board and side panels exactly as that player sees them, and to return to the GM view with one action. The viewed state SHALL be derived on the GM's client from the GM's own state with the same visibility filter the server applies to that player. A persistent banner SHALL name the player being viewed and offer the return action.

#### Scenario: Hidden token is hidden in the preview
- **WHEN** the GM views the room as Aria and a token is hidden from players
- **THEN** that token is not on the board, in the turn order or in the token list

#### Scenario: Fog hides tokens in the preview
- **WHEN** the GM views as Aria and an unowned token is under fog
- **THEN** the token is not drawn and the fog is fully opaque

#### Scenario: GM-only rolls withheld
- **WHEN** the GM views as Aria after rolling a GM-only roll
- **THEN** that roll is not in the roll log

#### Scenario: Return to GM view
- **WHEN** the GM presses the banner's return button
- **THEN** the full GM board and panels are shown again

### Requirement: Preview is read-only
While viewing as a player, board tools, token drags and panel controls SHALL be inert and the client SHALL NOT send any command. No command SHALL ever be sent in the player's name.

#### Scenario: Drag does nothing
- **WHEN** the GM tries to drag a token while viewing as a player
- **THEN** the token does not move and no command is sent

### Requirement: GM default view shows through fog
In the GM's normal view, fog regions SHALL be drawn at 50% opacity with their outline, so the GM can see the whole map and every token beneath them. A token under fog SHALL stay visible to the GM and look covered by the tint, so the GM can tell which tokens players cannot see. Players' fog SHALL remain fully opaque. Fog SHALL be drawn opaque on the GM's screen only in a player view: the player preview and the map editor's Player view, which SHALL draw fog as a player sees it.

#### Scenario: GM sees under fog
- **WHEN** a region is fogged and the GM is in the normal view
- **THEN** the map and tokens in the region remain visible under a half-opaque fog tint and outline

#### Scenario: Fogged token is marked for the GM
- **WHEN** a goblin stands inside a fog region and the GM is in the normal view
- **THEN** the GM sees the goblin under the tint, and players do not see it

#### Scenario: Player view is opaque
- **WHEN** the GM views the room as a player, or turns on Player view in the map editor's Fog step
- **THEN** fog is drawn fully opaque, as players see it

### Requirement: GM can switch the fog tint off
When the room has fog, the GM SHALL be able to switch the fog tint off on their own view and back on again. With the tint off the fog fill SHALL NOT be drawn and only a faint outline SHALL mark each region. The choice SHALL apply only to the GM's own view, SHALL be remembered by that browser, and SHALL NOT change what players see or any room state.

#### Scenario: See everything
- **WHEN** the GM turns the fog tint off
- **THEN** the map and tokens in fogged regions show with no tint, and players' views are unchanged

#### Scenario: Preference kept
- **WHEN** the GM reloads the page after turning the tint off
- **THEN** the tint is still off
