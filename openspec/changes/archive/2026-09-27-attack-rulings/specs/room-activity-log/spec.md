## ADDED Requirements

### Requirement: Readable rulings
The activity log SHALL describe each GM ruling and damage application with the GM's name and the roll it concerns, using the token names recorded on that roll:
- a new verdict;
- a changed verdict, naming the previous one;
- a cleared verdict;
- applied damage, including the amount.

The HP change that applying damage causes SHALL also appear, as for any stats change.

#### Scenario: Ruling and correction
- **WHEN** the GM marks Aria's 17 against Goblin a hit, then changes it to a miss
- **THEN** history describes the GM ruling Aria → Goblin (1d20+5: 17) a hit, and then changing it from a hit to a miss

#### Scenario: Damage applied
- **WHEN** the GM applies Aria's 7 damage to Goblin
- **THEN** history describes the GM applying 7 damage from Aria → Goblin, followed by Goblin's stats update
