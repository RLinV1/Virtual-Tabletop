# Spec Delta

## Purpose

Keeps tactical token footprints playable when a battle map is applied, with deterministic placement, atomic undo, and player-safe synchronization.

## ADDED Requirements

### Requirement: Map application adjusts every token footprint
Applying a map SHALL adjust all tokens, including hidden tokens, using square footprints of token size in cells multiplied by the effective grid cell size. Token sizes SHALL remain unchanged. Valid centers SHALL keep the entire footprint inside the image. If any footprint cannot individually fit, the whole command SHALL be rejected with an actionable GM error and no appended event.

#### Scenario: Oversized hidden token
- **WHEN** a hidden token's footprint exceeds either new map dimension
- **THEN** Apply is rejected, the GM error identifies the token and corrective options, and the room and log remain unchanged

#### Scenario: Fractional footprint at an edge
- **WHEN** an outside token with a fractional or multi-cell size can fit the map
- **THEN** its adjusted center keeps its complete square footprint inside both image edges without changing its size

### Requirement: Replacement policies preserve relative or explicit placement
The map command SHALL accept an optional policy of `scale`, `keep`, or `recenter` and SHALL reject invalid policies. For replacement maps, omission SHALL select `scale`, independently multiplying each token center by the new/old width and height ratios before constraining it. `keep` SHALL preserve candidate positions before constraining them. When no previous map exists, all policies SHALL preserve candidate positions before constraining them.

#### Scenario: Changed aspect ratio
- **WHEN** a replacement doubles width and halves height with no explicit policy
- **THEN** each token's candidate x doubles and y halves before bounds and grid intent are applied

#### Scenario: Keep policy
- **WHEN** the GM replaces a map using `keep`
- **THEN** already fitting free tokens stay at their recorded coordinates and outside footprints are brought inside

#### Scenario: First map
- **WHEN** the GM applies the first map with any supported policy
- **THEN** token positions are preserved as candidates without scaling or recentering, then constrained

### Requirement: Map adjustment preserves grid intent
Only tokens aligned on the previous grid SHALL be resnapped. Each such token SHALL use the nearest fitting aligned position on the effective grid. If an axis has no fitting aligned position, footprint bounds SHALL take priority on that axis. Deliberately off-grid tokens SHALL be adjusted without forced snapping. This map behavior SHALL supersede separate map-specific resnap events while standalone grid changes retain their existing resnap behavior.

#### Scenario: Aligned token near an edge
- **WHEN** the unconstrained nearest grid position would cross the new map edge but another aligned position fits
- **THEN** the token uses the nearest aligned position that fits

#### Scenario: No fitting aligned position
- **WHEN** a footprint fits an axis but grid phase leaves no aligned center in its valid interval
- **THEN** that axis is clamped within bounds even though it is off-grid

#### Scenario: Deliberate free placement
- **WHEN** an off-grid token is scaled or kept on a replacement
- **THEN** its candidate is only constrained to footprint bounds

### Requirement: Recenter forms a deterministic bounded group
Replacement `recenter` SHALL process tokens in stable ID order and search outward from fitting central positions with the existing bounded square-ring placement pattern. It SHALL avoid overlapping already placed square footprints where search finds space. Crowding or search exhaustion SHALL permit overlap at a valid central position without rejecting an individually fitting token.

#### Scenario: Mixed token sizes
- **WHEN** the same mixed-size token set is recentered with different record insertion orders
- **THEN** both results are identical and footprints avoid overlap where fitting candidates are found

#### Scenario: Crowded map
- **WHEN** all individual footprints fit but the bounded search cannot place them without overlap
- **THEN** remaining tokens use valid central positions and the map action succeeds

### Requirement: Map grid and token changes commit atomically
An accepted map command SHALL append exactly one `MapSet` containing both effective grid values and explicit changed-token `from` and `to` coordinates, including an empty change array when no token moves. A command without a grid SHALL use the current grid. Positions SHALL be calculated from authoritative state when Apply executes. Reduction SHALL apply the recorded values without recomputing placement. Fog and templates SHALL keep their map-image coordinates and existing visibility semantics. Adjusted unowned tokens entering fog SHALL permanently conceal their historical attack sides.

#### Scenario: Player moves during preparation
- **WHEN** a player move commits while the GM prepares a map and the GM then applies it
- **THEN** adjustment uses that latest token position and commits map, grid, and token positions together

#### Scenario: Historical attack side enters fog
- **WHEN** map adjustment puts an unowned token named by a public attack roll under existing fog
- **THEN** the side becomes permanently concealed even if the map action is later undone or the token is deleted

### Requirement: Complete map actions support guarded exact undo
Complete new map actions SHALL be reversible through bounded command history. Undo SHALL reject without appending if the current map, any applied grid value, or any adjusted token's existence or resulting position differs. Unrelated edits SHALL not block undo or be overwritten. Accepted undo SHALL append an inverse `MapSet` swapping recorded map, grid, and position values followed by `ActionUndone`. It SHALL restore coordinates exactly without snapping, clamping, or revalidating old geometry; undoing first-map placement SHALL restore a null map. Undo history SHALL survive log reload.

#### Scenario: First-map undo
- **WHEN** the GM undoes first-map placement while all guarded values match
- **THEN** the room returns to no map and the exact previous grid and token positions, including previously outside positions

#### Scenario: Position conflict or deleted token
- **WHEN** any adjusted token moved again or was deleted after map Apply
- **THEN** undo rejects with an actionable conflict and appends nothing

#### Scenario: Map or grid conflict
- **WHEN** the applied map or any complete grid value has changed
- **THEN** undo rejects without modifying the room or log

#### Scenario: Unrelated edits and reload
- **WHEN** a token is renamed or its stats change after Apply, and the room is reloaded
- **THEN** map undo remains available if guarded values match, restores recorded positions, and preserves those edits

### Requirement: Composite map delivery protects player data
Players SHALL receive fresh filtered snapshots for composite map events and inverses, with hidden tokens, viewer-dependent fog, attack sides, initiative, templates, and GM-only history filtered by existing rules. No nested token changes, prior positions, or server command IDs SHALL reach players. Sequence progression SHALL remain correct across live application, resync, reconnect, and persisted-log reload. Players SHALL not be authorized to apply maps or undo them.

#### Scenario: Two viewers and hidden movement
- **WHEN** a composite map action adjusts hidden tokens and tokens under fog owned by only one player
- **THEN** each player gets their permitted current view, neither receives nested changes or prior coordinates, and the GM receives the complete event

#### Scenario: Forged player map command
- **WHEN** a player submits a map change or map undo
- **THEN** the command is refused and no event is appended

### Requirement: Historical map events retain their meaning
Events lacking explicit token changes SHALL replay their original map/grid effects without new geometry. Historical `MapSet` plus `TokenMoved` batches SHALL replay unchanged. Incomplete legacy map actions SHALL remain non-undoable. No historical event SHALL be rewritten or require database migration.

#### Scenario: Legacy map and moves
- **WHEN** an older map event and its following token moves are parsed or replayed
- **THEN** only their recorded effects are applied and the map action remains non-undoable
