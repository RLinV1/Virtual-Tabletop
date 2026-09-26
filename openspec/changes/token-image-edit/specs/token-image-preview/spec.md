## ADDED Requirements

### Requirement: The GM can change a token's image after creation
The token editor SHALL let the GM replace a token's image by uploading a file or choosing one from their library, or remove it, without recreating the token. The change SHALL keep the token's stats, conditions, owners and position. Only the GM SHALL be able to change a token's image. A hidden token's image change SHALL NOT be revealed to players.

#### Scenario: Uploading a new image
- **WHEN** the GM opens a token's editor, uploads an image and saves
- **THEN** every participant who can see the token sees the new image, and the token keeps its stats and conditions

#### Scenario: A player cannot change art
- **WHEN** a player sends an image change for a token they own
- **THEN** the server refuses it as forbidden
