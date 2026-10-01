# Spec Delta

## MODIFIED Requirements

### Requirement: Browse and search the library
The library page (`/library`) SHALL show the GM's library in separate Maps, Token Art, Creatures and Dice tabs. Maps and Token Art SHALL show the GM's assets as thumbnails with name and pixel size. Creatures SHALL show the GM's creatures as described in `library-creatures`. Dice SHALL show the viewer's dice looks as described in `dice-looks`. Each tab SHALL filter by a case-insensitive name search. The GM SHALL be able to rename an asset.

#### Scenario: Tabs separate kinds
- **WHEN** a GM with two maps, three pieces of token art and one creature opens the Token Art tab
- **THEN** exactly the three pieces of token art are shown

#### Scenario: Search by name
- **WHEN** the GM types "gob" in the search field on the Maps tab
- **THEN** only maps whose name contains "gob", case-insensitively, are shown

#### Scenario: Dice tab
- **WHEN** the GM opens the Dice tab
- **THEN** their dice looks are shown as cards, with the same search field and a New dice look action in the toolbar
