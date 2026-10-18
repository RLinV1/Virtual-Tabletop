# Spec Delta

## ADDED Requirements

### Requirement: Save room UVTT uploads to the library when selected
The room editor SHALL honor its library-saving option for UVTT files. The server SHALL require an active GM credential and the live account holding that seat. The saved library map SHALL contain the initial validated grid and geometry; subsequent room edits SHALL remain local to the room preparation. Room publication SHALL still require Apply.

#### Scenario: Save selected
- **WHEN** the GM imports UVTT with library saving selected
- **THEN** a complete reusable library map is saved immediately and the room remains unchanged until Apply

#### Scenario: Cancel or delete the room
- **WHEN** the GM cancels a prepared import or deletes its room
- **THEN** a successfully saved library map and its image remain available

#### Scenario: Save not selected
- **WHEN** the GM imports UVTT with library saving cleared
- **THEN** the image has room-upload retention and no library asset is created

### Requirement: Apply complete library maps atomically
New library map placements SHALL reference server-resolved owned geometry and commit one MapSet containing image, grid, replacement walls/fog and current token adjustments. Server-assigned entity IDs, player-safe filtering and exact guarded undo SHALL apply to the whole placement. Missing or invalid assets and failed persistence SHALL change nothing. Later library edits SHALL NOT change already applied rooms. Historical map events SHALL retain their meaning.

#### Scenario: Complete placement
- **WHEN** the GM applies a library map
- **THEN** clients receive one complete scene, players receive filtered snapshots, and the activity log offers one Undo restoring the prior scene and affected positions

#### Scenario: Repeat placement
- **WHEN** the same library map is applied again
- **THEN** its saved geometry replaces the current geometry without appending duplicates

#### Scenario: Failed placement
- **WHEN** the saved map is unavailable or the event append fails
- **THEN** no partial scene is visible and the editor retains the draft for recovery
