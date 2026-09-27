# Spec Delta

## MODIFIED Requirements

### Requirement: Built-in assets in every library
The asset library SHALL include a fixed catalog of maps and token art that ships with the app. It SHALL be visible to every GM, including one who has uploaded nothing. It SHALL be listed separately from the GM's own assets, under "Included with the app", and filtered by the same tab and search. Built-in token art SHALL NOT be usable as a creature's image.

#### Scenario: New GM sees the defaults
- **WHEN** a GM with an empty library opens the asset library
- **THEN** the Maps tab lists The Broken Span, Hollowfrost Keep and Temple of the Green Sun under "Included with the app", and the Token Art tab lists the five included portraits

#### Scenario: Search covers built-ins
- **WHEN** the GM searches "frost" on the Maps tab
- **THEN** Hollowfrost Keep is listed and the other built-in maps are not
