## MODIFIED Requirements

### Requirement: Built-in assets in every library
Every account's library SHALL contain the shipped maps (The Broken Span, Hollowfrost Keep, Temple of the Green Sun) as its own rows, each with its shipped name, image size and measured grid. They SHALL be seeded once per account, including accounts that existed before this change. The shipped token art SHALL remain a fixed read-only catalog listed separately under "Included with the app" and filtered by the same tab and search, and SHALL NOT be usable as a creature's image.

#### Scenario: New GM sees the defaults
- **WHEN** a GM with an empty library opens the asset library
- **THEN** the Maps tab lists the three shipped maps as ordinary cards, and the Token Art tab lists the five included portraits under "Included with the app"

#### Scenario: Existing account is seeded
- **WHEN** an account created before this change lists its library for the first time
- **THEN** the three shipped maps appear once alongside its own uploads

#### Scenario: Deleted default stays deleted
- **WHEN** the GM deletes a seeded map and lists the library again
- **THEN** that map is not added back

### Requirement: Place a built-in in a room
The room's "From library" pickers SHALL list the GM's own assets, which include the seeded maps; for token images they SHALL then list the built-in portraits. Placing a seeded map SHALL set the room's map at that map's own size and apply its saved grid, and the room SHALL record the row's asset id. Choosing a built-in token image SHALL use it for the new token and record its URL without a library asset id.

#### Scenario: Seeded map
- **WHEN** the GM picks Hollowfrost Keep from "From library"
- **THEN** the room shows that map at 3269×1882 with a 70 px grid offset 47 px right and 46 px down, and records the library asset id

#### Scenario: Built-in token portrait
- **WHEN** the GM adds a token using a built-in portrait
- **THEN** the token is drawn with that portrait, and the library usage index records nothing for it

## REMOVED Requirements

### Requirement: Built-ins are read-only
**Reason**: Shipped maps are now owned rows the GM may rename or delete. Token art stays read-only and is covered by "Built-in assets in every library".
