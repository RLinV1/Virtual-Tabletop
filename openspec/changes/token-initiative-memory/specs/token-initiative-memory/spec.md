## ADDED Requirements

### Requirement: Initiative scores are saved per token
When the GM starts an encounter, the server SHALL save each score entered on its token. A saved score SHALL persist after the encounter ends, after reloads, and in later sessions, and SHALL be replaced the next time the GM starts an encounter with a new score for that token. Tokens that are not in the entries SHALL keep their saved score.

#### Scenario: Scores survive the encounter
- **WHEN** the GM starts an encounter giving Goblin 12 and Aria 17, then ends it
- **THEN** Goblin still has 12 saved and Aria 17

#### Scenario: New score replaces old
- **WHEN** the GM starts a later encounter giving Goblin 8
- **THEN** Goblin's saved score is 8

#### Scenario: Token left out keeps its score
- **WHEN** the GM starts an encounter without Aria in the entries
- **THEN** Aria keeps her saved score and gets no turn in that encounter

### Requirement: Start encounter pre-fills saved scores
The Start encounter popup SHALL still open each time. Each token's field SHALL be pre-filled with its saved score, if any, and the GM SHALL be able to accept, edit or clear it before starting. A cleared field SHALL give that token no turn and SHALL NOT erase its saved score.

#### Scenario: Popup shows saved scores
- **WHEN** the GM opens Start encounter and Goblin has 12 saved
- **THEN** Goblin's field shows 12 and can be changed

#### Scenario: New token starts empty
- **WHEN** a token has never had a score
- **THEN** its field is empty

### Requirement: Saving scores is recorded in history
Saving scores SHALL be part of the same committed event as starting the encounter and SHALL record each replaced value, so history shows what changed. Stored history from before this change SHALL load unchanged with no saved scores. Initiative events are not part of undo, so none is added.

#### Scenario: Replaced value recorded
- **WHEN** the GM starts an encounter that replaces Goblin's score 12 with 8
- **THEN** the committed event records the new score 8 and the previous score 12

#### Scenario: Old events load
- **WHEN** an encounter-start event from before this change is replayed
- **THEN** it builds the same turn order as before and changes no saved score

### Requirement: Saved scores respect hidden tokens
A saved score SHALL be visible to a viewer only on tokens that viewer can see. Hidden tokens' scores SHALL NOT reach players in snapshots, events, resyncs or any other payload.

#### Scenario: Hidden monster's score
- **WHEN** a hidden monster has a saved score and a player loads the room
- **THEN** the player's state contains neither the token nor its score
