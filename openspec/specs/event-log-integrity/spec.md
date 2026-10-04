# event-log-integrity Specification

## Purpose
Guarantees that a room's recorded history can only grow, so recovery (undo, checkpoints, replay) can always trust the log, and protects that guarantee in the database itself rather than only in application code.

## Requirements

### Requirement: Events cannot be changed
The persistent store MUST reject any attempt to modify a stored event, whatever client or code path issues it.

#### Scenario: Update is rejected
- **WHEN** any database session runs an UPDATE on a stored event row
- **THEN** the statement fails with an error and the row is unchanged

### Requirement: Events cannot be removed outside room deletion
The persistent store MUST reject deleting stored events, and MUST reject emptying the event table, except when a room's events are deleted by the room-deletion operation in the same transaction that removes that room.

#### Scenario: Stray delete is rejected
- **WHEN** a database session deletes an event row without going through room deletion
- **THEN** the statement fails with an error and the row is still there

#### Scenario: Truncate is rejected
- **WHEN** a database session truncates the event table
- **THEN** the statement fails and no events are removed

#### Scenario: Room deletion still works
- **WHEN** the owning GM deletes a room
- **THEN** that room's events are removed together with the room, and other rooms' events are untouched

#### Scenario: Room deletion cannot remove another room's events
- **WHEN** the room-deletion transaction for room A attempts to delete an event of room B
- **THEN** the statement fails and the transaction rolls back

### Requirement: Recovery only appends
Undo and checkpoint restore SHALL record their effect as new events appended to the log. They MUST NOT modify or remove existing events.

#### Scenario: Undo leaves earlier events intact
- **WHEN** the GM undoes a token move
- **THEN** the log contains the original move event unchanged, followed by a new compensating event
