## ADDED Requirements

### Requirement: GM detonates a map-wide nuke
The GM SHALL be able to detonate a nuke from the board, choosing a damage amount (a whole number from 1 to 999) and an epicenter on the map (default: the centre of the map). The server SHALL accept the command from the GM only. Accepting it SHALL reduce the HP of every token in the room that has HP by the amount, never below the HP floor, and SHALL leave tokens without HP unchanged. Hidden tokens SHALL take the damage too. Each HP change SHALL be a `TokenStatsSet` carrying the stats it replaced, followed by one `MapNuked` event carrying the amount and epicenter. The command SHALL be refused while the room's presets turn attacks off.

#### Scenario: Everyone takes damage
- **WHEN** the GM detonates a nuke of 12 damage in a room with Aria (HP 30), Goblin (HP 5), a hidden Ogre (HP 40) and a signpost token with no HP
- **THEN** Aria is at 18, Goblin is at the HP floor, Ogre is at 28, and the signpost is unchanged

#### Scenario: A player cannot nuke
- **WHEN** a player sends `nuke.detonate`, or a forged payload with a negative or non-integer amount
- **THEN** the server rejects it and no event is appended

#### Scenario: Nothing to damage
- **WHEN** the GM detonates a nuke in a room where no token has HP
- **THEN** only `MapNuked` is appended and the blast still plays

### Requirement: The blast plays for every viewer
When a `MapNuked` event arrives live, every connected viewer's board SHALL play a full-map blast from the epicenter: an expanding shockwave, a bright flash with glow, and a screen shake, followed by a floating damage number on every token that viewer can see and that took damage. Events the viewer already had when the room loaded, reloaded or resynchronised SHALL NOT replay. Only one blast SHALL play at a time on a board; a second one that arrives mid-blast SHALL still apply its damage and SHALL show its numbers but not restart the shockwave.

#### Scenario: Everyone sees it
- **WHEN** the GM detonates a nuke while two players are connected
- **THEN** all three boards play the blast and each shows damage numbers on the tokens that board can see

#### Scenario: Reload does not replay
- **WHEN** a viewer reloads after a nuke
- **THEN** no blast plays, and the tokens show their reduced HP

### Requirement: The nuke never reveals hidden tokens
`MapNuked` SHALL name no token. A player SHALL receive the `TokenStatsSet` for a hidden token under the same rules as any other stats change, which is not at all. A damage number SHALL NOT be drawn for a token the viewer cannot see, and nothing in the blast SHALL depend on a hidden token's position.

#### Scenario: Hidden token takes damage
- **WHEN** the GM detonates a nuke and a hidden Ogre takes damage
- **THEN** players see the blast and numbers on visible tokens only, and nothing appears where Ogre stands

### Requirement: Undoing a nuke
The GM SHALL be able to undo a nuke as one action. Undo SHALL append compensating `TokenStatsSet` events that restore every token's earlier stats, followed by `MapNukeUndone`. Undo SHALL be refused when any damaged token's stats have changed since, as with other stats undo. Undo SHALL NOT replay the blast.

#### Scenario: Undo restores HP
- **WHEN** the GM nukes for 12 and then undoes it with no other change in between
- **THEN** every damaged token has its earlier HP and no blast plays

#### Scenario: Stale undo is refused
- **WHEN** the GM nukes, then heals Aria by hand, then tries to undo the nuke
- **THEN** the undo is refused with a message that a token has changed since

### Requirement: Blast respects reduced motion
When the viewer prefers reduced motion, the blast SHALL NOT shake the board, expand a shockwave or flash. It SHALL show a brief static full-board tint and the damage numbers.

#### Scenario: Reduced motion
- **WHEN** a viewer with reduced motion enabled sees a nuke
- **THEN** the board shows a short static tint with damage numbers and no moving shockwave or shake

### Requirement: The blast never interferes with play
The blast SHALL NOT block or delay input, SHALL NOT change any token's recorded position, and its filters SHALL be removed from the board when it ends. Looping or lingering glow SHALL NOT remain.

#### Scenario: Board is normal afterwards
- **WHEN** a blast ends
- **THEN** the board has no shockwave, bloom or tint, and panning, zooming and dragging behave as before
