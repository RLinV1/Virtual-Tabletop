## MODIFIED Requirements

### Requirement: GM default view shows through fog
In the GM's normal view, fog regions SHALL be drawn at 50% opacity with their outline, so the GM can see the whole map and every token beneath them. A token under fog SHALL stay visible to the GM and look covered by the tint, so the GM can tell which tokens players cannot see. Players' fog SHALL remain fully opaque. Fog SHALL be drawn opaque on the GM's screen only in a player view: the player preview and the map editor's Player view, which SHALL draw fog as a player sees it.

#### Scenario: GM sees under fog
- **WHEN** a region is fogged and the GM is in the normal view
- **THEN** the map and tokens in the region remain visible under a half-opaque fog tint and outline

#### Scenario: Fogged token is marked for the GM
- **WHEN** a goblin stands inside a fog region and the GM is in the normal view
- **THEN** the GM sees the goblin under the tint, and players do not see it

#### Scenario: Player view is opaque
- **WHEN** the GM views the room as a player, or turns on Player view in the map editor's Fog step
- **THEN** fog is drawn fully opaque, as players see it
