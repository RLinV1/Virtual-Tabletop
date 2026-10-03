## Purpose

Lets the GM conceal rectangular or polygonal regions of the map to control exploration (FR-GM-17), with the guarantee that what is under fog never reaches players (FR-GM-23).

## ADDED Requirements

### Requirement: The GM adds and removes fog regions
The GM SHALL be able to add a rectangular fog region by dragging, and a polygonal fog region by clicking its corners. The GM SHALL be able to remove a region by clicking it with the Reveal mode. Players SHALL NOT be able to add or remove fog, and SHALL NOT see the Fog tool. A region with no area SHALL be refused. A room SHALL hold at most 100 regions.

#### Scenario: GM fogs a room of the dungeon
- **WHEN** the GM drags a rectangle with the Fog tool
- **THEN** a fog region covering that rectangle appears for everyone, and the activity log reads "<GM> added a fog rectangle"

#### Scenario: GM draws a polygon
- **WHEN** the GM clicks five corners and then clicks the first corner again
- **THEN** a five-sided fog region is added

#### Scenario: A player cannot add fog
- **WHEN** a player sends `fog.add`
- **THEN** the server refuses it as forbidden and nothing changes

#### Scenario: Degenerate region
- **WHEN** the GM sends a polygon whose points lie on one line
- **THEN** the server refuses it as invalid

### Requirement: Players see fog masked, the GM sees it semi-transparent
Players SHALL see each fog region as an opaque mask over the map and grid. The GM SHALL see each region semi-transparent with an outline, so the map and tokens under it stay visible.

#### Scenario: Two views of one region
- **WHEN** a fog region covers part of the map
- **THEN** the player's board shows that part fully dark, and the GM's board shows it tinted with its edge outlined

### Requirement: Content under fog is not sent to players
A token whose centre lies inside a fog region SHALL NOT be sent to any player who does not own it, in snapshots, live events, REST responses or ephemeral relays. A shared area template whose origin lies inside a fog region SHALL NOT be sent to any player other than the one who placed it. Attack rolls SHALL blank a side whose token is under fog, and the turn order SHALL leave such tokens out, as for hidden tokens. When fog is added or removed, or a token moves into or out of fog, each affected player SHALL receive a filtered snapshot.

#### Scenario: Monster under fog
- **WHEN** a goblin stands inside a fog region
- **THEN** no player's state, event stream or drag preview contains the goblin

#### Scenario: Revealing a region
- **WHEN** the GM removes the region over the goblin
- **THEN** players receive a snapshot that contains the goblin

#### Scenario: A token walks into fog
- **WHEN** the GM moves a visible token into a fog region
- **THEN** players receive a snapshot without it, and never receive its new position

#### Scenario: Owners keep their tokens
- **WHEN** a player's own token is inside a fog region
- **THEN** that player still sees and can move it, and other players do not see it

### Requirement: Fog changes are undoable
Adding and removing a fog region SHALL be undoable by the GM from the activity log, so an accidental reveal can be reversed. Undoing a removal SHALL restore the same region.

#### Scenario: Undo an accidental reveal
- **WHEN** the GM removes a region by mistake and then undoes it
- **THEN** the region is back, and what it covered is withheld from players again
