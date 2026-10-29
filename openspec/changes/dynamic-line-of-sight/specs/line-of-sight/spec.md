## Purpose

Lets the GM limit each player to what their own tokens can see through the room's walls and portals (FR-GM-19), with the guarantee that what lies outside a player's sight never reaches that player (FR-GM-23).

## ADDED Requirements

### Requirement: The GM turns line of sight on and off
The GM SHALL be able to turn line of sight on or off for a room from the board's tool rail during play, with no dialog or save step. A new room SHALL start with line of sight off, and a room whose history predates this feature SHALL behave as off. With line of sight off, what players receive and see SHALL be exactly as without this feature. Players SHALL NOT be able to change the setting and SHALL NOT see the control. A change that sets the value the room already has SHALL be refused. Each change SHALL be one undoable action and SHALL appear in the activity log.

#### Scenario: GM turns line of sight on
- **WHEN** the GM turns line of sight on from the tool rail
- **THEN** every player's board changes at once to show only what their tokens can see, and the activity log reads "<GM> turned line of sight on"

#### Scenario: Old room
- **WHEN** a room created before this feature is loaded
- **THEN** line of sight is off and players see the board as before

#### Scenario: A player cannot change it
- **WHEN** a player sends the command to turn line of sight on
- **THEN** the server refuses it as forbidden and nothing changes

#### Scenario: Nothing to change
- **WHEN** the GM turns line of sight on in a room where it is already on
- **THEN** the server refuses it as invalid

#### Scenario: Undo
- **WHEN** the GM undoes turning line of sight on
- **THEN** line of sight is off again for everyone

### Requirement: Sight is cast from a player's own tokens
With line of sight on, a player's sight SHALL be the union of the areas visible from the centre of each token they own that is not hidden. Sight SHALL extend in every direction until it meets a plain wall, a closed door or a locked door, or the edge of the map. Open doors and windows in any state SHALL NOT block sight. Fog regions SHALL block sight like walls, except that a fog region containing the centre of a token SHALL NOT block that token's sight. Sight SHALL have no range limit. Sight SHALL depend only on the current walls, portals, map and owned token positions; an area SHALL NOT stay visible after no owned token can see it. A player who owns no visible token SHALL have no sight. The GM SHALL have no sight limit.

#### Scenario: Wall between
- **WHEN** a player's fighter stands on one side of a plain wall and a goblin stands on the other
- **THEN** the goblin is outside that player's sight

#### Scenario: Door opened
- **WHEN** a closed door separates the fighter from the goblin and the door is opened
- **THEN** the goblin enters the player's sight

#### Scenario: Window
- **WHEN** a closed window separates the fighter from the goblin
- **THEN** the goblin is inside the player's sight

#### Scenario: Fog blocks sight
- **WHEN** a fog region lies between the player's fighter and a goblin
- **THEN** the goblin is outside that player's sight, and nothing in the player's data reveals the walls under the fog

#### Scenario: Token inside fog
- **WHEN** the player's fighter stands inside a fog region
- **THEN** the fighter still sees out of that region

#### Scenario: Two tokens
- **WHEN** a player owns two tokens in different rooms
- **THEN** the player sees both rooms

#### Scenario: Token leaves
- **WHEN** the player's only token walks out of a room through a door and the door is closed behind it
- **THEN** the room it left is no longer in the player's sight

#### Scenario: No token
- **WHEN** a player owns no token and line of sight is on
- **THEN** the player's sight is empty

#### Scenario: Hidden owned token
- **WHEN** the GM hides the only token a player owns
- **THEN** the player's sight is empty

### Requirement: Content outside sight is not sent to players
With line of sight on, a token whose centre lies outside a player's sight SHALL NOT be sent to that player unless the player owns it, in snapshots, live events, REST responses or ephemeral relays. Another participant's area template whose origin lies outside the player's sight SHALL NOT be sent to that player. A portal whose midpoint lies outside the player's sight SHALL NOT be sent to that player; a portal lying on the edge of the player's sight SHALL count as inside it. Fog SHALL continue to apply as well: content concealed by fog or by hiding SHALL stay concealed whether or not it is inside sight. Attack rolls and the turn order SHALL treat a token outside sight as they treat a token under fog. Plain walls SHALL never be sent to players. Whenever a change can alter what a player may see under line of sight, that player SHALL receive a fresh filtered state.

#### Scenario: Monster behind a wall
- **WHEN** line of sight is on and a goblin stands behind a wall from every token a player owns
- **THEN** no part of that player's state, event stream, drag previews or aim previews contains the goblin

#### Scenario: Monster walks into view
- **WHEN** the GM drags a goblin from behind a wall into a player's sight
- **THEN** the player receives no drag preview while the goblin is out of sight, and the goblin appears on the player's board once its move ends inside sight

#### Scenario: Player token moves
- **WHEN** a player moves their token around a corner
- **THEN** the player receives a fresh state showing what the token now sees

#### Scenario: Fog still wins
- **WHEN** a goblin stands inside a player's sight but under fog
- **THEN** the player does not receive the goblin

#### Scenario: Owned token outside other sight
- **WHEN** a player owns a token
- **THEN** the player always receives that token, wherever it stands

#### Scenario: Turning line of sight off
- **WHEN** the GM turns line of sight off
- **THEN** each player receives a fresh state with every token outside fog and not hidden

### Requirement: The board shows a player's sight
With line of sight on, a player's board SHALL cover the map and grid outside the player's sight with an opaque dark mask, so neither the map image nor tokens are visible there, and SHALL show the map normally inside sight. The player SHALL receive the outline of their sight, and SHALL NOT receive the plain walls that produced it. Fog SHALL be drawn as today on top of the visible area. The GM's normal view SHALL NOT be masked. When the GM views the room as a player, the board SHALL show that player's sight exactly as the player sees it.

#### Scenario: Player board
- **WHEN** line of sight is on and a player's token stands in a room with one open door
- **THEN** the player's board shows that room and the area seen through the doorway, and the rest of the map is dark

#### Scenario: GM board
- **WHEN** line of sight is on
- **THEN** the GM's board shows the whole map and every token as before

#### Scenario: GM checks a player's sight
- **WHEN** the GM views the room as a player
- **THEN** the board is dark outside that player's sight, as the player sees it
