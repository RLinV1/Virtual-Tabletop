## REMOVED Requirements

### Requirement: Named attacks
**Reason**: Named attacks kept in one browser never reach the token's owner or the GM's other devices. They're replaced by "Shared named attacks", which keeps them on the token in the room.
**Migration**: Attacks saved only in a browser (`vtt.attack.presets`, and the older `vtt.attack.saved`) are cleared and not moved. Attacks a token got from a creature or from Duplicate are already on the token and are kept.

## ADDED Requirements

### Requirement: Shared named attacks
Each token SHALL hold up to 8 named attacks in the room. Each named attack SHALL have:
- a name of at most 40 characters, unique within the token, ignoring case;
- a to-hit roll, a damage roll, or both, each chosen as die type, number of dice and modifier.

The GM, and each owner of a token, SHALL be able to add, edit and remove that token's named attacks, both in the Attack section (with an **Add attack** control) and in the token editor. The token editor and the New Token form SHALL each show an **Attacks** section that collapses within the dialog: closed when the dialog opens, with the number of attacks in its heading, and listing the attacks with Add attack, Edit and Remove when opened. In New Token, the section SHALL show any attacks a creature filled in, and the attacks it lists SHALL be placed with the token. A change SHALL be saved to the token and reach every device of the GM and the token's owners. Other players SHALL NOT receive a token's named attacks, in snapshots or events. The server MUST refuse a change from a player who doesn't own the token, a change breaking these limits, and any change while the room's game preset has attacks off. The GM SHALL be able to undo a change from the activity log. The app SHALL NOT classify named attacks (weapon, spell or other); the name is only a label. Attacks saved only in a browser before this change SHALL be cleared, not read.

Tapping a named attack, once a target is chosen, SHALL roll immediately:
- a named attack with a to-hit roll rolls it, as a to-hit roll labeled with the named attack's name;
- a named attack with only a damage roll rolls it, as a damage roll labeled "<name> damage".

Attack controls SHALL be unavailable until a target is chosen.

#### Scenario: One tap to hit
- **WHEN** Aria has an attack "Longsword" (to hit `1d20+5`, damage `1d8+3`), Goblin 2 is the target, and her owner taps Longsword
- **THEN** a to-hit roll `1d20+5` labeled "Longsword" is made against Goblin 2 at once

#### Scenario: Damage-only named attack
- **WHEN** Bram has an attack "Burning Hands" with only damage `3d6` and his owner taps it with Goblin A targeted
- **THEN** a damage roll `3d6` labeled "Burning Hands damage" is made against Goblin A at once

#### Scenario: The GM's edit reaches the owner
- **WHEN** the GM opens Goblin's token editor, adds "Scimitar" (to hit `1d20+4`, damage `1d6+2`) and saves, while Goblin's owner is connected on another device
- **THEN** the owner's Attack section offers Scimitar for Goblin without a reload, and so does the GM's other device

#### Scenario: Attacks collapse in the dialogs
- **WHEN** the GM opens Goblin's token editor (2 attacks), or chooses From creature → "Goblin" in New Token
- **THEN** the dialog shows a closed section headed "Attacks · 2", and opening it lists both attacks with Edit, plus Add attack

#### Scenario: Attacks typed into New Token
- **WHEN** the GM adds "Bite" (to hit `1d20+3`, damage `1d6+1`) in New Token's Attacks section and places the token
- **THEN** the placed token has Bite for the GM and its owners

#### Scenario: An owner adds an attack
- **WHEN** Aria's owner adds "Fire Bolt" (to hit `1d20+5`, damage `1d10`) in the Attack section
- **THEN** Aria has Fire Bolt for the GM and her owner, and the activity log shows the change

#### Scenario: Other players never see attacks
- **WHEN** the GM changes the attacks of a goblin that Bram's owner doesn't own
- **THEN** Bram's owner receives nothing about those attacks, live or after a reload

#### Scenario: A forged edit is refused
- **WHEN** a player sends an attack change for a token they don't own
- **THEN** the server refuses it as forbidden and nothing changes

#### Scenario: Undo
- **WHEN** the GM removes Goblin's Scimitar by mistake and undoes it from the activity log
- **THEN** Goblin has Scimitar again for the GM and its owners

#### Scenario: Old browser attacks are cleared
- **WHEN** a browser still holds attacks for Aria saved only in that browser before this change
- **THEN** they are not shown and are removed from the browser, and Aria shows only the attacks on her token
