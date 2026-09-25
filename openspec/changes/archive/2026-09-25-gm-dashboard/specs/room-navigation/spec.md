# Spec Delta

## MODIFIED Requirements

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
