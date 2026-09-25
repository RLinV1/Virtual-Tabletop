# room-activity-log Specification

## Purpose
Let the GM inspect committed room actions with actor attribution, including actions older than the live client's state window (FR-REC-01).

## Requirements

### Requirement: GM-only committed history
The system SHALL provide history only to an authenticated GM of the requested room. It MUST NOT expose history entries or metadata to players, invalid credentials, or credentials belonging to another room. Every returned event MUST pass the existing per-viewer visibility policy. Ephemeral actions SHALL NOT appear.

#### Scenario: Unauthorized history request
- **WHEN** a player or another room's GM requests history containing hidden-token actions and GM-only rolls
- **THEN** access is denied with no history entries or metadata

#### Scenario: GM reads older history
- **WHEN** the room GM requests history after more than 30 dice rolls
- **THEN** older committed actions remain accessible, including GM-only actions

### Requirement: Stable pagination and actor search
History SHALL be newest-first, default to 50 entries, accept a limit from 1 to 100, and use an exclusive sequence cursor. Case-insensitive actor-name substring search SHALL apply across history before pagination, using names at the time of the action. Invalid queries SHALL be rejected.

#### Scenario: New activity during pagination
- **WHEN** a GM loads a page, another action commits, and the GM loads the next page
- **THEN** older entries are returned without duplicating or skipping entries from the original page boundary

#### Scenario: Search beyond the first page
- **WHEN** a GM searches for a player's name whose actions are older than the first page
- **THEN** matching actions are returned regardless of whether previously loaded

### Requirement: Readable attributed actions
Every supported event SHALL have a sentence describing its action and actor, with System for a null actor and a readable fallback for missing names. Token names SHALL remain available for actions preceding deletion. Entries SHALL include their committed timestamp and sequence.

#### Scenario: Movement and dice
- **WHEN** Mara moves Goblin and Tomas rolls 1d20 with a total of 15
- **THEN** history describes Mara moving Goblin and Tomas rolling 1d20: 15

#### Scenario: Renaming and deletion
- **WHEN** an actor changes name or a token is deleted after an action
- **THEN** the earlier entry retains names appropriate to that earlier action

### Requirement: Room activity modal
The GM room page SHALL offer an Activity log modal with player search, older-page loading, refresh, and loading, error, and empty states. It SHALL support Escape dismissal and keyboard focus management. Existing dice history SHALL remain available.

#### Scenario: Open and refresh
- **WHEN** the GM opens the activity log or refreshes after new activity
- **THEN** the latest matching entries are fetched and displayed newest-first

#### Scenario: Player room controls
- **WHEN** a player opens the room page
- **THEN** no Activity log control is offered
