# Spec Delta

## MODIFIED Requirements

### Requirement: Browse and search the library
The library page (`/library`) SHALL show the GM's library in separate Maps, Token Art and Creatures tabs. Maps and Token Art SHALL show the GM's assets as thumbnails with name and pixel size. Creatures SHALL show the GM's creatures as described in `library-creatures`. Each tab SHALL filter by a case-insensitive name search. The GM SHALL be able to rename an asset.

#### Scenario: Tabs separate kinds
- **WHEN** a GM with two maps, three pieces of token art and one creature opens the Token Art tab
- **THEN** exactly the three pieces of token art are shown

#### Scenario: Search by name
- **WHEN** the GM types "gob" in the search field on the Maps tab
- **THEN** only maps whose name contains "gob", case-insensitively, are shown

### Requirement: Warn before deleting an asset in use
An asset is **in use** when the current state of any room owned by its GM references it as the map or as a token's image. Hidden tokens count. Before deleting, the library SHALL show the names of the rooms using the asset and require confirmation. For token art, the confirmation SHALL also name the GM's creatures that use it as their image, and say that they will lose their image. An asset not in use by any room or creature SHALL still require a plain confirmation. Past references in a room's history do not count as in use.

#### Scenario: Deleting an asset in use
- **WHEN** the GM deletes a token asset used by tokens in rooms "Goblin Cave" and "Crypt"
- **THEN** a confirmation names both rooms and says they will show a generic token, and nothing is deleted until the GM confirms

#### Scenario: Deleting token art used by creatures
- **WHEN** the GM deletes token art used by the creatures "Goblin" and "Goblin Boss"
- **THEN** the confirmation names both creatures and says they will lose their image, and nothing is deleted until the GM confirms

#### Scenario: Reference removed from the board
- **WHEN** the only token using an asset is deleted from its room
- **THEN** the asset is no longer reported as in use by that room

#### Scenario: Confirmed deletion
- **WHEN** the GM confirms deletion
- **THEN** the asset disappears from the library and its image is no longer retrievable, rooms that referenced it fall back as described in `board-asset-fallback`, and creatures that used it have no image
