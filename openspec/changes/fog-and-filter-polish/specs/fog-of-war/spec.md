## ADDED Requirements

### Requirement: Fog takes its colours from the map
The board SHALL draw fog in shades derived from the current map image, with banks only slightly darker than that colour and mist only slightly lighter. When the map colour cannot be read, the board SHALL use a default blue-grey. The colour SHALL be the same over every part of the map, so fog reveals nothing about what lies under it.

#### Scenario: Fog on a coloured map
- **WHEN** a map with stone, moss and rock is shown with a fog region
- **THEN** the fog reads as haze in that map's tones, not as flat grey

#### Scenario: Map colour unreadable
- **WHEN** the browser will not let the map image be read
- **THEN** the fog uses the default blue-grey

### Requirement: The GM's fog outline is subtle
The GM's view SHALL outline each fog region with a thin line in the fog's own tone. It SHALL NOT draw a bright frame around the region.

#### Scenario: GM sees fog
- **WHEN** the GM's view shows a fog region
- **THEN** its edge is a thin line in the fog's tone and the fill meets it without a visible frame

### Requirement: Fog looks like mist
Fog SHALL look like drifting mist: pale and cloudy, with borders that feather into the map and billow with the cloud, in both the GM's view and the players' view. It SHALL NOT look like a flat textured rectangle or end in a hard straight edge. The feather SHALL be narrow enough that fog still hides what lies under it right up to the region's border.

#### Scenario: Region border
- **WHEN** a fog region is drawn
- **THEN** its border fades over a fraction of a grid cell, with no bright or dark rim and no visible frame

#### Scenario: Region interior
- **WHEN** a fog region covers part of the map
- **THEN** the map under it is not visible, and the fog reads as cloud rather than a flat grey fill
