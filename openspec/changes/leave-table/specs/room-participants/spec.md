## ADDED Requirements

### Requirement: Participants list shows active participants only
The room's participants list and its count SHALL include only active participants. A participant who has left the room SHALL NOT appear in the list or be counted, and SHALL NOT be offered as a token owner in any owner picker.

#### Scenario: Departed player disappears from the list
- **WHEN** the room has the GM, Sam and Kim, and Sam leaves
- **THEN** every client's participants list shows the GM and Kim with a count of 2

#### Scenario: Owner picker skips departed players
- **WHEN** the GM opens a token's owner choices after Sam left
- **THEN** Sam is not offered

## MODIFIED Requirements

### Requirement: Only active participants hold a name
Only active participants SHALL block a display name. A participant who has left the room or whose access was revoked SHALL NOT block another participant from taking that name. A returning guest who reconnects with their existing credential SHALL keep their own name, and the reconnect SHALL NOT be treated as a collision with themselves.

#### Scenario: Reconnecting guest keeps their name
- **WHEN** guest "Raymond" disconnects and reconnects to the room with the same stored credential
- **THEN** the reconnect succeeds, no join is performed, and the guest is still "Raymond"

#### Scenario: Revoked participant frees the name
- **WHEN** the room records that participant "Raymond" was revoked, and a new guest joins as "Raymond"
- **THEN** the join succeeds

#### Scenario: Departed participant frees the name
- **WHEN** participant "Raymond" leaves the table, and a new guest then joins as "Raymond"
- **THEN** the join succeeds as a new participant, and the departed participant's record is unchanged
