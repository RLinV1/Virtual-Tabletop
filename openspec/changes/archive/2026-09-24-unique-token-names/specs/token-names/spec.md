## Purpose

Defines how tokens are named within a room, so that the roster, turn order, activity log and pings each point at exactly one token, without making the GM type a distinct name for every copy of a creature.

## ADDED Requirements

### Requirement: Token names are unique within a room
Within one room, no two existing tokens SHALL have the same name. Two names SHALL be the same when they are equal after trimming surrounding whitespace and ignoring letter case. Hidden tokens SHALL count. The rule SHALL apply per room only. The same name MAY be used in a different room. The server SHALL make this decision. A client-side check SHALL only be a hint.

#### Scenario: Names that differ only in case or surrounding spaces collide
- **WHEN** a room has a token named "Goblin"
- **THEN** "goblin", "Goblin " and "  GOBLIN" are all treated as the name already in use

#### Scenario: Same name in another room
- **WHEN** room A has a token named "Goblin" and the GM of room B creates a token named "Goblin"
- **THEN** the room B token is named "Goblin"

#### Scenario: Hidden tokens hold their name
- **WHEN** a room has a hidden token named "Goblin" and the GM creates a visible token named "Goblin"
- **THEN** the new token is named "Goblin 2"

### Requirement: Creating a token with a name in use numbers it
When the GM creates a token with a name that another token in the room already has, the server SHALL accept the command and give the new token the name followed by a space and the lowest whole number, starting at 2, that makes it unique. The token SHALL NOT be rejected for its name. A token whose name is not in use SHALL keep that name with no number added.

#### Scenario: Second and third copies are numbered
- **WHEN** the GM creates three tokens named "Goblin" in a room with no other tokens
- **THEN** they are named "Goblin", "Goblin 2" and "Goblin 3"

#### Scenario: A lone token is not numbered
- **WHEN** the GM creates one token named "Goblin" in a room with no other goblin
- **THEN** it is named "Goblin", not "Goblin 1"

#### Scenario: The number keeps the typed case of the name
- **WHEN** a room has a token named "Goblin" and the GM creates a token named "goblin"
- **THEN** the new token is named "goblin 2"

#### Scenario: A typed number that is taken is renumbered
- **WHEN** a room has tokens named "Goblin" and "Goblin 2" and the GM creates a token named "Goblin 2"
- **THEN** the new token is named "Goblin 3"

#### Scenario: A typed number that is free is kept
- **WHEN** a room has a token named "Goblin" and the GM creates a token named "Goblin 7"
- **THEN** the new token is named "Goblin 7"

#### Scenario: Numbered name stays within the length limit
- **WHEN** a room has a token whose name is 60 characters long and the GM creates a token with the same name
- **THEN** the new token's name is at most 60 characters, ends in " 2", and starts with the original name shortened to fit

#### Scenario: Numbering is the same on replay
- **WHEN** the room's events are replayed from the start
- **THEN** every token has the same name it had when it was created

### Requirement: Deleted tokens free their name
Only tokens that currently exist in the room SHALL hold a name. After a token is deleted, its name SHALL be available again, and numbering SHALL reuse the lowest free number.

#### Scenario: Deleting a numbered token frees its number
- **WHEN** a room has "Goblin", "Goblin 2" and "Goblin 3", the GM deletes "Goblin 2", and then creates a token named "Goblin"
- **THEN** the new token is named "Goblin 2"

#### Scenario: Deleting the plain name frees it
- **WHEN** a room has "Goblin" and "Goblin 2", the GM deletes "Goblin", and then creates a token named "Goblin"
- **THEN** the new token is named "Goblin"

### Requirement: Token names are trimmed and must not be blank
The server SHALL trim surrounding whitespace from a token name on create and SHALL store the trimmed value. A token name that is empty after trimming SHALL be rejected, and no token SHALL be created.

#### Scenario: Surrounding spaces are removed
- **WHEN** the GM creates a token named "  Goblin  "
- **THEN** the token's stored and broadcast name is "Goblin"

#### Scenario: Whitespace-only name
- **WHEN** the GM creates a token named "   "
- **THEN** the command is rejected and no `TokenCreated` event is appended

### Requirement: Concurrent creates never produce duplicates
When two token creations with the same name reach the server at about the same time, the server SHALL apply them one after another, so each sees the other's result and the two tokens get different names.

#### Scenario: Two creates race for the same name
- **WHEN** a room has no goblin and two `token.create` commands named "Goblin" are sent at the same time
- **THEN** both are accepted, and the room has exactly one token named "Goblin" and one named "Goblin 2"
