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
