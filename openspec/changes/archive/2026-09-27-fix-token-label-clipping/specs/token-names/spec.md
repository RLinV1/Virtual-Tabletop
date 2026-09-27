# Spec Delta

## ADDED Requirements

### Requirement: The board draws a token's whole name
The board SHALL draw every character of a token's name in the label under the token, for any name up to the 60-character limit. No character SHALL be cut off, in part or in whole. This SHALL hold whether or not other tokens are nearby, at any zoom level, and in current Firefox, Safari and Chrome. For a GM viewing a hidden token, the " (hidden)" suffix SHALL also be drawn in full.

#### Scenario: A long name is not cut off
- **WHEN** the GM places a token named "abcdefghijklmnopqrstuvwxyz" on an otherwise empty board
- **THEN** the label under the token shows all 26 letters, and the "z" is drawn whole

#### Scenario: A name at the length limit is not cut off
- **WHEN** a token is named with 60 characters
- **THEN** the label under the token shows all 60 characters

#### Scenario: Firefox draws the whole name
- **WHEN** a player views a token named "abcdefghijklmnopqrstuvwxyz" in Firefox on macOS
- **THEN** the label shows all 26 letters, the same as in Safari and Chrome

#### Scenario: Zooming does not cut the name off
- **WHEN** a viewer zooms the board in or out while a token named "abcdefghijklmnopqrstuvwxyz" is in view
- **THEN** the label shows all 26 letters at every zoom level

#### Scenario: The hidden suffix is drawn in full
- **WHEN** the GM views a hidden token whose name is 26 characters long
- **THEN** the label shows the whole name followed by " (hidden)", with no characters cut off
