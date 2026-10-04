## Purpose

Lets the GM prepare a new battle map (choose or upload the image and line up its grid) without the table seeing a half-finished scene, and publish it in one deliberate step.

## ADDED Requirements

### Requirement: A draft map is private until Apply
When the GM uploads a map or picks one from the library, the room SHALL NOT change. The image and its grid SHALL be held as a draft visible only in the GM's preparation overlay. Players MUST NOT receive any event, snapshot or ephemeral message about the draft.

#### Scenario: Upload while players watch
- **WHEN** the GM uploads a new map image during a session
- **THEN** players keep seeing the current map, and no player client receives any message about the upload

#### Scenario: Library map with a saved grid
- **WHEN** the GM picks a library map that has a saved grid
- **THEN** the preparation overlay opens showing that map with its saved grid, and the room is unchanged

### Requirement: Apply publishes map and grid as one action
Applying the draft SHALL replace the room's map and grid in a single committed action. After Apply, every client SHALL show the new map with the applied grid, and the activity log SHALL show one entry for it.

#### Scenario: Apply
- **WHEN** the GM aligns the grid on a draft map and clicks Apply map
- **THEN** every client shows the new map with that grid, and the room's history gains exactly one entry for the change

#### Scenario: Apply rejected
- **WHEN** the GM applies a draft whose grid would draw too many lines for the map
- **THEN** the overlay stays open with the error, the draft is kept, and the room is unchanged

### Requirement: Cancel discards the draft
Closing the preparation overlay without applying (Cancel, the close button, Escape, or a backdrop click) SHALL discard the draft and leave the room unchanged. If the GM changed the grid in the draft, the GM SHALL be asked to confirm discarding first.

#### Scenario: Cancel after uploading
- **WHEN** the GM uploads a map and then cancels
- **THEN** the room still shows the previous map and grid, and reopening preparation starts empty

#### Scenario: Escape with unsaved alignment
- **WHEN** the GM has moved grid anchors on a draft and presses Escape
- **THEN** a confirmation offers Keep editing or Discard, and only Discard closes the overlay

### Requirement: Preparation does not interrupt the room
Opening and closing the preparation overlay SHALL NOT disconnect the GM's connection or trigger a resync. On close, focus SHALL return to the control that opened it.

#### Scenario: Open and close
- **WHEN** the GM opens preparation, waits, and closes it
- **THEN** the GM's connection stays open with no new snapshot, and focus is back on the Upload map or From library control

#### Scenario: Events during preparation
- **WHEN** a player moves a token while the GM has the overlay open
- **THEN** the GM's board behind the overlay shows the move
