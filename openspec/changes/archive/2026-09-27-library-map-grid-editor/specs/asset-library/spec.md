# Spec Delta

## ADDED Requirements

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
