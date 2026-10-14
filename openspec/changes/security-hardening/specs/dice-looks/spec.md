## MODIFIED Requirements

### Requirement: The table follows the owner's choice
When the person chooses a look, chooses Classic, or edits the look in use, every room they have open SHALL be updated. A room they open later SHALL be updated when they enter it if its copy differs from their current choice. A look the owner deleted SHALL be taken off the table the next time they are in that room. Changes SHALL be limited to 10 per minute per participant in a room, counted across all of that participant's connections to it; further changes SHALL be refused with a message and change nothing.

#### Scenario: Edit while playing
- **WHEN** Kim replaces the d20 picture of the look in use while "Goblin Cave" is open
- **THEN** every participant sees Kim's next d20 roll with the new picture

#### Scenario: Room opened later
- **WHEN** Kim chose a new look while away from "Crypt", then enters "Crypt"
- **THEN** "Crypt" shows her new look for her next roll

#### Scenario: A second connection shares the limit
- **WHEN** Kim makes 10 look changes in one minute from one tab and an 11th from a second tab in the same room
- **THEN** the 11th is refused and changes nothing
