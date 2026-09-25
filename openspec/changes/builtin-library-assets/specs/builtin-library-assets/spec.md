## ADDED Requirements

### Requirement: Built-in assets in every library
The asset library SHALL include a fixed catalog of maps and token art that ships with the app. It SHALL be visible to every GM, including one who has uploaded nothing. It SHALL be listed separately from the GM's own assets, under "Included with the app", and filtered by the same tab and search.

#### Scenario: New GM sees the defaults
- **WHEN** a GM with an empty library opens the asset library
- **THEN** the Maps tab lists The Broken Span, Hollowfrost Keep and Temple of the Green Sun under "Included with the app", and the Tokens tab lists the five included portraits

#### Scenario: Search covers built-ins
- **WHEN** the GM searches "frost" on the Maps tab
- **THEN** Hollowfrost Keep is listed and the other built-in maps are not

### Requirement: Built-ins are read-only
Built-in assets SHALL NOT offer rename or delete. No action by one GM SHALL change the built-ins another GM sees.

#### Scenario: No management actions
- **WHEN** the GM views a built-in card
- **THEN** it shows the image, name and size, and no Rename or Delete control

### Requirement: Place a built-in in a room
The room's "From library" pickers for maps and token images SHALL list the GM's own assets first, then the built-ins. Placing a built-in map SHALL set the room's map and apply its saved grid. Choosing a built-in token image SHALL use it for the new token. The room SHALL record the image URL without a library asset id.

#### Scenario: Built-in map
- **WHEN** the GM picks Hollowfrost Keep from "From library"
- **THEN** the room shows that map at 1672×941 with a 70 px grid, and no "Save grid to library" control is offered for it

#### Scenario: Built-in token portrait
- **WHEN** the GM adds a token using a built-in portrait
- **THEN** the token is drawn with that portrait, and the library usage index records nothing for it
