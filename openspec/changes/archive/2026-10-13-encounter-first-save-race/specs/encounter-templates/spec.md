## MODIFIED Requirements

### Requirement: Save, discard and close a temporary room
Save SHALL write the temporary room's board to its template by the rules for saving a room's board, keeping the template's id, map and format version and updating its saved time. For a new template, the first Save SHALL ask for a name and create the template, and later saves SHALL update that same template. Saves of a new template that overlap (for example, a double click or a retried request) SHALL create exactly one template: the first to finish creates and names it, and each other save updates that template and succeeds with it. Creating a template and linking the temporary room to it SHALL happen together or not at all. Saving SHALL fail with a clear message, and change nothing, if the room's map is no longer the template's map. Discard SHALL return to the library without saving. Close SHALL return to the library, and when the room has changes since the last save it SHALL first ask whether to save, discard or keep editing. Leaving by Discard or Close SHALL delete the temporary room.

#### Scenario: Save an edit
- **WHEN** the GM moves a token, hides another and adds fog in the editing mode, then saves
- **THEN** the template holds the moved token, the hidden token and the new fog, and is listed first

#### Scenario: First save of a new template
- **WHEN** the GM saves a new encounter for the first time and names it "Crypt guards", then makes another change and saves again
- **THEN** the library holds one "Crypt guards" with both changes

#### Scenario: Overlapping first saves
- **WHEN** two first saves of the same new encounter reach the server at the same time
- **THEN** both succeed with the same template, the library holds one template for that encounter, and the temporary room saves to it

#### Scenario: Double click on Save
- **WHEN** the GM clicks Save twice before the first save finishes
- **THEN** the editor sends one save request

#### Scenario: Close with unsaved changes
- **WHEN** the GM moves a token and chooses Close, then Discard
- **THEN** the template is unchanged, the temporary room is deleted, and the library opens

#### Scenario: Close after saving
- **WHEN** the GM saves and then chooses Close
- **THEN** the library opens without a prompt and the temporary room is deleted
