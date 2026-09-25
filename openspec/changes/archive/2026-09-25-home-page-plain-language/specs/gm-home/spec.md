# Spec Delta

## ADDED Requirements

### Requirement: Both paths in the first screen
The home page SHALL present a path for joining an existing game and a path for creating a room, both visible without scrolling, with the join path placed before the create path. Each path SHALL be labelled with the reader it is for. The page SHALL NOT offer a second join form elsewhere.

#### Scenario: Laptop viewport
- **WHEN** a visitor opens `/` in a 1366×768 viewport, with or without owned rooms
- **THEN** the invite link field and its Join button are fully visible without scrolling, above the room creation form

#### Scenario: Phone viewport
- **WHEN** a visitor opens `/` in a 390×844 viewport
- **THEN** the invite link field and its Join button are fully visible without scrolling, and both forms appear before the hero map

#### Scenario: Owned rooms do not push join down
- **WHEN** a browser that owns rooms opens `/`
- **THEN** the rooms section appears after the hero, and the join path stays where it is for a first-time visitor

#### Scenario: Each path names its reader
- **WHEN** a visitor reads the hero
- **THEN** the join path is labelled for someone joining a game their GM invited them to, and the create path is labelled for someone running a game

#### Scenario: Join still accepts a link or a code
- **WHEN** a visitor submits a full invite link or a bare invite code in the hero's join field
- **THEN** they are taken to that invite's join page, and input that is neither shows an error beside the field

### Requirement: "You" is unambiguous
Every second-person reference on the home page SHALL make clear whether it addresses the GM or a player. Below the hero, the feature sections SHALL sit under a heading that marks them as being about running a game. Within them, "you" SHALL refer to the GM, players SHALL be referred to in the third person, and a line that applies to everyone at the table SHALL say so.

#### Scenario: Feature sections address the GM
- **WHEN** a visitor reads the grid, library, visibility and dice sections
- **THEN** they sit under a heading identifying them as about running a game, and no sentence in them uses "you" to mean a player

#### Scenario: Shared features say who they are for
- **WHEN** a section describes something every participant sees, such as dice results
- **THEN** its text names everyone at the table rather than addressing a single "you"

### Requirement: Capabilities in user terms
The home page SHALL describe what the app does in terms a tabletop player uses, not in terms of how it is built. Tabletop vocabulary (GM, token, turn order, dice notation, grid squares and feet) MAY appear. Visible text SHALL NOT use implementation vocabulary: server, client, filter, snapshot, update stream, parser, overlay, or code identifiers such as `cellSize`. This applies to readouts, labels and captions as well as body text, but not to alt text or accessible names that describe a map image.

#### Scenario: No implementation vocabulary in visible text
- **WHEN** the rendered home page text is checked in both GM and player views of the visibility section, and after a valid and an invalid dice roll
- **THEN** none of the listed implementation terms or code identifiers appears

#### Scenario: Hidden information is promised, not explained
- **WHEN** a visitor reads the visibility section
- **THEN** it states that players cannot see a hidden token, cannot find it in the turn order, and cannot recover it from their own browser, without describing the mechanism

#### Scenario: Grid readout uses tabletop units
- **WHEN** a visitor drags the grid control
- **THEN** the readout shows the square size and the distance one square represents, labelled in plain words
