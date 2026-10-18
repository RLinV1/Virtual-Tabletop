# board-view-filters Specification

## Purpose
TBD - created by archiving change fog-and-filter-polish. Update Purpose after archive.

## Requirements

### Requirement: The Show menu is compact
The GM's "Show" menu SHALL list each option as a checkbox followed by its label on one line, left aligned. The menu SHALL be only as wide as its longest label plus padding.

#### Scenario: Menu with fog and walls
- **WHEN** the GM opens Show on a room with fog and walls
- **THEN** each of "Fog" and "Walls" appears on its own line with the checkbox to the left of the text, and there is no large empty space around them
