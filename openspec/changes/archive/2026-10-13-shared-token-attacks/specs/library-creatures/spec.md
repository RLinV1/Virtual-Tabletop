## MODIFIED Requirements

### Requirement: Named template attacks
The GM SHALL be able to create, edit and remove up to eight named attacks in a creature template. Each attack SHALL have a unique name (1–40 characters) and a to-hit roll, damage roll, or both, using the existing attack editor's dice limits. Saving a placed token as a creature SHALL include the token's current named attacks, as everyone who may see them sees them, including removals. Placing the creature SHALL copy attacks into each token independently of the template. Copied attacks SHALL be available in the Attack panel to the GM and token owners, and SHALL be withheld from other players in snapshots and token events. Older creatures SHALL default to no attacks.

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
