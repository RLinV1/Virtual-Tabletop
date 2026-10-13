# Spec Delta

## MODIFIED Requirements

### Requirement: Apply publishes map and grid as one action
Applying a draft SHALL replace map, grid, applicable geometry, fog replacement and recorded token adjustments in one committed scene event. Token policy SHALL retain KAN-66's scale default and use current queued token positions. Every client SHALL receive a complete scene. The activity log SHALL show one undoable map action. Apply SHALL refuse stale baseline map/grid/walls/fog while allowing token movement alone.

#### Scenario: Apply
- **WHEN** the GM aligns a draft and clicks Apply map
- **THEN** every client shows the complete new map/grid/geometry with adjusted tokens and history gains one scene entry

#### Scenario: Apply rejected
- **WHEN** the draft grid creates too many lines or baseline geometry changed
- **THEN** the editor retains the draft and error and the room is unchanged

#### Scenario: Token moves during preparation
- **WHEN** a token moves before an otherwise valid Apply reaches the room queue
- **THEN** adjustment uses that token's current position without rejecting the preparation
