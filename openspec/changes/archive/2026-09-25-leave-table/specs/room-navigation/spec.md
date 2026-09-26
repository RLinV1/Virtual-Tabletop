## ADDED Requirements

### Requirement: Players leave through Leave table
A player SHALL be able to leave a room from inside the room page through the "Leave table" control defined by the `leave-table` capability, instead of only by closing the tab. Leaving SHALL end at a session-ended screen, not at the home page.

#### Scenario: Player leaves from the room page
- **WHEN** a player confirms Leave table
- **THEN** the room's live connection is closed and the session-ended screen is shown without a full page reload
