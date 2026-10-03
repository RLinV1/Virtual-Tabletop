# target-pings Specification

## Purpose
Lets any participant point at a spot on the battle map so everyone else at the table sees where they mean, for a moment, without leaving anything behind in the room.

## Requirements

### Requirement: A ping is shown on every other client
When a participant pings a point on the map, every other active participant in the room SHALL see a pulse at that board point. The sender SHALL see their own pulse locally. The pulse SHALL be drawn in board coordinates, so it stays on the same map spot at any pan or zoom.

#### Scenario: Player pings
- **WHEN** a player double-clicks a point on the map in Select mode
- **THEN** the GM and every other player see a pulse at that board point, and the player sees it too

#### Scenario: Different zoom levels
- **WHEN** the GM is zoomed in and a player pings
- **THEN** the GM's pulse is centred on the same map point the player clicked

### Requirement: A ping expires and is never persisted
A ping's pulse SHALL disappear by itself within 1.5 seconds. A ping MUST NOT be written to the event log, MUST NOT appear in the activity log, and MUST NOT be shown to a client that connects or reloads after it was sent.

#### Scenario: Pulse expires
- **WHEN** a ping is shown
- **THEN** nothing of it remains on the board 1.5 seconds later

#### Scenario: Late joiner
- **WHEN** a player reloads the page right after another player pinged
- **THEN** the reloaded board shows no ping, and the activity log has no entry for it

### Requirement: Off-map pings are refused
The server MUST NOT relay a ping whose point lies outside the map image, or a ping sent while the scene has no map.

#### Scenario: Ping outside the map
- **WHEN** a client sends a ping at a point beyond the map's width or height
- **THEN** no other client receives it

#### Scenario: No map yet
- **WHEN** a client sends a ping before the GM has set a map
- **THEN** no other client receives it

### Requirement: Reduced motion
When the viewer prefers reduced motion, a ping SHALL be shown as a static ring that fades out, without growing.

#### Scenario: Reduced motion enabled
- **WHEN** a viewer with reduced motion enabled receives a ping
- **THEN** they see a ring of constant size at the ping point that fades out within 1.5 seconds
