## Purpose

Defines who is in a room and how each participant is identified to everyone else, so that the GM's per-person controls (ownership, participants list, revocation) always point at one unambiguous person.

## ADDED Requirements

### Requirement: Display names are unique within a room
Within one room, no two active participants SHALL have the same display name. Two names SHALL be the same when they are equal after trimming surrounding whitespace and ignoring letter case. The rule SHALL apply per room only. The same name MAY be in use in a different room. The server SHALL make this decision. A client-side check SHALL only be a hint.

#### Scenario: Names that differ only in case or surrounding spaces collide
- **WHEN** a room has an active participant named "Raymond"
- **THEN** "raymond", "Raymond " and "  RAYMOND" are all treated as the name already in use

#### Scenario: Same name in another room
- **WHEN** a guest joins room B as "Raymond" while room A has an active participant named "Raymond"
- **THEN** the join to room B succeeds

### Requirement: Joining with a name already in use is rejected
When a guest joins through an invite with a display name that an active participant in that room already has, the server SHALL reject the join. The rejection SHALL be an HTTP 409 response. Its `error` message SHALL name the conflict and tell the user to choose another name. A rejected join SHALL NOT add a participant to the room, SHALL NOT append any event, and SHALL NOT leave a stored credential behind.

#### Scenario: Duplicate join is rejected
- **WHEN** a room has an active participant named "Raymond" and a guest submits the join form with "raymond"
- **THEN** the server responds 409 with a message saying the name is taken in this room, and the participant list is unchanged

#### Scenario: Rejected join leaves no credential
- **WHEN** a join is rejected for a duplicate name
- **THEN** the guest token sent with that request does not authenticate a socket connection to the room

#### Scenario: Two guests race for the same name
- **WHEN** two guests submit joins to the same room with the name "Sam" at the same time
- **THEN** exactly one join succeeds, the other receives 409, and the room has exactly one participant named "Sam"

### Requirement: Renaming to a name already in use is rejected
When a participant sends `participant.rename` with a display name that another active participant in the room already has, the server SHALL reject the command before any event is emitted. The rejection SHALL use the existing command rejection reply with a message telling the user the name is taken. A participant SHALL be allowed to rename to a name that differs from their own current name only in case or surrounding whitespace.

#### Scenario: Rename collides with another participant
- **WHEN** participants "Alex" and "Sam" are in a room and Sam sends `participant.rename` with "ALEX"
- **THEN** the command is rejected, no `ParticipantRenamed` event is appended, and Sam's name stays "Sam"

#### Scenario: Changing the case of your own name
- **WHEN** a participant named "sam" renames to "Sam"
- **THEN** the rename is accepted and `ParticipantRenamed` carries `previous: "sam"`

### Requirement: Display names are trimmed and must not be blank
The server SHALL trim surrounding whitespace from a display name on room creation, join, and rename, and SHALL store the trimmed value. A display name that is empty after trimming SHALL be rejected. For a join, the rejection SHALL be HTTP 400.

#### Scenario: Surrounding spaces are removed
- **WHEN** a guest joins as "  Raymond  "
- **THEN** the participant's stored and broadcast display name is "Raymond"

#### Scenario: Whitespace-only name
- **WHEN** a guest joins with the display name "   "
- **THEN** the server responds 400 and no participant is added

### Requirement: Only active participants hold a name
Only active participants SHALL block a display name. A participant who has left the room or whose access was revoked SHALL NOT block another participant from taking that name. A returning guest who reconnects with their existing credential SHALL keep their own name, and the reconnect SHALL NOT be treated as a collision with themselves.

#### Scenario: Reconnecting guest keeps their name
- **WHEN** guest "Raymond" disconnects and reconnects to the room with the same stored credential
- **THEN** the reconnect succeeds, no join is performed, and the guest is still "Raymond"

#### Scenario: Revoked participant frees the name
- **WHEN** the room records that participant "Raymond" was revoked, and a new guest joins as "Raymond"
- **THEN** the join succeeds

### Requirement: Join form shows a name conflict inline
When a join is rejected because the name is taken, the join form SHALL show the server's message next to the name field. The form SHALL keep the name the user typed and stay usable, so the user can change the name and submit again without reloading the page.

#### Scenario: User picks another name after a conflict
- **WHEN** a guest submits "Raymond", gets the name-taken message, changes the name to "Ray" and submits again
- **THEN** the second submit joins the room without the page reloading
