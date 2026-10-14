## MODIFIED Requirements

### Requirement: GM duplicates a token
The GM SHALL be able to duplicate any token, including a hidden one. Duplicate SHALL start placing copies of that token: each click on the board, or Enter on the keyboard position, SHALL create one copy on that square as its own action, until the GM ends placing. Each copy SHALL have the original's image, size, rotation, colour, stats, conditions, named attacks, owners and hidden state, and a new id. Copy names SHALL follow the room's unique-name rule. When the original is in a group, each copy SHALL join that group in the same action that creates it. All connected clients SHALL see the copies, each filtered for the viewer as any other token. The duplicate command SHALL also accept 1 to 20 copies with no square, placing them on the nearest free squares next to the original as before. Duplicate SHALL NOT ask for a count.

#### Scenario: Duplicate once
- **WHEN** the GM presses Duplicate on "Goblin" (HP 7/7, AC 15, Poisoned) and clicks an empty square
- **THEN** a token "Goblin 2" with HP 7/7, AC 15 and Poisoned appears on that square on every client, and the board is still placing copies

#### Scenario: Copies join the group
- **WHEN** "Goblin" is in "Gate guards" and the GM places two copies of it
- **THEN** "Goblin 2" and "Goblin 3" are in "Gate guards", and each undo removes one of them

#### Scenario: Hidden original
- **WHEN** the GM duplicates a hidden token
- **THEN** the copies are hidden and no player receives them

#### Scenario: Duplicate several
- **WHEN** a duplicate command with no square asks for 4 copies of "Goblin" in a room with only that goblin
- **THEN** "Goblin 2" to "Goblin 5" appear on free squares around it, as one action

#### Scenario: Count out of range
- **WHEN** a duplicate command asks for 0 or 21 copies
- **THEN** the server rejects the command and nothing is created
