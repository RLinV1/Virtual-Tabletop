## ADDED Requirements

### Requirement: Preview a saved template
Each encounter template in the library whose map still exists SHALL offer Preview, a read-only view of its map, grid, every token (hidden ones marked) and fog, with pan and zoom. Preview SHALL NOT change the template. Another account's template SHALL answer as one that does not exist.

#### Scenario: Open a preview
- **WHEN** the GM presses Preview on a template
- **THEN** a full-screen view shows the saved board, with hidden tokens dimmed, and closing it changes nothing
