## MODIFIED Requirements

### Requirement: GM Rulings list
The GM's Play tab SHALL show a **Rulings** list, and players SHALL NOT be shown it. The list SHALL show, newest first, the attack rolls in the recent roll log that still need the GM:
- to-hit rolls without a verdict, each with the target's current AC and **Hit** and **Miss** controls;
- damage rolls not yet applied whose target still tracks HP, each with the target's current HP and an **Apply −N** control, where N is the damage that would be applied.

These controls SHALL be full-size buttons. A roll SHALL leave the list once it is ruled or applied. The Dice tab SHALL NOT offer ruling controls; its roll log only shows the verdict.

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

#### Scenario: No ruling controls in the Dice tab
- **WHEN** the GM opens the Dice tab, before or after ruling Aria's to-hit roll, and opens Roll history
- **THEN** neither the latest roll nor any roll in Roll history has Hit or Miss controls, and a ruled roll's title still ends with its verdict, e.g. "· Hit"
