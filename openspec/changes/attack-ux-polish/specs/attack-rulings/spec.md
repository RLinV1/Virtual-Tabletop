## MODIFIED Requirements

### Requirement: Roll type on attack rolls
Every attack roll SHALL be either **To hit** or **Damage**, and the type SHALL be stored with the roll:
- a named attack's to-hit roll is To hit;
- a named attack's damage roll is Damage;
- a custom roll takes the type chosen in the Custom roll builder, which defaults to To hit and is remembered in the last-used custom settings for the token.

An attack roll made without a type, including every roll made before the roll type existed, SHALL count as To hit. The custom Roll control SHALL name the type, e.g. "Roll 1d20+5 to hit Goblin" or "Roll 1d8+3 damage to Goblin".

#### Scenario: Damage roll recorded as damage
- **WHEN** Aria's owner chooses Damage, 1d8+3, target Goblin in Custom roll, and rolls
- **THEN** the roll is recorded as a damage roll against Goblin

#### Scenario: Custom type is remembered
- **WHEN** the viewer rolls a custom Damage roll for Aria, reloads, and opens Custom roll for Aria
- **THEN** the roll type is set to Damage

### Requirement: GM Rulings list
The GM's Play tab SHALL show a **Rulings** list, and players SHALL NOT be shown it. The list SHALL show, newest first, the attack rolls in the recent roll log that still need the GM:
- to-hit rolls without a verdict, each with the target's current AC and **Hit** and **Miss** controls;
- damage rolls not yet applied whose target still tracks HP, each with the target's current HP and an **Apply −N** control, where N is the damage that would be applied.

These controls SHALL be full-size buttons. A roll SHALL leave the list once it is ruled or applied. The GM SHALL also be able to set, change or clear a verdict from the roll log in the Dice tab.

While any rolls are pending:
- the GM's Play tab SHALL show how many, from any tab;
- the initiative controls SHALL show "N rulings pending" beside **Next turn**. It SHALL NOT prevent advancing the turn.

#### Scenario: Pending roll appears with AC
- **WHEN** Aria's owner rolls 17 to hit Goblin, whose AC is 13
- **THEN** the GM's Rulings list shows "Aria → Goblin · 17" with "AC 13" and Hit and Miss controls

#### Scenario: Ruled roll leaves the list
- **WHEN** the GM marks that roll Hit
- **THEN** it leaves the Rulings list and shows as Hit in the roll log

#### Scenario: Pending count outside the Play tab
- **WHEN** the GM is on the Tokens tab and two rolls are waiting for a ruling
- **THEN** the Play tab shows 2, and the initiative controls show "2 rulings pending" next to Next turn, which still works

#### Scenario: Players have no Rulings list
- **WHEN** a player opens the Play tab
- **THEN** there is no Rulings list, no pending count, and no ruling or apply controls anywhere

### Requirement: Player sees the outcome
The Attack section SHALL show the viewer's latest attack roll, at the top of the section, with its current outcome:
- "Waiting for the GM" while a to-hit roll has no verdict;
- **Hit** or **Miss** once ruled;
- **Applied** once a damage roll has been applied.

**Roll damage after a Hit.**
- If the roll was made with one of the attacker's named attacks and that named attack has a damage roll, the section SHALL offer **Roll damage** with that named attack's dice. Tapping it SHALL immediately roll that damage against the same target, labeled "<attack> damage", with the same visibility as the to-hit roll it follows. A GM-only attack's damage SHALL stay GM-only whatever the GM's current setting.
- Otherwise **Roll damage** SHALL switch the Custom roll builder to Damage, open it and keep the same target, without rolling.

**The GM's own rolls.** On their own latest attack roll, the GM SHALL also be offered **Hit** and **Miss** for a to-hit roll without a verdict, and **Apply −N** for an unapplied damage roll whose target tracks HP. These act exactly as in the Rulings list.

**Player tab indicator.** When the GM rules on, or applies, a player's latest attack roll while that player is on another tab, the player's Play tab SHALL show an indicator until they open it.

The roll log SHALL show the verdict, or that damage was applied, on every attack roll.

#### Scenario: Waiting, then hit
- **WHEN** Aria's owner rolls to hit Goblin with the Longsword named attack
- **THEN** the top of their Attack section shows "Waiting for the GM", and once the GM marks it Hit, it shows Hit and offers "Roll damage 1d8+3"

#### Scenario: One-tap damage
- **WHEN** the owner taps Roll damage
- **THEN** a damage roll `1d8+3` labeled "Longsword damage" is made against Goblin at once

#### Scenario: Private attack, private damage
- **WHEN** the GM makes a GM-only to-hit roll, rules it Hit, switches tabs and back, and taps Roll damage
- **THEN** the damage roll is GM-only too, and players receive neither it nor a ping

#### Scenario: Ruling arrives on another tab
- **WHEN** Aria's owner rolls to hit, switches to the Dice tab, and the GM marks the roll Hit
- **THEN** the Play tab shows an indicator, which clears when the owner opens Play

#### Scenario: GM rules on their own roll
- **WHEN** the GM rolls Goblin A's to-hit against Aria
- **THEN** the top of the GM's Attack section offers Hit and Miss for that roll, and choosing Miss rules it without visiting the Rulings list
