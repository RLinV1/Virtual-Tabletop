## ADDED Requirements

### Requirement: Encounter end clears the Attack section
When an encounter ends while a viewer has the room open, that viewer's Attack section SHALL clear:
- the latest-roll card, until the viewer makes another attack roll;
- the chosen target;
- the custom roll settings remembered per token;
- the picked named attack and any open named-attack editor.

Named attacks and the chosen attacker SHALL be kept. The GM's "Roll privately" setting SHALL be kept. Room state, the roll history and the dice log SHALL NOT change.

#### Scenario: Ending the encounter clears the last attack
- **WHEN** the GM rolled "d" damage from e at d, applied it, and then ends the encounter
- **THEN** the Attack section shows no dice tray or result, the target is "None yet", e is still the attacker, and named attack "d" is still listed

#### Scenario: The card returns on the next roll
- **WHEN** the encounter has ended and the GM rolls an attack again
- **THEN** the new roll shows in the latest-roll card

#### Scenario: Ended while Play was hidden
- **WHEN** the encounter ends while the viewer is on the Tokens tab, and they then open Play
- **THEN** the Attack section is already cleared

### Requirement: Encounter before Attack in Play
The Play tab SHALL show the Initiative section above the Attack section.

#### Scenario: Play tab order
- **WHEN** a viewer opens the Play tab
- **THEN** the Initiative section (Start encounter, or the turn order with Next turn) comes before the Attack section

## MODIFIED Requirements

### Requirement: Named attacks
The viewer SHALL be able to keep up to 8 named attacks per token. Each named attack SHALL have:
- a name of at most 40 characters;
- a to-hit roll, a damage roll, or both, each chosen as die type, number of dice and modifier.

The Attack section SHALL list them as its attacks, e.g. "Longsword", "Fire Bolt", "Claws", with an **Add attack** control. The app SHALL NOT classify them (weapon, spell or other); the name is only a label. Named attacks SHALL be added, edited and removed in the Attack section, SHALL be kept in this browser only, and SHALL NOT be sent to the server or other participants.

The named attacks SHALL be offered in one dropdown, each option showing the attack's name and dice, so the section's height does not grow with the number of attacks. Choosing an attack SHALL select it and SHALL NOT roll. An edit control beside the dropdown SHALL edit the selected attack. The first attack SHALL be selected by default, and a newly added attack SHALL become selected. A **Roll** button under the list SHALL roll the selected attack at the chosen target:
- a named attack with a to-hit roll rolls it, as a to-hit roll labeled with the named attack's name;
- a named attack with only a damage roll rolls it, as a damage roll labeled "<name> damage".

The Roll button SHALL name the attack and the target, and SHALL be unavailable until a target is chosen. Saved attacks from before named attacks SHALL become named attacks the first time they are read:
- a saved to-hit attack becomes a named attack with that to-hit roll;
- a saved damage attack becomes a damage-only named attack.

#### Scenario: Pick, then roll
- **WHEN** Aria has attacks "Longsword" (to hit `1d20+5`) and "Dagger" (to hit `1d20+4`), Goblin 2 is the target, and her owner chooses Dagger in the attack dropdown
- **THEN** nothing is rolled, Dagger is shown as the selected attack, and the button reads "Roll Dagger to hit Goblin 2"
- **WHEN** they click that button
- **THEN** a to-hit roll `1d20+4` labeled "Dagger" is made against Goblin 2

#### Scenario: Damage-only named attack
- **WHEN** Bram has only an attack "Burning Hands" with damage `3d6`, Goblin A is targeted, and his owner clicks Roll
- **THEN** a damage roll `3d6` labeled "Burning Hands damage" is made against Goblin A

#### Scenario: Saved attacks become named attacks
- **WHEN** a browser holds saved attacks "Longsword 1d20+5" (to hit) and "Damage 1d8+3" (damage) for Aria from before named attacks
- **THEN** Aria shows an attack "Longsword" with to hit `1d20+5`, and a damage-only named attack "Damage" with `1d8+3`
