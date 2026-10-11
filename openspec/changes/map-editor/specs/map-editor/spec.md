# Spec Delta

## Purpose

Gives the GM one full-screen place to set up a battle map (its image, its grid and its walls), separate from the board the table plays on.

## ADDED Requirements

### Requirement: Map setup opens as its own screen
Manage › Battle map SHALL offer an Edit map control to the GM, and players SHALL NOT see it. It SHALL open a full-screen editor with its own header, step navigation (Map, Grid, Walls), a map canvas and a side panel. Opening and closing the editor SHALL NOT disconnect the GM or trigger a resync. Closing it SHALL return focus to Edit map.

#### Scenario: Open the editor
- **WHEN** the GM presses Edit map
- **THEN** a full-screen editor opens on the Map step, and the room keeps updating behind it

#### Scenario: Close the editor
- **WHEN** the GM closes the editor with no unapplied draft
- **THEN** the board is shown again and focus is on Edit map

### Requirement: The editor's steps follow the setup order
The Map step SHALL offer uploading an image and choosing one from the library. A chosen image SHALL become a private draft and the editor SHALL move to the Grid step to align it, with Apply map publishing both. With no draft, the Grid step SHALL edit the room's current grid. The Walls step SHALL need an applied map, and SHALL say so when there is none.

#### Scenario: New map end to end
- **WHEN** the GM uploads an image in the Map step, aligns the grid, and presses Apply map
- **THEN** the table shows the new map and grid, and the editor offers the Walls step

#### Scenario: Walls before a map
- **WHEN** the room has no map and the GM opens the Walls step
- **THEN** the step asks the GM to apply a map first

### Requirement: Walls are edited in the editor's Walls step
The Walls step SHALL show the map with its walls, and offer Draw, Erase and Detect like this, plus automatic detection with its preview, Apply walls and Clear walls. The board's tool rail SHALL NOT offer a Walls tool. The GM's board SHALL still draw applied walls.

#### Scenario: Erase a false wall
- **WHEN** the GM chooses Erase in the Walls step and clicks a wall on the canvas
- **THEN** that wall is removed from the room

### Requirement: The app runs without wall detection
The server SHALL report whether it can detect walls: a queue is configured and at least one vision worker is connected. When it cannot, Detect walls and Detect like this SHALL be shown disabled with the reason. Drawing and erasing walls, and everything else, SHALL work.

#### Scenario: No Redis or no worker
- **WHEN** the app runs without Redis, or with no wall worker connected
- **THEN** the Walls step shows detection as unavailable, its detect controls are disabled, and Draw and Erase still work

### Requirement: The editor works on phones and tablets
The editor SHALL fit the viewport at phone, tablet and desktop sizes with its close button visible. On narrow or portrait screens the canvas SHALL sit above the side panel, and the panel SHALL scroll on its own instead of pushing the canvas off-screen. Every editor control SHALL be at least 44 by 44 CSS pixels. On the wall canvas, a two-finger pinch SHALL zoom about the fingers' midpoint and a two-finger drag SHALL pan in every mode. A single-finger tap SHALL do the mode's action, and a single-finger drag SHALL pan in Pan mode.

#### Scenario: Pinch while drawing
- **WHEN** the GM is in Draw mode on a phone and pinches the wall canvas
- **THEN** the canvas zooms about the pinch midpoint and no wall is added

#### Scenario: Phone portrait
- **WHEN** the GM opens the Walls step at 390 by 844
- **THEN** the canvas shows above the tools, the tools panel scrolls, and the close button stays reachable
