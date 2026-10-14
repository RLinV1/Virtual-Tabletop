## MODIFIED Requirements

### Requirement: Place a creature from Add Token
In a room, the GM's New Token form SHALL offer "From creature" when the GM has a library identity. It SHALL list the GM's creatures. Choosing one SHALL fill in the name, size, starting HP (falling back to Max HP when blank/null), Max HP, AC, colour, conditions and image. The GM SHALL still choose the owner and whether the token is hidden. The GM MAY change any filled-in value, and then places it as for any new token. Each resulting token SHALL be created exactly as if the GM had typed those values, including the automatic numbering of duplicate names. When the image is library token art, the token SHALL record that art's asset id, and the room SHALL NOT record which creature was used.

#### Scenario: Place a goblin
- **WHEN** the GM chooses From creature → "Goblin" (Max HP 7, AC 15, size 1, green, Prone) and clicks a square
- **THEN** a green token "Goblin" with HP 7 of 7, AC 15, size 1, the Prone condition and the goblin art appears on that square

#### Scenario: Several of the same creature
- **WHEN** the GM places the creature "Goblin" on three squares
- **THEN** the board shows tokens named "Goblin", "Goblin 2" and "Goblin 3"

#### Scenario: Adjust before placing
- **WHEN** the GM chooses "Goblin", ticks Hidden and changes HP to 4 before choosing a square
- **THEN** the token is hidden from players and has HP 4 of 7

### Requirement: Add several tokens at once
The `token.create` command SHALL accept between 1 and 20 copies of a token in one action. The tokens SHALL be created together, so either all of them appear or none do. The first token SHALL be placed on the requested square, and the rest on the nearest squares not already occupied by a token, staying inside the map. Each token SHALL get a unique name by the room's numbering rule. Players MUST NOT be able to add tokens this way. The GM's forms SHALL NOT offer a count: the GM adds several tokens by placing them one after another.

#### Scenario: Four goblins
- **WHEN** a `token.create` for "Goblin" asks for 4 copies on an empty square
- **THEN** four tokens "Goblin", "Goblin 2", "Goblin 3" and "Goblin 4" appear on that square and three free neighbouring squares, and every client sees all four

#### Scenario: Names already in use
- **WHEN** a token "Goblin" is already on the board and the GM places 2 more goblins
- **THEN** the new tokens are named "Goblin 2" and "Goblin 3"

#### Scenario: Count out of range
- **WHEN** a request asks to add 0 or 21 tokens
- **THEN** the server rejects it and no token is added

#### Scenario: Hidden copies stay hidden
- **WHEN** the GM places 3 hidden goblins
- **THEN** players receive nothing about any of the 3 tokens

### Requirement: Named template attacks
The GM SHALL be able to create, edit and remove up to eight named attacks in a creature template. Each attack SHALL have a unique name (1–40 characters) and a to-hit roll, damage roll, or both, using the existing attack editor's dice limits. Saving a placed token as a creature SHALL include that browser's current named attacks, including removals. Placing the creature SHALL copy attacks into each token independently of the template. Copied attacks SHALL be available in the Attack panel to the GM and token owners, and SHALL be withheld from other players in snapshots and token events. Older creatures SHALL default to no attacks.

#### Scenario: Reuse Greatclub
- **WHEN** the GM saves a creature with Greatclub (1d20+6 to hit, 2d8+4 damage) and places it
- **THEN** the placed token offers Greatclub in Attack, including after reload or on another signed-in device

#### Scenario: Ownership changes
- **WHEN** a player gains or loses ownership of a token with copied attacks
- **THEN** their filtered snapshot gains or loses those attacks

#### Scenario: Automatic batch placement
- **WHEN** a `token.create` for a creature with named attacks asks for 3 copies
- **THEN** the server places them in one numbered command on neighbouring free squares, each with its own copy of the attacks; the GM's own placing creates one token per click and offers no count

#### Scenario: Save an ogre built during play
- **WHEN** the GM opens the token "Ogre" (size 2, Max HP 59, AC 11, brown, their own ogre art) and chooses Save as creature, then Save
- **THEN** the library gains a creature "Ogre" with those values and that art, and the board is unchanged

#### Scenario: Token with an image that is not the GM's art
- **WHEN** the GM saves a token whose image is built-in example art as a creature
- **THEN** the form opens with no image, and the saved creature has no image

#### Scenario: Players cannot save creatures
- **WHEN** a player opens a token they own
- **THEN** no Save as creature control is shown, and the creature API refuses them

## ADDED Requirements

### Requirement: Place a saved creature directly
In a room, a GM with a library identity SHALL have a Saved Creatures button beside New Token. It SHALL open the GM's creatures in one dialog with search, and a "Hidden from players" checkbox above the list, unticked when the dialog opens. Choosing a creature SHALL close the dialog and start placing it, with no form in between. Each token SHALL be created with the creature's values as From creature fills them, no owner, and Hidden as ticked. A GM without a library identity SHALL NOT see Saved Creatures.

#### Scenario: Goblins straight from the library
- **WHEN** the GM presses Saved Creatures, chooses "Goblin" and clicks two squares
- **THEN** "Goblin" and "Goblin 2" with the creature's values appear on those squares, and no other dialog opened

#### Scenario: Hidden ambush
- **WHEN** the GM ticks Hidden from players, chooses "Ogre" and clicks a square
- **THEN** the ogre is created hidden and no player ever receives it

#### Scenario: Signed out
- **WHEN** a GM without a library identity opens the Tokens section
- **THEN** only New Token is shown
