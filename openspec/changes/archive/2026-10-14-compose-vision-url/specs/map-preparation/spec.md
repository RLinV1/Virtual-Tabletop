## ADDED Requirements

### Requirement: Grid analysis works in the compose stack
When the app runs with `docker compose up`, the server SHALL reach the vision service, so an uploaded map's grid analysis finishes with a suggestion or "no grid found" instead of an error.

#### Scenario: Upload in the compose stack
- **WHEN** a GM uploads a map while the stack runs under docker compose and the vision service is up
- **THEN** the grid analysis does not end in an error caused by an unreachable vision service
