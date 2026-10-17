## ADDED Requirements

### Requirement: Animations in the library
A GM SHALL have an Animations tab in the asset library that lists the GM's own animations with name and shape, filtered by a case-insensitive name search. An animation has a name of 1 to 60 characters and a definition made only of: a shape (`slash`, `projectile`, `bolt` or `nuke`), a duration from 0.2 to 4 seconds, two six-digit hex colours, a size from 0.5 to 3, a particle count from 0 to 120, and glow, shake and flash intensities from 0 to 1. A GM SHALL be able to create, edit, rename, duplicate and delete their animations. The library SHALL also offer each built-in style and the nuke as a starting point that can be duplicated into the GM's animations. Every library animation endpoint SHALL be GM-only, SHALL authorize on the server, and SHALL answer 404 for another GM's animation, the same as for one that does not exist. The server SHALL reject any definition outside these bounds with 400 and store nothing. A GM SHALL NOT hold more than 100 animations.

#### Scenario: Create and list
- **WHEN** the GM saves a slash animation named "Fire blade" with orange colours and 40 particles
- **THEN** the Animations tab lists "Fire blade" as a slash

#### Scenario: Out-of-range definition
- **WHEN** a request creates an animation with 500 particles, a duration of 60 seconds, a colour of "red", or an unknown shape
- **THEN** the server responds 400 and no animation is added

#### Scenario: Another GM's animation
- **WHEN** GM B requests rename or delete for an animation owned by GM A
- **THEN** the server responds 404 and the animation is unchanged

#### Scenario: Player credential rejected
- **WHEN** a request to a library animation endpoint carries only a room guest credential
- **THEN** the server responds 401

#### Scenario: Duplicate a built-in
- **WHEN** the GM duplicates the built-in magic style
- **THEN** a new library animation named after it with the same definition appears and can be edited

### Requirement: Editor with live preview
The Animations tab SHALL let the GM edit an animation's fields and SHALL show a preview stage with a stand-in attacker and target and a Play button. Play SHALL run the animation exactly as a board would, using the unsaved values in the editor. The preview SHALL NOT change any room, token or library data. Unsaved edits SHALL stay out of the library until the GM saves. For a `nuke` shape the preview SHALL play the blast over the stage. When the GM prefers reduced motion, the preview SHALL show the same static markers a board shows.

#### Scenario: Preview unsaved changes
- **WHEN** the GM changes the colour of "Fire blade" to blue and presses Play without saving
- **THEN** the preview plays a blue animation and the library still holds the orange one

#### Scenario: Preview touches nothing
- **WHEN** the GM presses Play several times
- **THEN** no event is sent to any room and no library record changes

#### Scenario: Nuke preview
- **WHEN** the GM presses Play on a nuke animation
- **THEN** the stage plays a shockwave, flash and shake, and nothing is damaged

### Requirement: Attaching an animation to an attack
A GM SHALL be able to attach one of their library animations, other than a `nuke`, to a named attack on a creature or a token. The animation definition SHALL be copied into the attack, so players see it without library access and later changes to the library animation SHALL NOT change an attack or a room. When a named attack with an animation is rolled, the server SHALL copy the actor token's matching attack animation into the roll's attack context; a client SHALL NOT be able to supply one. Every viewer who can see the attack SHALL play that animation in place of the built-in style animation, under the same visibility and reduced-motion rules as any attack animation. Removing the animation from the attack SHALL restore the built-in style.

#### Scenario: Custom animation plays for everyone
- **WHEN** Aria has a named attack "Flame Tongue" with the "Fire blade" animation, and her owner rolls it against Goblin
- **THEN** every viewer who can see both tokens sees the "Fire blade" animation, not the built-in slash

#### Scenario: Library edit does not change the attack
- **WHEN** the GM later changes "Fire blade" in the library
- **THEN** Aria's "Flame Tongue" still plays the copy it was given

#### Scenario: Forged animation
- **WHEN** a client sends an attack roll that includes an animation of its own
- **THEN** the server ignores it and uses only the actor's matching attack animation, if any

#### Scenario: Nuke animation on an attack
- **WHEN** the GM tries to attach a `nuke` animation to an attack
- **THEN** it is refused

### Requirement: Using an animation for the nuke
The nuke control SHALL let the GM choose a `nuke` animation from the library or the built-in. The chosen definition SHALL be validated by the server and carried in the `MapNuked` event, so every viewer plays it. A definition whose shape is not `nuke` SHALL be refused.

#### Scenario: Custom blast
- **WHEN** the GM detonates a nuke with their "Green death" nuke animation
- **THEN** every viewer's board plays "Green death" instead of the built-in blast

#### Scenario: Wrong shape
- **WHEN** a request detonates a nuke with a slash animation
- **THEN** the server rejects it and no event is appended
