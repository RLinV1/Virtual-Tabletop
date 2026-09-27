# asset-library Specification

## Purpose
Lets a GM store, browse and manage map and token art before a session, place it into rooms, and delete it safely, without revealing library details to players.

## Requirements

### Requirement: Library ownership and access
Every library asset SHALL belong to exactly one GM identity. All library endpoints SHALL be GM-only, and every one MUST authorize on the server. A GM MUST NOT be able to list, read metadata of, rename, re-grid or delete another GM's assets.

#### Scenario: Another GM's asset
- **WHEN** GM B requests rename, delete or usage for an asset owned by GM A
- **THEN** the server responds 404 and the asset is unchanged

#### Scenario: Player credential rejected
- **WHEN** a request to a library endpoint carries only a room guest credential
- **THEN** the server responds 401

### Requirement: Upload to library
A GM SHALL be able to upload a PNG, JPEG or WebP image of up to 25 MB as either a map or a token, with a display name. The server SHALL record the image's pixel width and height. Stored object names MUST be random identifiers that do not contain the display name or original filename.

#### Scenario: Upload a map
- **WHEN** a GM uploads a 2048x1536 PNG named "Goblin Cave" as a map
- **THEN** the library lists a map "Goblin Cave" with size 2048x1536 and the default grid

#### Scenario: Unsupported file
- **WHEN** a GM uploads a GIF or a file over 25 MB
- **THEN** the upload is rejected with a clear message and nothing is added to the library

#### Scenario: Object name reveals nothing
- **WHEN** a GM uploads "beholder.png" as a token named "Beholder"
- **THEN** the image URL contains neither "beholder" nor "Beholder"

### Requirement: Browse and search the library
The library page (`/library`) SHALL show the GM's library in separate Maps, Token Art and Creatures tabs. Maps and Token Art SHALL show the GM's assets as thumbnails with name and pixel size. Creatures SHALL show the GM's creatures as described in `library-creatures`. Each tab SHALL filter by a case-insensitive name search. The GM SHALL be able to rename an asset.

#### Scenario: Tabs separate kinds
- **WHEN** a GM with two maps, three pieces of token art and one creature opens the Token Art tab
- **THEN** exactly the three pieces of token art are shown

#### Scenario: Search by name
- **WHEN** the GM types "gob" in the search field on the Maps tab
- **THEN** only maps whose name contains "gob", case-insensitively, are shown

### Requirement: Map assets carry a grid
Every map asset SHALL store a grid definition: cell size, offsets, and units per cell with a label. It defaults to the room default grid. Token assets SHALL store only the image, its size and a name.

#### Scenario: Default grid on upload
- **WHEN** a map is uploaded
- **THEN** its stored grid equals the room default grid

### Requirement: Place a library asset in a room
In a room, the GM SHALL be able to set the map or add a token from their library as well as by uploading a new image. Placing a map SHALL set the room's map and **copy** the asset's grid into the room in a single undoable action. Placing a token SHALL create a token that shows the asset's image. The room SHALL record which library asset each map or token came from.

#### Scenario: Map placement copies the grid
- **WHEN** the GM places library map "Goblin Cave" whose grid cell size is 64
- **THEN** the room's map is that image and the room's grid cell size is 64, committed together

#### Scenario: Undo map placement
- **WHEN** the GM undoes a library map placement
- **THEN** both the previous map and the previous grid are restored

#### Scenario: Later library edits do not change the room
- **WHEN** the GM changes the library grid of a map after placing it in a room
- **THEN** the room's grid is unchanged

### Requirement: Save grid to library
When the room's current map came from the GM's library, the GM SHALL be able to save the room's current grid back to that library asset. This happens only as an explicit action. Nothing in the room changes.

#### Scenario: Save a corrected grid
- **WHEN** the GM corrects the grid in a room and chooses "Save grid to library"
- **THEN** the library map's grid equals the room's grid, and later placements of that map use it

#### Scenario: Map not from the library
- **WHEN** the room's map was uploaded directly rather than placed from the library
- **THEN** "Save grid to library" is not offered

### Requirement: Edit a map's grid in the library
From the asset library, the GM SHALL be able to edit the grid of any map they own without opening a room. The editor SHALL offer the same fields and validation as the in-room grid correction: cell size, offsets, units per cell with a label, and line style. It SHALL show the draft grid over the whole map image, and the GM SHALL be able to zoom and pan that view. The editor SHALL open with the map's saved grid, with the cell size raised to the smallest drawable size if the saved value is below it. Saving SHALL replace the library map's grid. Cancelling or dismissing the editor SHALL leave the saved grid unchanged. Built-in example maps and token assets SHALL NOT offer grid editing.

