# Spec Delta

## Purpose

Extends applied and draft map segments with generic editable UVTT portals and consistent movement blocking while keeping geometry private to GMs.

## ADDED Requirements

### Requirement: Generic portal metadata and wall editing
Walls SHALL retain optional portal position, radians rotation, closed and freestanding metadata and ordinary/object source. Portal bounds SHALL be the wall endpoints. GM endpoint and metadata edits SHALL record complete old and new values and be undoable. Old walls SHALL remain solid. Open portals SHALL NOT block movement; closed portals and portals with no supplied closed flag SHALL block using the existing wall rules without adding a flag to their stored metadata. Geometry SHALL remain GM-only through snapshots, events, restore and reset.

#### Scenario: Edit an imported portal
- **WHEN** the GM changes a portal endpoint and opens it
- **THEN** the exact metadata persists, movement crosses its bounds, players receive no geometry, and undo restores the previous closed portal

#### Scenario: Move portal bounds across solid geometry
- **WHEN** the GM changes portal bounds to overlap a collinear solid segment
- **THEN** the draft preview and validated preparation remove duplicate blocking geometry, applied editing records affected solid segment removals/additions with the portal update, and guarded undo restores the exact prior segments

#### Scenario: Draw through an open portal
- **WHEN** the GM draws a solid wall across an existing portal's bounds
- **THEN** only the solid portions outside the portal bounds are added, preserving the opening and enforcing the wall limit after normalization

### Requirement: Map replacement explicitly replaces geometry
A new imported map SHALL replace geometry in the same atomic scene action as map, grid and recorded current token adjustment. Ordinary different-image replacement SHALL clear walls in that action. Historical events without geometry SHALL preserve their original replay semantics.

#### Scenario: Legacy replay
- **WHEN** an old MapSet without a geometry change is replayed after walls
- **THEN** no implicit wall removal occurs
