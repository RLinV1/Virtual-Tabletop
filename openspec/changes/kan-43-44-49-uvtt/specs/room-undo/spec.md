# Spec Delta

## Purpose

Protects concurrent room edits while undoing atomic imported scenes and full-value wall changes through appended compensating events.

## ADDED Requirements

### Requirement: Guarded exact scene undo
Undo of an import SHALL verify the current map, grid, complete geometry, fog and affected token positions, then restore all exact previous values, including typed portals and UVTT metadata through one inverse scene event followed by ActionUndone. First placement SHALL restore no map. Later edits SHALL cause refusal instead of overwriting. Players SHALL receive filtered snapshots without old values, nested changes or undo history. Wall add/remove/update guards SHALL compare full values where values still exist.

#### Scenario: Another GM changes a portal
- **WHEN** another GM edits a portal after an import
- **THEN** undo of the import is refused and the newer portal edit remains

#### Scenario: First map undo and reload
- **WHEN** the GM undoes first placement and the log is reloaded
- **THEN** no map and the exact prior grid/geometry are restored on every client
