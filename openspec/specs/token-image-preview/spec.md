# token-image-preview Specification

## Purpose
Shows a chosen token image exactly as the board will draw it before the token is placed, so the GM can judge the crop and look.

## Requirements

### Requirement: Token image preview matches the board
When the GM chooses an image for a token, the preview SHALL show it as the board will draw it: a circle of fixed size, the image scaled so its short edge fills the diameter and centred, over the token's colour disc. It SHALL NOT stretch or distort with the dialog's width.

#### Scenario: Wide image
- **WHEN** the GM chooses a 1672×941 image for a new token
- **THEN** the preview is a circle showing the centre of the image, not an ellipse

#### Scenario: Hidden token
- **WHEN** the GM ticks "Hidden from players" with an image chosen
- **THEN** the preview dims to the board's hidden appearance

#### Scenario: Long name
- **WHEN** the chosen image has a long name
- **THEN** the name truncates with an ellipsis, and the preview and Remove keep their size and place

#### Scenario: Remove aligned to the form edge
- **WHEN** an image is chosen
- **THEN** Remove sits at the right edge of the row, aligned with the full-width Add token button
