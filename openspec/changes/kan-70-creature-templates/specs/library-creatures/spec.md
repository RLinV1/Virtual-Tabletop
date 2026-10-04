## MODIFIED Requirements

### Requirement: Creature entries
A creature SHALL have a name of 1 to 60 characters, a size in grid cells greater than 0 and at most 10 (default 1), an optional Max HP that is a whole number from 1 to 9999, an optional AC that is a whole number from 0 to 99, a colour given as a six-digit hex value (default the standard token colour), a list of up to 12 starting conditions from the room's condition set (default none, no duplicates), and an optional image. The name is the name the creature's tokens show on the board. The image, when set, MUST be token art in the same GM's library. Built-in example art, maps, and another GM's assets MUST NOT be accepted. The server MUST reject an invalid creature with 400 and store nothing. A rejected image MUST get the same response whether the asset does not exist, is a map, or belongs to another GM. Creatures saved before colour and conditions existed SHALL read back with the defaults.

#### Scenario: Create a creature
- **WHEN** the GM saves a creature named "Goblin" with size 1, Max HP 7, AC 15, colour green, starting condition Prone and their token art "Goblin art"
- **THEN** the library lists the creature "Goblin" with that art, size, Max HP, AC, colour and condition

#### Scenario: Only a name is required
- **WHEN** the GM saves a creature named "Rubble" with no Max HP, AC, colour, conditions or image
- **THEN** it is saved with size 1, the standard token colour and no conditions, and is drawn as a plain colour disc

#### Scenario: Out-of-range values
- **WHEN** a request creates a creature with Max HP 0, AC 120, size 11, an empty name, a colour that is not a six-digit hex value, an unknown condition, or 13 conditions
- **THEN** the server responds 400 and no creature is added

#### Scenario: Image that is not the GM's own token art
- **WHEN** a request sets a creature's image to another GM's token art, to one of the GM's maps, or to an id that does not exist
- **THEN** the server responds 400 with the same message in each case, and the creature is unchanged

#### Scenario: Creature saved before this change
- **WHEN** the GM opens a creature that was saved before colours and conditions existed
- **THEN** it shows the standard token colour and no conditions, and places without error

### Requirement: Place a creature from Add Token
In a room, the GM's Add Token form SHALL offer "From creature" when the GM has a library identity. It SHALL list the GM's creatures. Choosing one SHALL fill in the name, size, HP (set to the creature's Max HP), Max HP, AC, colour, conditions and image. The GM SHALL still choose the owner, whether the token is hidden, and how many to add (1 to 20, default 1). The GM MAY change any filled-in value, and then picks the square as for any new token. Each resulting token SHALL be created exactly as if the GM had typed those values, including the automatic numbering of duplicate names. When the image is library token art, the token SHALL record that art's asset id, and the room SHALL NOT record which creature was used.

#### Scenario: Place a goblin
- **WHEN** the GM chooses From creature → "Goblin" (Max HP 7, AC 15, size 1, green, Prone) and clicks a square
- **THEN** a green token "Goblin" with HP 7 of 7, AC 15, size 1, the Prone condition and the goblin art appears on that square

#### Scenario: Several of the same creature
- **WHEN** the GM places the creature "Goblin" three times
- **THEN** the board shows tokens named "Goblin", "Goblin 2" and "Goblin 3"

#### Scenario: Adjust before placing
- **WHEN** the GM chooses "Goblin", ticks Hidden and changes HP to 4 before choosing a square
- **THEN** the token is hidden from players and has HP 4 of 7

## ADDED Requirements

### Requirement: Add several tokens at once
The GM SHALL be able to add between 1 and 20 copies of a token in one action, from a creature or from typed values. The tokens SHALL be created together by one command, so either all of them appear or none do. The first token SHALL be placed on the chosen square, and the rest on the nearest squares not already occupied by a token, staying inside the map. Each token SHALL get a unique name by the room's numbering rule. Players MUST NOT be able to add tokens this way.

#### Scenario: Four goblins
- **WHEN** the GM chooses "Goblin", sets the count to 4 and clicks an empty square
- **THEN** four tokens "Goblin", "Goblin 2", "Goblin 3" and "Goblin 4" appear on that square and three free neighbouring squares, and every client sees all four

#### Scenario: Names already in use
- **WHEN** a token "Goblin" is already on the board and the GM adds 2 more goblins
- **THEN** the new tokens are named "Goblin 2" and "Goblin 3"

#### Scenario: Count out of range
- **WHEN** a request asks to add 0 or 21 tokens
- **THEN** the server rejects it and no token is added

#### Scenario: Hidden copies stay hidden
- **WHEN** the GM adds 3 hidden copies
- **THEN** players receive nothing about any of the 3 tokens

### Requirement: Save a placed token as a creature
The GM SHALL be able to save any token on the board as a new creature in their library. The creature form SHALL open prefilled with the token's name, size, Max HP, AC, colour and conditions, and with its image when that image is the GM's own library token art. Otherwise it opens with no image. Saving SHALL follow the creature entry rules. Saving MUST NOT change the token or the room.

#### Scenario: Save an ogre built during play
- **WHEN** the GM opens the token "Ogre" (size 2, Max HP 59, AC 11, brown, their own ogre art) and chooses Save as creature, then Save
- **THEN** the library gains a creature "Ogre" with those values and that art, and the board is unchanged

#### Scenario: Token with an image that is not the GM's art
- **WHEN** the GM saves a token whose image is built-in example art as a creature
- **THEN** the form opens with no image, and the saved creature has no image

#### Scenario: Players cannot save creatures
- **WHEN** a player opens a token they own
- **THEN** no Save as creature control is shown, and the creature API refuses them
