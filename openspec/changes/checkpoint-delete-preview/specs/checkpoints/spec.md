## ADDED Requirements

### Requirement: GM deletes a checkpoint
The GM SHALL be able to delete any saved checkpoint. Deleting SHALL remove it from the checkpoint list and SHALL NOT change the table, participants, chat, dice history, or other checkpoints. Deleting SHALL be recorded as a new entry at the end of the room's history; earlier history MUST NOT be modified or removed. Players MUST NOT be able to delete a checkpoint.

#### Scenario: GM deletes a checkpoint
- **WHEN** the GM deletes the checkpoint "Before the ambush"
- **THEN** it no longer appears in the checkpoint list, the board is unchanged, and the other checkpoints remain

#### Scenario: Other checkpoints still restore
- **WHEN** the GM saves checkpoints A and B, deletes A, and restores B
- **THEN** the board returns to exactly how it was when B was saved

#### Scenario: Deleted checkpoint cannot be restored
- **WHEN** a restore is requested for a checkpoint that has been deleted
- **THEN** the server rejects it as not found and the table is unchanged

#### Scenario: Player tries to delete one
- **WHEN** a player sends a checkpoint delete command
- **THEN** the server rejects it as forbidden and the checkpoint stays

#### Scenario: Delete is confirmed first
- **WHEN** the GM clicks Delete on a checkpoint in the panel
- **THEN** the panel asks for confirmation, and nothing is deleted until the GM confirms

#### Scenario: Activity log
- **WHEN** the GM deletes a checkpoint
- **THEN** the activity log's newest entry says the GM deleted that checkpoint by name

### Requirement: GM previews a checkpoint
The GM SHALL be able to preview a saved checkpoint before restoring it. The preview SHALL show the board as it was when the checkpoint was saved: the map, every token (hidden ones marked as hidden), placed area templates, fog regions, and initiative order. Previewing MUST NOT change the table or the room's history, and MUST NOT be visible to players. Players MUST NOT be able to preview a checkpoint.

#### Scenario: Preview shows the saved board
- **WHEN** the GM saves a checkpoint, then moves tokens and adds a token, and then previews the checkpoint
- **THEN** the preview lists the tokens as they were at the checkpoint, not as they are now

#### Scenario: Preview changes nothing
- **WHEN** the GM previews a checkpoint
- **THEN** the live board is unchanged and no event is appended to the room's history

#### Scenario: Restore from the preview
- **WHEN** the GM previews a checkpoint and chooses Restore from the preview
- **THEN** the same confirmation and restore as the checkpoint list apply

#### Scenario: Player tries to preview
- **WHEN** a player requests a checkpoint preview
- **THEN** the server rejects it as forbidden and returns no board data

#### Scenario: Deleted or unknown checkpoint
- **WHEN** a preview is requested for a checkpoint that does not exist or has been deleted
- **THEN** the server answers not found

## MODIFIED Requirements

### Requirement: Checkpoints never reveal hidden information
Players MUST NOT receive the checkpoint list, checkpoint names, checkpoint previews, checkpoint deletions, or any token or template that is hidden from them at the checkpoint or before the restore. After a restore, each player SHALL see the restored table filtered for them.

#### Scenario: Player's view of the checkpoint list
- **WHEN** the GM has saved checkpoints
- **THEN** no player's state or event stream contains a checkpoint id or name

#### Scenario: Restoring a checkpoint with a hidden token
- **WHEN** the GM restores a checkpoint in which a goblin token was hidden
- **THEN** players' boards do not show the goblin, and no message a player receives contains that token

#### Scenario: Deleting a checkpoint
- **WHEN** the GM deletes a checkpoint
- **THEN** no player's event stream contains that checkpoint's id or name
