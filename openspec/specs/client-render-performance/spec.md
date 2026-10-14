# client-render-performance Specification

## Purpose
Keeps the board and pages from doing work when nothing changes. The board draws only when its picture changes, and decorative effects never cost work on every frame, so rooms and the home page stay responsive on ordinary hardware.

## Requirements

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

### Requirement: Bounded render resolution
The board SHALL render at no more than 2 device pixels per CSS pixel, whatever the screen's device pixel ratio. Board coordinates SHALL be unaffected.

#### Scenario: High-density screen
- **WHEN** the device pixel ratio is 3
- **THEN** the canvas backing buffer is at most twice the CSS size in each dimension

### Requirement: No per-frame decorative effects
Decorative page effects SHALL NOT do work on every frame while the user scrolls or the board redraws. Board overlay controls SHALL NOT use backdrop filters. Home page sections SHALL NOT use scroll-linked animations. Entrance animations SHALL run once.

#### Scenario: Home page scroll is smooth
- **WHEN** the home page is scrolled from top to bottom at 4× CPU throttling
- **THEN** no animation or style work runs per scroll frame, and the only frames over 25 ms are one-time image decodes the first time a section appears

#### Scenario: Reduced motion unchanged
- **WHEN** the viewer prefers reduced motion
- **THEN** no entrance or scroll animation runs, as before
