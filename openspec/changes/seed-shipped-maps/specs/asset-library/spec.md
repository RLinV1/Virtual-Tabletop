## ADDED Requirements

### Requirement: Deleting a seeded map keeps the shipped file
Deleting a library map that was seeded from the shipped maps SHALL remove only the library row. The shipped image file SHALL remain served.

#### Scenario: Delete a seeded map
- **WHEN** the GM deletes the seeded Hollowfrost Keep
- **THEN** the row is gone, its image still loads for rooms and other accounts, and no stored object is deleted

### Requirement: A room on a shipped map saves an encounter
When a room's map has no library asset id but its URL is a shipped map's, saving an encounter SHALL use the owner's library row for that map. If the owner deleted that row, the save SHALL be refused with the existing "put this room's map in your library" message.

#### Scenario: Room placed a shipped map before this change
- **WHEN** the GM saves an encounter from a room whose map is `/img/map-ice.webp` with no asset id
- **THEN** the template is saved with the owner's Hollowfrost Keep row as its map

### Requirement: Edit grid opens in the map editor's layout
The library's Edit grid and Set up grid SHALL open the same full-screen editor shell the room's map editor uses, with its header, a Grid step and the resizable side panel holding the grid form, instead of a small dialog.

#### Scenario: Open Edit grid
- **WHEN** the GM presses Edit grid on a library map
- **THEN** a full-screen editor opens on the Grid step with the map and the grid form in the side panel

### Requirement: A map uploaded in a room can be kept in the library
When a signed-in GM uploads a map in a room's map editor, the editor SHALL offer "Also save uploads to my library", on by default. When on, the upload SHALL be stored as a library map and the room SHALL link to it by asset id, with the same automatic grid suggestion as any library upload. When off, the upload SHALL stay a room-only map.

#### Scenario: Upload with the option on
- **WHEN** the GM uploads a map in the room editor with the option on
- **THEN** the map appears in the library, and applying it records its asset id in the room

#### Scenario: Upload with the option off
- **WHEN** the GM turns the option off and uploads a map
- **THEN** nothing is added to the library