The server MUST reject a saved grid whose cell size is too small for its lines to be drawn on that map at its stored pixel size, and MUST leave the stored grid unchanged. This is the same limit that applies to a room's grid.

Editing a library grid SHALL NOT change any room. It only affects later placements of the map.

#### Scenario: Edit and save a map's grid
- **WHEN** the GM opens Edit grid on their map "Goblin Cave", sets the cell size to 64 and saves
- **THEN** the library shows "Goblin Cave" with a 64 px grid, and no room was opened or changed

#### Scenario: Preview before saving
- **WHEN** the GM changes the offset in the editor without saving
- **THEN** the preview shows grid lines at the new offset over the map, and the library map's saved grid is unchanged

#### Scenario: Cancel discards the draft
- **WHEN** the GM changes the cell size and then cancels or dismisses the editor
- **THEN** the library map keeps its previous grid

#### Scenario: Invalid draft cannot be saved
- **WHEN** a field is blank, an offset is not less than the cell size, or the cell size is below the map's minimum drawable size
- **THEN** saving is disabled and the editor explains what to change

#### Scenario: Server rejects an undrawable grid
- **WHEN** a request saves a grid with cell size 0.1 to a 4000×3000 library map
- **THEN** the server responds 400 and the map's stored grid is unchanged

#### Scenario: No grid editing for built-in maps or tokens
- **WHEN** the GM views a built-in example map or any token in the library
- **THEN** no Edit grid action is offered

#### Scenario: Rooms keep their grid
- **WHEN** the GM edits the library grid of a map that is currently placed in room "Crypt"
- **THEN** the grid in "Crypt" is unchanged, and the next placement of that map in any room uses the edited grid

### Requirement: Warn before deleting an asset in use
An asset is **in use** when the current state of any room owned by its GM references it as the map or as a token's image. Hidden tokens count. Before deleting, the library SHALL show the names of the rooms using the asset and require confirmation. For token art, the confirmation SHALL also name the GM's creatures that use it as their image, and say that they will lose their image. An asset not in use by any room or creature SHALL still require a plain confirmation. Past references in a room's history do not count as in use.

#### Scenario: Deleting an asset in use
- **WHEN** the GM deletes a token asset used by tokens in rooms "Goblin Cave" and "Crypt"
- **THEN** a confirmation names both rooms and says they will show a generic token, and nothing is deleted until the GM confirms

#### Scenario: Deleting token art used by creatures
- **WHEN** the GM deletes token art used by the creatures "Goblin" and "Goblin Boss"
- **THEN** the confirmation names both creatures and says they will lose their image, and nothing is deleted until the GM confirms

#### Scenario: Reference removed from the board
- **WHEN** the only token using an asset is deleted from its room
- **THEN** the asset is no longer reported as in use by that room

#### Scenario: Confirmed deletion
- **WHEN** the GM confirms deletion
- **THEN** the asset disappears from the library and its image is no longer retrievable, rooms that referenced it fall back as described in `board-asset-fallback`, and creatures that used it have no image

### Requirement: Library details stay private
Library names, tags, the in-use listing, and the fact that an image comes from the library SHALL NOT be sent to player clients. Hidden tokens stay fully withheld from players under the existing visibility rules. A player MAY be able to load an image URL they already have. Nothing a player receives SHALL name the asset or reveal which assets a GM owns.

#### Scenario: Visible library token
- **WHEN** a player receives a visible token placed from the library
- **THEN** the token carries its image URL and an opaque asset identifier, but not the library name, and no endpoint available to the player resolves that identifier

#### Scenario: Hidden library token
- **WHEN** the GM places a hidden token from the library
- **THEN** players receive nothing about it, including its image URL and asset identifier

### Requirement: Browsing the library does not create an owner
Opening the asset library MUST NOT create a GM identity. A browser with no GM identity SHALL see an empty library and an invitation to upload, and SHALL make no request for its assets. The first upload SHALL create the GM identity, which then owns the uploaded asset.

#### Scenario: Browsing without an identity
- **WHEN** a browser with no GM token opens the asset library
- **THEN** an empty state and the upload action are shown, no request for library assets is made, no GM token is stored, and no identity is created on the server

#### Scenario: First upload creates the owner
- **WHEN** a browser with no GM token uploads a map to the library
- **THEN** a GM identity is created, the map is owned by it, and it is listed in the library afterwards
