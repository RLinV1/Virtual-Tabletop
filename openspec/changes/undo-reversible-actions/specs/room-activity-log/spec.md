## MODIFIED Requirements

### Requirement: Readable attributed actions
Every supported event SHALL have a sentence describing its action and actor, with System for a null actor and a readable fallback for missing names. Token names SHALL remain available for actions preceding deletion. Entries SHALL include their committed timestamp and sequence. An undo SHALL appear as its own entry that names the GM who undid and the action that was undone; the undone action's original entry SHALL remain in the history. Taking back applied damage SHALL read as its own sentence naming the amount and the roll.

#### Scenario: Movement and dice
- **WHEN** Mara moves Goblin and Tomas rolls 1d20 with a total of 15
- **THEN** history describes Mara moving Goblin and Tomas rolling 1d20: 15

#### Scenario: Renaming and deletion
- **WHEN** an actor changes name or a token is deleted after an action
- **THEN** the earlier entry retains names appropriate to that earlier action

#### Scenario: Undo entry
- **WHEN** Mara moves Goblin and the GM, Raymond, then undoes that move
- **THEN** history keeps the entry for Mara moving Goblin and adds a newer entry describing Raymond undoing the move of Goblin

#### Scenario: Taking back damage
- **WHEN** the GM undoes applying 7 damage from Aria's attack on Goblin
- **THEN** history includes an entry saying the GM took back 7 damage from that roll
