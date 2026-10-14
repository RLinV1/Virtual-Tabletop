# library-creatures Specification

## Purpose
Lets a GM prepare reusable creatures in the asset library (name, size, hit points, armour class and art) and put one on the board during play without typing its details again.

## Requirements

### Requirement: Creature entries
A creature SHALL have a name of 1 to 60 characters, a size in grid cells greater than 0 and at most 10 (default 1), an optional Max HP that is a whole number from 1 to 9999, an optional AC that is a whole number from 0 to 99, and an optional image. The name is the name the creature's tokens show on the board. The image, when set, MUST be token art in the same GM's library. Built-in example art, maps, and another GM's assets MUST NOT be accepted. The server MUST reject an invalid creature with 400 and store nothing. A rejected image MUST get the same response whether the asset does not exist, is a map, or belongs to another GM.

#### Scenario: Create a creature
- **WHEN** the GM saves a creature named "Goblin" with size 1, Max HP 7, AC 15 and their token art "Goblin art"
- **THEN** the library lists the creature "Goblin" with that art, size, Max HP and AC

#### Scenario: Only a name is required
- **WHEN** the GM saves a creature named "Rubble" with no Max HP, AC or image
- **THEN** it is saved with size 1 and drawn as a plain colour disc

#### Scenario: Out-of-range values
- **WHEN** a request creates a creature with Max HP 0, AC 120, size 11 or an empty name
- **THEN** the server responds 400 and no creature is added

#### Scenario: Image that is not the GM's own token art
- **WHEN** a request sets a creature's image to another GM's token art, to one of the GM's maps, or to an id that does not exist
- **THEN** the server responds 400 with the same message in each case, and the creature is unchanged

### Requirement: Creature ownership and access
Every creature SHALL belong to exactly one GM identity. All creature endpoints SHALL be GM-only and MUST authorize on the server. A GM MUST NOT be able to list, read, edit or delete another GM's creatures. Nothing sent to player clients SHALL include a creature's id or reveal which creatures a GM has.

#### Scenario: Another GM's creature
- **WHEN** GM B edits or deletes a creature owned by GM A
- **THEN** the server responds 404 and the creature is unchanged

#### Scenario: Player credential rejected
- **WHEN** a request to a creature endpoint carries only a room guest credential
- **THEN** the server responds 401

### Requirement: Manage creatures in the library
The library page SHALL have a Creatures tab. It SHALL list the GM's creatures, each with its image (or a colour disc), name, size, Max HP and AC. The tab's search SHALL filter creatures by name, case-insensitively. The GM SHALL be able to create a creature, edit any of its values, and delete it after a plain confirmation. Deleting a creature SHALL NOT change any room. A browser with no GM identity SHALL see an empty Creatures tab and make no request for creatures.

#### Scenario: Edit a creature
- **WHEN** the GM changes the creature "Goblin" to Max HP 9 and saves
- **THEN** the Creatures tab shows "Goblin" with Max HP 9

#### Scenario: Search creatures
- **WHEN** the GM types "gob" on the Creatures tab
- **THEN** only creatures whose name contains "gob", case-insensitively, are shown

#### Scenario: Delete a creature
- **WHEN** the GM deletes the creature "Goblin" and confirms
- **THEN** it disappears from the library, and goblin tokens already on boards are unchanged

### Requirement: Place a creature from Add Token
In a room, the GM's Add Token form SHALL offer "From creature" when the GM has a library identity. It SHALL list the GM's creatures. Choosing one SHALL fill in the name, size, HP (set to the creature's Max HP), Max HP, AC and image. The GM SHALL still choose the owner and whether the token is hidden, MAY change any filled-in value, and then picks the square as for any new token. The resulting token SHALL be created exactly as if the GM had typed those values, including the automatic numbering of duplicate names. When the image is library token art, the token SHALL record that art's asset id, and the room SHALL NOT record which creature was used.

#### Scenario: Place a goblin
- **WHEN** the GM chooses From creature → "Goblin" (Max HP 7, AC 15, size 1) and clicks a square
- **THEN** a token "Goblin" with HP 7 of 7, AC 15, size 1 and the goblin art appears on that square

#### Scenario: Several of the same creature
- **WHEN** the GM places the creature "Goblin" three times
- **THEN** the board shows tokens named "Goblin", "Goblin 2" and "Goblin 3"

#### Scenario: Adjust before placing
- **WHEN** the GM chooses "Goblin", ticks Hidden and changes HP to 4 before choosing a square
- **THEN** the token is hidden from players and has HP 4 of 7

### Requirement: Placed tokens are independent of their creature
A token placed from a creature SHALL be an ordinary token. Editing or deleting the creature afterwards SHALL NOT change any token already placed.

#### Scenario: Edit after placing
- **WHEN** the GM changes the creature "Goblin" to AC 17 after placing a goblin token
- **THEN** the placed token keeps AC 15, and the next goblin placed has AC 17

### Requirement: Creatures lose deleted art
When token art that creatures use is deleted, those creatures SHALL keep their name, size, Max HP and AC and have no image. Tokens placed from them afterwards SHALL be plain colour discs.

#### Scenario: Art deleted
- **WHEN** the GM deletes the token art used by the creature "Goblin" and confirms
- **THEN** "Goblin" is still listed with its values and a colour disc, and placing it creates a token with no image

### Requirement: Creature form advanced settings
The creature form (New creature, Edit creature and Save as creature) SHALL show the name, Size, Max HP, AC, attacks and image directly. Starting HP with its blank-means-Max-HP hint, Colour without art, and the starting conditions SHALL be inside a collapsible "Advanced settings" section placed after the image and before the form's buttons. The starting conditions SHALL be a nested "Starting conditions" section whose title lists the chosen conditions and which is open when any condition is chosen. Advanced settings SHALL be open when the form opens with a Starting HP value or at least one condition, and SHALL open when the Starting HP error is shown. Otherwise it SHALL start closed. It SHALL NOT close on its own while the form is open. The form SHALL NOT show the text "Without art it shows as a colour disc." or "Named to-hit and damage rolls are copied to each placed token." Moving fields into the section SHALL NOT change what is saved.

#### Scenario: New creature starts tidy
- **WHEN** the GM opens New creature
- **THEN** Size, Max HP and AC are shown, Advanced settings is closed, and neither removed hint text appears

#### Scenario: Values already set are not hidden
- **WHEN** the GM saves a token at 30 of 59 HP that is prone as a creature, or edits a creature with a Starting HP or conditions
- **THEN** Advanced settings is open, Starting HP shows its value, and the title "Starting conditions: Prone" is shown with the conditions open

#### Scenario: The Starting HP error is never hidden
- **WHEN** the GM enters a Starting HP higher than Max HP while Advanced settings is closed
- **THEN** Advanced settings opens so the field is visible next to "Starting HP cannot exceed Max HP."

#### Scenario: Clearing a value does not collapse the section
- **WHEN** Advanced settings opened because Starting HP had a value and the GM clears Starting HP
- **THEN** Advanced settings stays open

#### Scenario: Saved values are unchanged
- **WHEN** the GM creates a creature with Starting HP 20, a colour and the Prone condition set under Advanced settings
- **THEN** the creature is saved with those values, exactly as before the change
