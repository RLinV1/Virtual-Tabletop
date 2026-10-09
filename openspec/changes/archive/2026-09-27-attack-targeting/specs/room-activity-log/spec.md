## MODIFIED Requirements

### Requirement: Readable attributed actions
Every supported event SHALL have a sentence describing its action and actor, with System for a null actor and a readable fallback for missing names. Token names SHALL remain available for actions preceding deletion. A dice roll that carries attack context SHALL also name the attacking token, the target token, and the label if one was given, using their names at the time of the roll. Entries SHALL include their committed timestamp and sequence.

#### Scenario: Movement and dice
- **WHEN** Mara moves Goblin and Tomas rolls 1d20 with a total of 15
- **THEN** history describes Mara moving Goblin and Tomas rolling 1d20: 15

#### Scenario: Attack roll
- **WHEN** Tomas makes a Longsword attack roll with Aria against Goblin 2 and totals 17 on 1d20+5
- **THEN** history describes Tomas rolling an attack, Aria → Goblin 2 with Longsword, 1d20+5: 17

#### Scenario: Renaming and deletion
- **WHEN** an actor changes name or a token is deleted after an action
- **THEN** the earlier entry retains names appropriate to that earlier action
