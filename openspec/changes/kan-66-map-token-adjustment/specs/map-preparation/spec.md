# Spec Delta

## MODIFIED Requirements

### Requirement: Apply publishes map and grid as one action
Applying the draft SHALL replace the room's map, grid, and adjusted token positions in a single committed action. After Apply, every client SHALL show its permitted view of the new map, applied grid, and adjusted tokens. The activity log SHALL show one entry for the complete map action with its adjusted-token count and the existing Undo control; it SHALL NOT create separate entries for map-adjusted token positions. Rejected application SHALL keep the draft and display the server error without changing the room.

#### Scenario: Apply
- **WHEN** the GM aligns the grid on a draft map and clicks Apply map
- **THEN** the GM receives one committed map event, players receive filtered snapshots of the result, and history gains one entry for the complete map/grid/token change

#### Scenario: Apply rejected
- **WHEN** the GM applies a draft whose grid would draw too many lines for the map
- **THEN** the overlay stays open with the error, the draft is kept, and the room is unchanged

#### Scenario: Footprint rejection retains the draft
- **WHEN** the GM applies a draft too small for any token footprint
- **THEN** the overlay retains the image and grid, shows the actionable server error, and allows correction or retry

#### Scenario: Undo the applied map
- **WHEN** the GM activates the activity-log Undo control for a complete map action and guarded values match
- **THEN** map, grid, and positions are restored together, including removing a first map
