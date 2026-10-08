## ADDED Requirements

### Requirement: Invite joins are rate-limited per address
The server SHALL accept at most 30 join attempts through a room's invite from one IP address within 15 minutes. Further attempts from that address to that room SHALL be refused with HTTP 429 and a `Retry-After` header until the window passes. Every attempt to a room that exists SHALL count, whether the join is accepted or refused. A rate-limited join SHALL NOT add a participant, SHALL NOT append any event and SHALL NOT leave a stored credential behind. The limit SHALL be counted separately for each room. An invite code that names no room SHALL still be answered with 404 and SHALL NOT count. Reconnecting with a stored credential and resuming a kept seat SHALL NOT count. The join page SHALL show the refusal's message and SHALL NOT mark the name field as the cause.

#### Scenario: The 31st join from one address is refused
- **WHEN** one address makes 30 join attempts to a room within 15 minutes, then a 31st
- **THEN** the 31st is refused with 429 and a `Retry-After` header, no event is appended, and its token does not open a connection to the room

#### Scenario: The join page explains the refusal
- **WHEN** a person at a limited address submits the join form
- **THEN** the page says there have been too many joins from this address, and the name field is not marked invalid

#### Scenario: Another room is not affected
- **WHEN** an address has reached the limit for one room and joins a different room
- **THEN** the join succeeds

#### Scenario: Window passes
- **WHEN** the 15-minute window after the limit was reached has passed
- **THEN** a join from that address succeeds
