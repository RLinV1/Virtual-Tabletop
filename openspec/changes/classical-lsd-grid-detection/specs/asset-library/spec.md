# Asset library delta

## ADDED Requirements

### Requirement: Setup before unconfigured map placement
Selecting an unconfigured library map for a room SHALL open private setup before placement and SHALL read the original library asset's valid cached estimate. Placement SHALL require explicit confirmation of the prepared grid; cancellation SHALL leave the room unchanged. Configured maps SHALL retain existing placement behavior. UVTT-supplied grids and shipped calibrations SHALL remain authoritative.

#### Scenario: Select unconfigured library map
- **WHEN** the GM selects a library map with no saved grid
- **THEN** private setup opens with that asset's valid cached result, and no room map changes before explicit saving and placement

#### Scenario: Cancel setup
- **WHEN** the GM cancels setup for an unconfigured selection
- **THEN** the current room map is preserved
