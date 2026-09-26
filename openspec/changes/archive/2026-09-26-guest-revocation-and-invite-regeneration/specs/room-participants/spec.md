## ADDED Requirements

### Requirement: Revoked participants are not listed or assignable
A revoked participant SHALL NOT appear in the room's participant list or be counted in it. A revoked participant SHALL NOT be offered in any owner picker. The server SHALL reject with `invalid` a command that creates a token or sets token owners when it names a revoked participant. Revoked participants SHALL stay in the room's history, so earlier activity log entries still show their name.

#### Scenario: Revoked player leaves the list
- **WHEN** the room has players "Sam" and "Alex" and the GM revokes Sam
- **THEN** the participants list shows the GM and Alex, and the count drops by one

#### Scenario: Cannot give a token to a revoked player
- **WHEN** the GM sends `token.setOwners` naming a revoked participant
- **THEN** the command is rejected with `invalid` and the token's owners are unchanged

#### Scenario: History keeps the name
- **WHEN** Sam moved a token and was later revoked
- **THEN** the activity log still shows "Sam moved ..." for that entry, followed by "GM removed Sam from the room"
