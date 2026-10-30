## MODIFIED Requirements

### Requirement: Players see the portals in front of them
A player's state SHALL contain every portal wall whose midpoint is outside fog and, while line of sight is on, inside that player's sight, with its kind and state, and SHALL NOT contain plain walls, portals under fog, or portals outside the player's sight. When a change reveals or withdraws a portal for a player (a portal added, removed or designated, fog added or removed, or, while line of sight is on, any change to that player's sight), the player SHALL receive a fresh filtered state. A state change of a portal the player can see SHALL reach them as a live event.

#### Scenario: Doors but no walls
- **WHEN** a room has twenty walls, one of them a closed door outside fog, and a player joins
- **THEN** the player's state holds exactly that door

#### Scenario: Fog lifts off a door
- **WHEN** the GM removes the fog over a door
- **THEN** the player's board shows the door

#### Scenario: Door opened in view
- **WHEN** the GM opens a door the player can see
- **THEN** the player's board shows it open without a full reload

#### Scenario: Door out of sight
- **WHEN** line of sight is on and a door lies in a room none of the player's tokens can see
- **THEN** the player's state does not hold that door
