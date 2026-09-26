# Spec Delta

## MODIFIED Requirements

### Requirement: The home page demonstrates the product
The home page SHALL show what the product does using the product's own behaviour, not depictions of it. It SHALL NOT contain an interface built to look like a screenshot. It SHALL include at least one real battle map image. Tokens shown on its maps SHALL be drawn the way the board draws a token, including the token's art when it has some, and SHALL sit in the middle of a grid square.

#### Scenario: Grid alignment is operable
- **WHEN** a visitor drags the cell-size control in the grid demo
- **THEN** the app's grid resizes over a real map that shows its own faint squares, the current cell size is shown, and at the map's cell size the two grids coincide

#### Scenario: Visibility is shown from both sides
- **WHEN** a visitor switches between the GM view and the player view
- **THEN** a token marked hidden is present in one and absent from the other, and the caption states that its place in the turn order is withheld too

#### Scenario: Dice run the real engine
- **WHEN** a visitor submits a dice expression
- **THEN** it is parsed and rolled by the same shared functions the table uses, every die is shown alongside the total, and an invalid expression shows the parser's own message

#### Scenario: Tokens are drawn as the board draws them
- **WHEN** a map on the home page shows a token that has character art
- **THEN** the art fills the token's disc, clipped to its circle, with its ring, hit-point bar and name kept; if the art fails to load, the token shows its coloured disc and initial instead

#### Scenario: Tokens sit in a square
- **WHEN** a map on the home page shows tokens
- **THEN** each token's centre is the centre of a grid square on that map's faint grid, on open floor rather than on a wall

## ADDED Requirements

### Requirement: Home page maps show their squares
Every map example on the home page SHALL show a faint grid that matches that map's own squares. The hero, grid demo and visibility examples SHALL show a 16:9 crop of a built-in map that is 20 squares wide and starts on one of its grid lines. The library shelf SHALL show each built-in map whole, with a lighter grid, and label it with the size and grid from the built-in catalogue. The maps shown SHALL be drawn from directly overhead and SHALL contain no creatures other than the tokens placed on them.

#### Scenario: Faint grid on every example
- **WHEN** a visitor views the hero, the grid demo, either visibility view, or the library shelf
- **THEN** each map shows a faint grid whose lines roughly follow the drawn floor tiles and walls

#### Scenario: Crops start on a grid line
- **WHEN** the hero, grid demo or visibility map is shown
- **THEN** its top-left corner is a grid intersection and it is 20 squares wide, so each square is roughly one token wide on screen

#### Scenario: The shelf shows whole maps
- **WHEN** a visitor views the library shelf
- **THEN** each built-in map is shown whole, and its label shows the map's real pixel size and grid cell size

#### Scenario: No extra creatures
- **WHEN** any home page map is shown
- **THEN** the only creatures on it are the tokens the page places
