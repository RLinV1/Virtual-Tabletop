## MODIFIED Requirements

### Requirement: The GM adds and removes fog regions
The GM SHALL be able to add and remove fog from the board during play with a Fog tool on the board's tool rail, without opening a dialog or the map editor. The Fog tool SHALL offer three modes. In Rectangle mode the GM adds a rectangular region by dragging. In Polygon mode the GM adds a polygonal region by clicking its corners and closing it on the first corner or with Enter; Backspace SHALL drop the last corner, and Escape SHALL abandon an unfinished polygon. In Reveal mode the GM removes the topmost region under a click. Each completed gesture SHALL change the room immediately for everyone, with no separate save step. Players SHALL NOT be able to add or remove fog, and SHALL NOT see the Fog tool, not even disabled. While the GM is viewing the room as a player, the Fog tool SHALL send nothing. A region with no area SHALL be refused. A room SHALL hold at most 100 regions.

#### Scenario: GM fogs a room of the dungeon
- **WHEN** the GM picks Fog › Rectangle on the tool rail and drags a rectangle on the board
- **THEN** a fog region covering that rectangle appears for everyone with no dialog or save, and the activity log reads "<GM> added a fog rectangle"

#### Scenario: GM draws a polygon
- **WHEN** the GM, in Polygon mode, clicks five corners and then clicks the first corner again
- **THEN** a five-sided fog region is added

#### Scenario: Polygon closed from the keyboard
- **WHEN** the GM, in Polygon mode, clicks four corners, presses Backspace, and presses Enter
- **THEN** a three-sided fog region is added

#### Scenario: Abandon a polygon
- **WHEN** the GM, in Polygon mode, clicks two corners and presses Escape
- **THEN** nothing is sent and the corners are gone

#### Scenario: GM reveals a region during play
- **WHEN** the GM picks Fog › Reveal and clicks inside a fogged region
- **THEN** that region is removed for everyone and what it covered is sent to players

#### Scenario: Players have no Fog tool
- **WHEN** a player looks at the board's tool rail
- **THEN** there is no Fog button

#### Scenario: A player cannot add fog
- **WHEN** a player sends `fog.add`
- **THEN** the server refuses it as forbidden and nothing changes

#### Scenario: Degenerate region
- **WHEN** the GM sends a polygon whose points lie on one line
- **THEN** the server refuses it as invalid

### Requirement: Players see fog masked, the GM sees it semi-transparent
Players SHALL see each fog region as an opaque mask over the map and grid. In the GM's normal view, each region SHALL be drawn semi-transparent with an outline, so the map and every token under it stay visible, including while the GM uses the Fog tool. The GM SHALL see fog opaque, as players do, only in a player view: viewing the room as a player, or the map editor's Player view.

#### Scenario: Two views of one region
- **WHEN** a fog region covers part of the map
- **THEN** the player's board shows that part fully masked, and the GM's board shows it tinted with its edge outlined and the map and tokens under it visible

#### Scenario: GM checks the player's view
- **WHEN** the GM views the room as a player
- **THEN** fog is drawn fully opaque, exactly as that player sees it
