# Spec Delta

## Purpose

Keeps every room token usable and private when the GM replaces a battle map, and lets the GM reverse that map action exactly through the room's committed history.

## ADDED Requirements

### Requirement: Map replacement readjusts token centers atomically
When the GM replaces a room map, the room SHALL scale each existing token center independently on the horizontal and vertical axes by the ratio of new map size to old map size, then clamp the scaled center to the new map bounds. The map, any grid copied with it, and all changed token centers SHALL be one committed action. This SHALL apply to direct uploads and library placements, including visible, hidden, and player-owned tokens. It SHALL NOT require a player to reconnect to see the result. An initial map placement with no previous map SHALL leave preexisting token centers unchanged.

#### Scenario: Scale then clamp
- **WHEN** a GM replaces a 1000×800 map with a 500×400 map while a size-one token sits at (800, 600) and the resulting grid cell size is 50
- **THEN** one map action puts that token at (400, 300) and every connected viewer authorized to see it has the new map and position

#### Scenario: Clamp a token at the edge
- **WHEN** the same replacement starts with a size-one token at (990, 790)
- **THEN** its scaled center (495, 395) is clamped to (475, 375), keeping its 50-pixel footprint inside the new image

#### Scenario: First map has no scaling baseline
- **WHEN** the GM places the first map in a room that already contains tokens
- **THEN** their centers remain unchanged and the map is committed as one action

#### Scenario: Map changes during a local token drag
- **WHEN** a map replacement reaches a client while that client is dragging a token but has not dropped it
- **THEN** the drag is cancelled and the board shows the authoritative adjusted token center without sending the stale drop

### Requirement: Token footprint follows the accepted grid
`Token.size` SHALL remain a count of grid cells and SHALL NOT be rewritten as a pixel size by map replacement. For clamping, the room SHALL use the grid accepted with the new map, or the existing grid when none is supplied, and SHALL leave a full token footprint inside each map axis whenever it fits. When a footprint exceeds an axis, the token center SHALL be placed at that axis midpoint without changing `size`. Proportional placement SHALL NOT snap a token to grid lines.

#### Scenario: Library grid changes rendered footprint
- **WHEN** a size-two token is on a room with a 70-pixel grid and the GM places a map whose copied grid has 40-pixel cells
- **THEN** its `size` remains two, its rendered footprint becomes 80 pixels, and its new center is clamped using a 40-pixel half-footprint

#### Scenario: Token larger than a narrow map
- **WHEN** a token's new-grid footprint is wider than the new map
- **THEN** its horizontal center is the image midpoint, its size remains unchanged, and its center is inside the image

### Requirement: Map changes preserve hidden-token privacy
Hidden tokens SHALL be readjusted and restored by undo in the authoritative room state, but a player SHALL receive no hidden token identifier, previous position, new position, image, or other hidden token detail in map events, snapshots, reconnect payloads, or the Activity log. The GM SHALL see the complete adjusted state.

#### Scenario: Mixed visible and hidden tokens
- **WHEN** a GM replaces a map containing one visible token and one hidden token
- **THEN** a connected player sees the new map and adjusted visible token but receives no hidden-token data in any room payload

#### Scenario: Hidden token later revealed
- **WHEN** the GM reveals a hidden token after a map replacement
- **THEN** the player first receives that token at its adjusted position, with no prior position disclosed

#### Scenario: Undo with a hidden token
- **WHEN** the GM undoes a map replacement that moved a hidden token
- **THEN** the hidden token returns to its exact old position for the GM while the player's event and snapshot still omit it

### Requirement: GM can undo the latest map action exactly
The GM SHALL have an Activity log action to undo the most recent committed room action when it is a map placement or replacement. The action SHALL submit an authorized command that appends one compensating map event; it SHALL restore the prior map, any grid replaced with it, and every affected token center to its exact pre-action value. Undoing an initial map placement SHALL restore the room's no-map state. An intervening committed action, a stale target, a repeated undo, or a player request SHALL be rejected without changing state or sequence. The committed undo SHALL be visible in the GM's Activity log. A map action that has already been undone SHALL NOT be undone again by this command.

#### Scenario: Undo map and grid with tokens
- **WHEN** a GM immediately undoes a library map replacement that copied a different grid and readjusted two tokens
- **THEN** one new action restores the previous map, previous grid, and both exact original centers

#### Scenario: Undo initial placement
- **WHEN** a GM immediately undoes the room's first map placement
- **THEN** one new action restores no map and the prior grid without moving the tokens

#### Scenario: Intervening movement blocks stale undo
- **WHEN** a player moves a token after a map replacement and the GM requests undo of that replacement
- **THEN** the undo request is rejected and neither the player's movement nor the map is altered

#### Scenario: Player or repeated undo is refused
- **WHEN** a player sends the map undo command, or the GM resends an already completed undo request
- **THEN** the room rejects it without appending an event

### Requirement: Replay and reconnect reconstruct the same map state
The event log SHALL deterministically replay map replacement and compensation, including all adjusted token centers and copied grid values. Previously stored map events without token adjustments SHALL retain their original meaning. A reconnecting participant SHALL receive the current viewer-filtered map and token state, whether the replacement is still active or has been undone.

#### Scenario: Restart after map replacement
- **WHEN** the server reloads a room from its stored events after a map replacement
- **THEN** the reconstructed map, grid, and every visible or hidden token center equal the state before restart

#### Scenario: Reconnect after undo
- **WHEN** a GM undoes a replacement while a player is offline and that player reconnects
- **THEN** the player receives the restored map and visible token centers at the current sequence, with hidden tokens omitted

#### Scenario: Legacy map event
- **WHEN** a room replays a map event recorded before token readjustment existed
- **THEN** that event changes only the map and optional grid, leaving token centers as originally recorded
