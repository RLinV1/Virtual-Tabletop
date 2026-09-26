## Purpose

Lets the GM who owns a room delete it permanently, removing the room and everything that exists only because of it, while leaving the GM's library and other rooms untouched.

## ADDED Requirements

### Requirement: Only the owning GM can delete a room
The server SHALL delete a room only when the request carries the GM identity that owns the room. Authorization MUST be decided on the server. A request with no GM identity, or one the server does not recognise, SHALL be refused with 401. A request for a room that does not exist, or that a different GM identity owns, SHALL be refused with 404, and the response MUST NOT reveal whether the room exists. A room with no owning GM identity SHALL NOT be deletable. A guest credential, including the room's in-room GM seat, SHALL NOT authorize deletion.

#### Scenario: Owner deletes their room
- **WHEN** the GM identity that owns a room sends a delete request for it
- **THEN** the room is deleted and the server responds with success

#### Scenario: Another GM cannot delete the room
- **WHEN** a different, recognised GM identity sends a delete request for the room
- **THEN** the server responds 404, the same as for a room that does not exist, and nothing is deleted

#### Scenario: No GM identity
- **WHEN** a delete request carries no GM token, or only a guest credential for the room
- **THEN** the server responds 401 and nothing is deleted

#### Scenario: Deleting twice
- **WHEN** the owner deletes a room and then sends the same delete request again
- **THEN** the second request gets 404

### Requirement: Deletion removes everything scoped to the room
Deleting a room SHALL remove, permanently and with no undo, all data that belongs only to that room. This covers the room itself, its full event history (and therefore every token, map, scene, fog region, wall, dice roll, message and participant in it), saved snapshots and checkpoints, every guest credential for it (including revoked ones), its invite code, its record of which library assets it uses, and every image uploaded into the room from inside it. The stored room data SHALL be removed atomically: after a failure, either all of it remains or none of it does. Uploaded images SHALL be removed after the room data is removed. Failing to remove an image SHALL NOT restore the room.

#### Scenario: Nothing of the room remains
- **WHEN** the owner deletes a room that has tokens, a map, rolls, joined players and an uploaded token image
- **THEN** the room no longer appears in the GM's room list, its history can no longer be loaded, its uploaded image returns 404, and no stored record refers to the room

#### Scenario: Partial failure leaves the room intact
- **WHEN** removing the room's stored data fails partway through
- **THEN** the room and all its data are still present and the delete request reports an error

### Requirement: Deletion leaves everything outside the room untouched
Deleting a room SHALL NOT delete or alter the GM's library assets, including assets placed in the deleted room, the GM's other rooms, or the GM identity. The deleted room SHALL stop appearing in a library asset's list of rooms that use it.

#### Scenario: Library asset used in the deleted room survives
- **WHEN** a GM places a library map in rooms "Crypt" and "Keep" and then deletes "Crypt"
- **THEN** the map is still in the GM's library, still shows in "Keep", and its in-use list names only "Keep"

#### Scenario: Other rooms are unaffected
- **WHEN** a GM who owns two rooms deletes one of them
- **THEN** the other room keeps all of its state, participants and invite link

### Requirement: People in a deleted room are told and disconnected
When a room is deleted, every connection to it SHALL be ended at once. Each connected participant SHALL be told the session ended because the room was deleted, and their client SHALL NOT try to reconnect. The room SHALL accept no further commands or ephemeral messages from the moment deletion begins. A later attempt to connect or join with an old guest credential or invite link SHALL be refused the same way as for a room that never existed.

#### Scenario: Player at the table when the room is deleted
- **WHEN** the owner deletes a room while a player and the GM have it open
- **THEN** both see that the room was deleted by its GM, and neither client tries to reconnect

#### Scenario: Command during deletion
- **WHEN** a client submits a command after deletion has begun
- **THEN** the command is not committed

#### Scenario: Old invite link
- **WHEN** someone opens the deleted room's invite link and tries to join
- **THEN** the join is refused as for an unknown invite, and no credential or room is created
