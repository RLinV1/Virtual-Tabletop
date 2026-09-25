# Spec Delta

## MODIFIED Requirements

### Requirement: Place a built-in in a room
The room's "From library" pickers for maps and token images SHALL list the GM's own assets first, then the built-ins. Placing a built-in map SHALL set the room's map at that map's own size and apply that map's own saved grid, including its cell size and offset. Choosing a built-in token image SHALL use it for the new token. The room SHALL record the image URL without a library asset id.

#### Scenario: Built-in map
- **WHEN** the GM picks Hollowfrost Keep from "From library"
- **THEN** the room shows that map at 3269×1882 with a 70 px grid offset 47 px right and 46 px down, and no "Save grid to library" control is offered for it

#### Scenario: Built-in token portrait
- **WHEN** the GM adds a token using a built-in portrait
- **THEN** the token is drawn with that portrait, and the library usage index records nothing for it

## ADDED Requirements

### Requirement: Built-in maps are top-down battle maps with their own grid
Every built-in map SHALL be drawn from directly overhead, with no visible wall or building sides, and SHALL contain no creatures, people or animals, including statues shaped like them. Each built-in map SHALL carry its own grid, measured from its art, so that its grid lines roughly follow the drawn floor tiles and walls across the whole map. A built-in map SHALL be at least 2600 px wide, so it is usable as a table map at about 70 px per square.

#### Scenario: Grid follows the art
- **WHEN** a built-in map's saved grid is drawn over it
- **THEN** grid lines fall along the drawn paving and walls, and no line is more than about half a square from the tile edge it should follow anywhere on the map

#### Scenario: Each map has its own grid
- **WHEN** the built-in catalogue is read
- **THEN** The Broken Span has a 69.4 px grid offset (10, 31), Hollowfrost Keep a 70 px grid offset (47, 46), and Temple of the Green Sun a 70 px grid offset (21, 36), each with its own image size
