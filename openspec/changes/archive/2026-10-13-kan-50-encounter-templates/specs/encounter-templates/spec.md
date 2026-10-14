## ADDED Requirements

### Requirement: Save a room's board as a template
A signed-in GM SHALL be able to save the current board of a room they own as a named encounter template (FR-GM-13). The name SHALL be 1 to 60 characters after trimming. The server MUST build the template from the room's live state, never from client-supplied board data. The template SHALL hold the map (as a reference to the GM's library map), the grid, every token with its look, size, position, hidden flag, stats, conditions and attacks but without its owners or initiative score, and every fog region. The template SHALL belong to the GM's account. A GM SHALL NOT hold more than 50 templates. A room with no map, or whose map is not one of the GM's library maps, MUST NOT be saved, and the response SHALL say the map must be in the library first.

#### Scenario: Save a prepared board
- **WHEN** the GM of a room with a library map, a grid, three tokens (one hidden) and one fog region saves it as "Goblin ambush"
- **THEN** the library lists "Goblin ambush", and applying it later restores that map, grid, three tokens (the hidden one still hidden) and the fog region

#### Scenario: Owners and initiative are not saved
- **WHEN** a template is saved from a room where a player owns a token and an encounter is running
- **THEN** the template's tokens have no owners and no initiative scores

#### Scenario: Not the GM of that room
- **WHEN** a signed-in user who does not own the room, or a player, asks to save it as a template
- **THEN** the server responds 404 and stores nothing

#### Scenario: Map not in the library
- **WHEN** the GM saves a room whose map was uploaded directly and is not a library map, or that has no map
- **THEN** the server responds 400 and stores nothing

#### Scenario: Blank name or too many templates
- **WHEN** the GM saves with a blank name, or already holds 50 templates
- **THEN** the server responds 400 and stores nothing

### Requirement: Templates are private to their GM
Every template read and write SHALL be scoped to the signed-in GM's account. A template that belongs to another account MUST get the same 404 response as one that does not exist. Template data SHALL NOT reach any room participant except as part of an applied board filtered for that viewer.

#### Scenario: Another GM's template
- **WHEN** a GM asks to read, rename, delete or apply a template id that belongs to another GM
- **THEN** the server responds 404, the same as for an id that does not exist

#### Scenario: Not signed in
- **WHEN** a request without a signed-in account lists or saves templates
- **THEN** the server rejects it and nothing is read or stored

### Requirement: Manage templates in the library
The GM's library SHALL list the GM's templates, newest first, each with its name, map name, token count and saved time. The GM SHALL be able to rename and delete a template. A template that uses a library map SHALL appear in that map's usage warning, so deleting the map tells the GM which templates would break.

#### Scenario: List, rename, delete
- **WHEN** the GM renames "Goblin ambush" to "Ambush v2" and then deletes it
- **THEN** the list shows the new name, and after the delete the template is gone and applying it answers 404

#### Scenario: Map usage warning
- **WHEN** the GM asks where a map is used and a template holds that map
- **THEN** the answer includes the template's name

### Requirement: Apply a template to a new room
When creating a room, a signed-in GM SHALL be able to choose one of their templates. The new room SHALL start with that template's board. Tokens SHALL get new ids and no owners. If the template no longer exists or its map is gone, the room SHALL NOT be created and the response SHALL say why.

#### Scenario: Start a room from a template
- **WHEN** the GM creates a room and chooses "Goblin ambush"
- **THEN** the room opens with the saved map, grid, tokens and fog, and the GM seated as usual

#### Scenario: Template or map deleted
- **WHEN** the GM creates a room from a template whose map was deleted
- **THEN** the server responds 409, no room is created, and the message names the problem

### Requirement: Apply a template to an existing room
The GM of a room SHALL be able to apply a template to it. Applying SHALL replace the room's whole board (map, grid, tokens, fog) with the template's, end any running encounter, and clear area templates. It MUST go through the command pipeline as `encounter.apply`, authorised in `decide` as GM only. The event SHALL carry the applied board and the board it replaced, so it can be undone. The room's participants, chat, rolls, checkpoints and name SHALL be untouched. The web client SHALL ask for confirmation before sending the command. Players MUST NOT receive the event; they SHALL receive a fresh filtered snapshot, so hidden tokens and fog-concealed content stay hidden.

#### Scenario: Replace a board
- **WHEN** the GM applies "Goblin ambush" to a room with other tokens and an active initiative order
- **THEN** the room shows the template's board, the initiative order is cleared, and chat and participants are unchanged

#### Scenario: Undo an apply
- **WHEN** the GM undoes the apply
- **THEN** the previous board returns exactly, including its tokens' owners

#### Scenario: Player cannot apply
- **WHEN** a player sends `encounter.apply`
- **THEN** the command is rejected as forbidden and the board is unchanged

#### Scenario: Players see no hidden content
- **WHEN** the GM applies a template that holds a hidden token and a fog region
- **THEN** each player gets a resync with the hidden token absent and concealed content withheld, and no event naming either

#### Scenario: Forged or foreign template
- **WHEN** an `encounter.apply` names a template the sender's account does not own, or one that does not exist
- **THEN** it is rejected with the same message and the board is unchanged

### Requirement: Template data is validated
Template data SHALL be validated with the shared schema when stored and when applied. A stored template SHALL carry a format version. Applying a template whose version the server does not know, or whose data fails validation, MUST be rejected with a clear message and commit nothing.

#### Scenario: Unknown version
- **WHEN** a template with an unknown format version is applied
- **THEN** the apply is rejected and the room is unchanged
