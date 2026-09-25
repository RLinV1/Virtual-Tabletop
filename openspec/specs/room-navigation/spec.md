# room-navigation Specification

## Purpose
Defines how a participant leaves the room page from inside it: the GM can go back to the home page, and players leave through Leave table, which ends their seat (see `leave-table`).

## Requirements

### Requirement: GM can return home from a room
The room page SHALL show the GM a "Home" link in the board toolbar that opens the GM dashboard. It SHALL NOT be shown to players.

#### Scenario: GM goes home
- **WHEN** the GM activates "Home" in a room
- **THEN** the GM dashboard opens without a full page reload, and the room's live connection is closed

#### Scenario: Player sees no Home link
- **WHEN** a player is in a room
- **THEN** the board toolbar has no Home link

#### Scenario: Reachable with the sidebar hidden
- **WHEN** the GM has collapsed the sidebar
- **THEN** the Home link is still visible in the toolbar

### Requirement: Players leave through Leave table
A player SHALL be able to leave a room from inside the room page through the "Leave table" control defined by the `leave-table` capability, instead of only by closing the tab. Leaving SHALL end at a session-ended screen, not at the home page.

#### Scenario: Player leaves from the room page
- **WHEN** a player confirms Leave table
- **THEN** the room's live connection is closed and the session-ended screen is shown without a full page reload
