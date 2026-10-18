## ADDED Requirements

### Requirement: The library edits walls and fog like the room editor
The asset library's map editor SHALL offer a Grid, a Walls and a Fog step, the same tools and layout as the room's map editor. Walls and fog edited there SHALL be a private draft saved to the library map with Save changes, with Discard, and a confirmation before closing with unsaved changes. Placing that map in a room SHALL add its saved walls and fog to the room through the room's own commands; a map with none SHALL leave the room's walls and fog as they are.

#### Scenario: Prepare walls on a library map
- **WHEN** the GM draws walls in the library editor and presses Save changes
- **THEN** reopening the editor shows them, and placing the map in a room adds those walls to the room

#### Scenario: Close with unsaved changes
- **WHEN** the GM closes the library editor with unsaved wall or fog changes
- **THEN** the editor asks before discarding them

### Requirement: Wall detection is offered only when the service is up
The Walls step SHALL show Automatic detection and the Pick tool only while the vision service reports available, and SHALL leave them out otherwise. The library editor SHALL NOT offer detection.

#### Scenario: Service down
- **WHEN** the vision service is unavailable
- **THEN** the Walls step shows Draw, Erase and Door only, with no detection controls
