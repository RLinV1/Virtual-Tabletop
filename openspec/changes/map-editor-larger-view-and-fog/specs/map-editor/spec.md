# Spec Delta

## Purpose

Adds to the full-screen map editor: a canvas that gets most of the window, and fog creation as a fourth setup step.

## ADDED Requirements

### Requirement: The editor's canvas fills the window
The editor SHALL give the map canvas the whole window apart from one header row and the side panel. The editor SHALL NOT show a second title bar above its steps. The map SHALL be fitted to the canvas, so no part of the map is cut off at the start, and the GM SHALL be able to zoom in from there. On a narrow screen the side panel SHALL sit below the canvas and the canvas SHALL keep at least half the window height.

#### Scenario: Map fills the view
- **WHEN** the GM opens the Grid, Walls or Fog step on a 1920 × 1080 window
- **THEN** the canvas is at least 90% of the window height and at least the window width minus the side panel and its margins

#### Scenario: Whole map visible
- **WHEN** a step opens
- **THEN** the whole map is visible, fitted inside the canvas, until the GM zooms

### Requirement: Fog is created in the editor's Fog step
The editor SHALL offer a Fog step, after Walls, to the GM only. It SHALL show the map with its current fog, and offer Rectangle, Polygon and Reveal tools, Pan, and the wheel zoom. Fog SHALL be added and removed with the existing `fog.add` and `fog.remove` commands, in map coordinates. The step SHALL also offer Fog whole map, fogging a block of cells, and the list of fogged regions with Reveal, as in Manage › Fog of war. The step SHALL need an applied map, and SHALL say so when there is none.

#### Scenario: Fog a rectangle
- **WHEN** the GM chooses Rectangle and drags across the canvas
- **THEN** one `fog.add` with a rectangle region in map coordinates is sent, and the region shows on the canvas

#### Scenario: Close a polygon
- **WHEN** the GM chooses Polygon, clicks three or more corners, and presses Enter or clicks the first corner
- **THEN** one `fog.add` with a polygon of those corners is sent

#### Scenario: Half-drawn region dropped
- **WHEN** the GM presses Escape or right-clicks during a polygon, or switches tool
- **THEN** nothing is sent and the half-drawn region is discarded

#### Scenario: Reveal a region
- **WHEN** the GM chooses Reveal and clicks a fogged region
- **THEN** `fog.remove` is sent for the topmost region under the click, and a click on unfogged map sends nothing

#### Scenario: Fog before a map
- **WHEN** the room has no map and the GM opens the Fog step
- **THEN** the step asks the GM to apply a map first

#### Scenario: Players see only what the table sees
- **WHEN** the GM fogs a region in the editor
- **THEN** players receive it through the same fog events and filters as fog drawn on the board, and nothing else about the editor reaches them
