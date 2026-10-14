## MODIFIED Requirements

### Requirement: Attack animation
When a to-hit or damage attack roll is committed while a viewer is connected, and that viewer can see both the attacker and the target, the viewer's board SHALL play an animation of a strike travelling from the attacker token to the target token followed by an impact on the target. A damage roll SHALL NOT play the strike when it follows a to-hit roll: that is, when the latest earlier attack roll in the viewer's copy of the room from the same attacker at the same target is a to-hit roll. Nothing SHALL be played in its place. A damage roll that does not follow a to-hit roll SHALL strike as any other attack roll. The animation SHALL be the same built-in default for every token and participant. Attack rolls the viewer already had when the room loaded, reloaded or resynchronised SHALL NOT animate.

#### Scenario: Live attack animates
- **WHEN** Aria's owner rolls to hit Goblin while the GM and another player, who can see both tokens, are connected
- **THEN** each of their boards plays a strike from Aria to Goblin ending in an impact on Goblin

#### Scenario: Damage after a to-hit does not strike again
- **WHEN** Aria's owner rolls to hit Goblin, the GM rules it a Hit, and Aria's owner rolls damage against Goblin
- **THEN** each viewer's board plays the strike for the to-hit roll only, and nothing plays when the damage roll's dice land

#### Scenario: Damage-only attack still strikes
- **WHEN** Aria's owner rolls a named attack with no to-hit roll, such as Magic Missile, against Goblin
- **THEN** each viewer's board plays a strike from Aria to Goblin

#### Scenario: A to-hit the viewer never saw
- **WHEN** the GM rolls a GM-only to-hit for Ogre against Aria, then rolls public damage against Aria
- **THEN** players' boards play a strike for the damage roll, and the GM's board does not

#### Scenario: A different target
- **WHEN** Aria's owner rolls to hit Goblin and then rolls damage against Orc
- **THEN** the damage roll plays a strike from Aria to Orc

#### Scenario: Reload does not replay
- **WHEN** a viewer reloads after several attack rolls
- **THEN** no attack animation plays for those earlier rolls
