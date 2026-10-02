## ADDED Requirements

### Requirement: Attack animation
When a to-hit or damage attack roll is committed while a viewer is connected, and that viewer can see both the attacker and the target, the viewer's board SHALL play an animation of a strike travelling from the attacker token to the target token followed by an impact on the target. The animation SHALL be the same built-in default for every token and participant. Attack rolls the viewer already had when the room loaded, reloaded or resynchronised SHALL NOT animate.

#### Scenario: Live attack animates
- **WHEN** Aria's owner rolls to hit Goblin while the GM and another player, who can see both tokens, are connected
- **THEN** each of their boards plays a strike from Aria to Goblin ending in an impact on Goblin

#### Scenario: Reload does not replay
- **WHEN** a viewer reloads after several attack rolls
- **THEN** no attack animation plays for those earlier rolls

### Requirement: Ruling and damage endings
When the GM rules an attack roll a Hit, viewers who can see its target SHALL see a hit effect on the target (a flash and shake). When the GM rules it a Miss, they SHALL see a visibly different miss effect (a deflect or whiff). When the GM applies damage, they SHALL see the amount rise from the target as a floating number such as "−7". Clearing a ruling SHALL play nothing.

#### Scenario: Hit and miss differ
- **WHEN** the GM rules one roll Hit and another roll Miss
- **THEN** the target of the first shows the hit effect and the target of the second shows the miss effect, and the two are distinguishable

#### Scenario: Damage number
- **WHEN** the GM applies a 7-damage roll to Goblin
- **THEN** "−7" rises from Goblin and fades out

### Requirement: No animation reveals hidden tokens
An attack, ruling or damage animation SHALL NOT play for a viewer when the attacker or the target is hidden from that viewer, and nothing drawn SHALL reveal a hidden token's position. An animation SHALL only use tokens present in the viewer's own copy of the room.

#### Scenario: Hidden attacker
- **WHEN** a hidden monster attacks Aria with a public roll
- **THEN** players see no attack animation, and the GM sees it

#### Scenario: Hidden target ruled
- **WHEN** the GM rules a public roll against a hidden target a Hit
- **THEN** players see no hit effect anywhere on the board

### Requirement: Fixed condition effects
Each status condition SHALL have one fixed visual effect, defined in the product and not changeable by users, drawn on a token for as long as that condition is set and removed when it is cleared. Every viewer who can see the token SHALL see the same effect. The effects SHALL be distinct per condition and SHALL include at least: poisoned — green bubbles; frightened — trembling; stunned — circling stars; prone — token tilted; invisible — faded shimmer; concentrating — pulsing ring; unconscious — greyed out. The existing condition shape and abbreviation badges SHALL remain unchanged and SHALL stay the way conditions are identified; colour and motion SHALL be decoration only.

#### Scenario: Effect follows the condition
- **WHEN** the GM sets Poisoned on Goblin and later clears it
- **THEN** every viewer of Goblin sees green bubbles while it is set and none after, and the "PO" badge shows as before

#### Scenario: Badges unchanged
- **WHEN** a token has Stunned and Prone
- **THEN** it shows both effects and still shows the ST and PR badges with their shapes

### Requirement: Reduced motion
When the viewer prefers reduced motion, no travelling or looping animation SHALL play. An attack SHALL instead show a brief static marker on the target; hit, miss and damage SHALL show static, short-lived indicators; condition effects SHALL be drawn without motion.

#### Scenario: Reduced motion attack
- **WHEN** a viewer with reduced motion enabled sees an attack roll
- **THEN** no strike travels across the board and a static marker briefly appears on the target

#### Scenario: Reduced motion condition
- **WHEN** a viewer with reduced motion enabled sees a stunned token
- **THEN** the stun effect is drawn but does not move

### Requirement: Effects never interfere with play
Effects SHALL NOT block or delay input: clicks, drags, pans and zooms SHALL behave as without them. Effects SHALL NOT change any token's position in the room; any shake or tilt SHALL be visual only and the token SHALL be drawn back at its board-coordinate position when the effect ends. Effects SHALL follow a token that moves while they play.

#### Scenario: Drag during an animation
- **WHEN** a player drags their token while a hit effect is playing on it
- **THEN** the drag works as usual and the token lands where it was dropped

#### Scenario: Shake leaves position unchanged
- **WHEN** a hit effect shakes Goblin
- **THEN** Goblin's recorded position is unchanged and it is drawn exactly there afterwards
