## MODIFIED Requirements

### Requirement: Attack section in Play
The Play tab SHALL contain an Attack section. Its attackers SHALL be exactly the tokens the viewer controls: tokens they own, and every visible token for the GM. If the viewer controls exactly one token, the section SHALL name that token and SHALL NOT show a choice. Otherwise it SHALL offer a choice of attacker.

The attacker SHALL be:
- the viewer's token holding the active turn, whenever the turn moves to one, even if the viewer had chosen a different attacker;
- otherwise the attacker the viewer last chose;
- otherwise the first token.

A viewer who controls no token SHALL be told so instead of being offered the controls. Choosing an attacker SHALL be allowed whether or not it is that token's turn. The Tokens roster and the My tokens rows SHALL NOT offer attack controls.

**Outside combat.** Attacks SHALL never be disabled for lack of an encounter; surprise attacks, traps and objects happen outside one. While no encounter is running, the section heading SHALL say so, e.g. "Attack · no encounter running".
- The section SHALL start collapsed when no encounter is running, unless this browser has a remembered choice for it.
- It SHALL open when an encounter starts.
- It SHALL collapse when an encounter ends.
- It SHALL open when the viewer's own token's turn begins, unless the viewer collapsed it themselves during that encounter.

This applies to the GM and players alike.

#### Scenario: Player sees only their own tokens as attackers
- **WHEN** a player who owns Aria opens the Play tab with Aria and Goblin 2 on the board
- **THEN** the Attack section names Aria as the attacker, offers no choice, and does not offer Goblin 2

#### Scenario: The active turn is preselected
- **WHEN** a player owns Aria and Bram and it is Bram's turn
- **THEN** the Attack section preselects Bram

#### Scenario: The attacker follows the turn
- **WHEN** the GM chose Goblin A as attacker during Goblin A's turn and then advances to Goblin B's turn
- **THEN** the Attack section switches to Goblin B

#### Scenario: Quiet outside combat
- **WHEN** a player first opens a room with no encounter running
- **THEN** the Attack section is collapsed, its heading reads "Attack · no encounter running", and opening it offers every control

#### Scenario: Opens for the fight
- **WHEN** the GM starts an encounter while the player's Attack section is collapsed
- **THEN** the section opens, and it collapses again when the GM ends the encounter

#### Scenario: A deliberate choice is kept for the encounter
- **WHEN** during an encounter the player collapses the Attack section, and later their token's turn begins
- **THEN** the section stays collapsed

#### Scenario: Attacking out of turn is allowed
- **WHEN** initiative is running, it is Goblin 2's turn, and Aria's owner picks a target for Aria
- **THEN** the target is selected and Aria can roll

### Requirement: Choosing dice and rolling
The Attack section SHALL show the viewer's latest attack roll above its other controls: the dice landing, the result, and its outcome as described under the rulings requirements.

Rolls other than a named attack's SHALL be made with a **Custom roll** builder. The builder SHALL be collapsed by default, SHALL remember in this browser whether it was left open, and SHALL let the viewer set:
- the roll type;
- a die type from d4, d6, d8, d10, d12, d20 and d100;
- a number of dice from 1 to 20;
- an integer modifier from −99 to 99;
- an optional label of at most 40 characters;
- for the GM only, whether the roll is GM-only. This choice also applies to named-attack rolls, SHALL be offered above the named attacks together with any hidden-token warning, and SHALL be kept when the viewer leaves and returns to the Play tab.

The custom settings SHALL start from the last ones this browser used with the chosen attacker, or a to-hit `1d20` with no label the first time. The custom Roll control SHALL name the expression, type and target, e.g. "Roll 1d20+5 to hit Goblin 2", and SHALL be unavailable until a target is chosen. Every roll SHALL be a single roll that carries the attacker, the target and the label. Every roll SHALL also send a ping at the target's position; the ping SHALL be sent only for a public roll whose target is visible to players.

#### Scenario: Custom roll
- **WHEN** Aria's owner targets Goblin 2, opens Custom roll, chooses 1 × d20 with modifier +5 and label "Longsword", and rolls
- **THEN** one roll of `1d20+5` is made, carrying Aria as attacker, Goblin 2 as target and "Longsword" as the label, a ping appears on Goblin 2 for everyone, and the result shows at the top of the section

#### Scenario: Builder stays out of the way
- **WHEN** a player who has only ever used named attacks opens the Play tab
- **THEN** Custom roll is collapsed and the named attacks are the first controls after the target

#### Scenario: Settings are remembered per token
- **WHEN** the viewer rolls a custom `1d20+5` with Aria, reloads the page, and opens Custom roll for Aria
- **THEN** the dice are set to `1d20+5`

#### Scenario: GM-only attack sends no ping
- **WHEN** the GM makes a GM-only attack roll against Aria
- **THEN** players receive neither the roll nor a ping

## ADDED Requirements

### Requirement: Named attacks
The viewer SHALL be able to keep up to 8 named attacks per token. Each named attack SHALL have:
- a name of at most 40 characters;
- a to-hit roll, a damage roll, or both, each chosen as die type, number of dice and modifier.

The Attack section SHALL list them as its attacks, e.g. "Longsword", "Fire Bolt", "Claws", with an **Add attack** control. The app SHALL NOT classify them (weapon, spell or other); the name is only a label. Named attacks SHALL be added, edited and removed in the Attack section, SHALL be kept in this browser only, and SHALL NOT be sent to the server or other participants.

Tapping a named attack, once a target is chosen, SHALL roll immediately:
- a named attack with a to-hit roll rolls it, as a to-hit roll labeled with the named attack's name;
- a named attack with only a damage roll rolls it, as a damage roll labeled "<name> damage".

Attack controls SHALL be unavailable until a target is chosen. Saved attacks from before this change SHALL become named attacks the first time they are read:
- a saved to-hit attack becomes a named attack with that to-hit roll;
- a saved damage attack becomes a damage-only named attack.

#### Scenario: One tap to hit
- **WHEN** Aria has an attack "Longsword" (to hit `1d20+5`, damage `1d8+3`), Goblin 2 is the target, and her owner taps Longsword
- **THEN** a to-hit roll `1d20+5` labeled "Longsword" is made against Goblin 2 at once

#### Scenario: Damage-only named attack
- **WHEN** Bram has an attack "Burning Hands" with only damage `3d6` and his owner taps it with Goblin A targeted
- **THEN** a damage roll `3d6` labeled "Burning Hands damage" is made against Goblin A at once

#### Scenario: Saved attacks become named attacks
- **WHEN** a browser holds saved attacks "Longsword 1d20+5" (to hit) and "Damage 1d8+3" (damage) for Aria from before this change
- **THEN** Aria shows an attack "Longsword" with to hit `1d20+5`, and a damage-only named attack "Damage" with `1d8+3`

## REMOVED Requirements

### Requirement: Saved attacks
**Reason**: Replaced by Named attacks. A named attack keeps a to-hit and a damage roll together, and tapping it rolls rather than only filling the builder.
**Migration**: Existing saved attacks in `vtt.attack.saved` become named attacks the first time they are read (see "Named attacks"). Nothing on the server changes.
