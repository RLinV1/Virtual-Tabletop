## MODIFIED Requirements

### Requirement: Board renders on demand
The board canvas SHALL render only when its picture changes: a state update, a pan or zoom, a drag, a ping, drag-preview or attack animation, a finished image load, or a resize. While at least one token with an animated condition effect is on the board, the board MAY render continuously at no more than 30 frames per second; it SHALL stop once no such token remains, while the page is hidden, and whenever the viewer prefers reduced motion. Otherwise an idle board SHALL do no per-frame rendering work. Animations SHALL keep rendering only while they are running.

#### Scenario: Idle room does no frame work
- **WHEN** a room with no animated condition effects is open and nothing changes for 3 seconds
- **THEN** the page's main thread is busy for no more than 1% of that time

#### Scenario: Remote change still appears
- **WHEN** another participant moves a token while this viewer is idle
- **THEN** the token is drawn at its new position without any local interaction

#### Scenario: Ping animates then stops
- **WHEN** a ping is shown
- **THEN** its ring animates for its full duration and rendering stops once it ends

#### Scenario: Condition loop is capped and stops
- **WHEN** a token is poisoned and later the condition is cleared
- **THEN** the board renders at most 30 frames per second while it is poisoned, and per-frame rendering stops once it is cleared
