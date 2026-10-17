## ADDED Requirements

### Requirement: Attack style
An attack roll MAY carry one of three styles: `melee`, `ranged` or `magic`. The attack panel SHALL offer a three-way style picker, none selected by default. The chosen style SHALL be stored on the roll's attack context and sent to every viewer who can see the roll, and SHALL be validated by the server: any other value SHALL be refused. Rolls made before this requirement, and rolls with no style chosen, SHALL stay valid and have no style. The style SHALL change only how the attack is drawn; it SHALL NOT change the roll, the dice, the verdict or the damage.

#### Scenario: Style chosen
- **WHEN** a player picks Magic and rolls damage against Goblin
- **THEN** the roll's attack context has style `magic` and every viewer who can see the roll gets it

#### Scenario: Forged style
- **WHEN** a client sends an attack roll with style `"nuclear"`
- **THEN** the server rejects the roll

#### Scenario: Old rolls still load
- **WHEN** a room holds attack rolls with no style
- **THEN** it loads, replays and renders them without error
