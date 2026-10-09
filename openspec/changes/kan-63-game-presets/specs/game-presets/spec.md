## Purpose

Lets the GM choose which game a room is set up for, applies that game's default configuration, and keeps the choice with the room, through a preset system that new games can join without changing the selection flow.

## ADDED Requirements

### Requirement: GM chooses a preset when creating a room
The Create room form SHALL offer every preset in the preset registry, in registry order, each with its name and a one-line description. At first, the registry SHALL contain Free Mode and Dungeons & Dragons 5th Edition. Dungeons & Dragons SHALL be selected by default. Creating a room from an encounter template SHALL offer the same choice. The server SHALL reject a preset id that is not in the registry.

#### Scenario: Presets offered
- **WHEN** the GM opens the Create room form
- **THEN** it offers "Free Mode" and "Dungeons & Dragons 5th Edition", with Dungeons & Dragons selected

#### Scenario: Unknown preset
- **WHEN** a create-room request names a preset id that is not in the registry
- **THEN** the server rejects it and no room is created

### Requirement: Preset applies its configuration
Creating a room SHALL apply the chosen preset's default configuration. Dungeons & Dragons SHALL keep every current feature: the D&D conditions, HP and AC, attack rolls with to-hit and damage, GM rulings and damage application, and a grid where one square is 5 ft. Free Mode SHALL turn off attack rolls, rulings, damage application, conditions and AC, keep HP as an optional counter, and use a grid where one square is 1 sq. Every other feature (maps, tokens, fog, dice, chat, initiative, pings, areas, checkpoints, undo) SHALL work the same in both presets.

#### Scenario: Free Mode room
- **WHEN** the GM creates a room in Free Mode and opens a token
- **THEN** the token editor offers no conditions and no AC, the Play tab has no attack section, and the ruler measures in sq

#### Scenario: D&D room unchanged
- **WHEN** the GM creates a room with Dungeons & Dragons
- **THEN** conditions, AC, attacks and rulings are available as before, and the ruler measures in ft

### Requirement: Server enforces the preset
The server MUST reject, in a room whose preset turns a feature off, every command that uses that feature: an attack roll, a ruling, a damage application, and setting a condition on a token. Client-side hiding SHALL be only a hint.

#### Scenario: Forged attack in Free Mode
- **WHEN** a client sends an attack roll command in a Free Mode room
- **THEN** the server rejects it as invalid and nothing is recorded

#### Scenario: Forged condition in Free Mode
- **WHEN** the GM's client sends a command setting "Poisoned" on a token in a Free Mode room
- **THEN** the server rejects it and the token is unchanged

### Requirement: Preset is saved with the room
The chosen preset SHALL be recorded when the room is created and SHALL be the room's preset after any reload, reconnect, server restart, checkpoint restore or encounter template apply. A room created before presets existed SHALL be Dungeons & Dragons. The preset of an existing room SHALL NOT change.

#### Scenario: Reopen a Free Mode room
- **WHEN** the GM creates a Free Mode room, the server restarts, and the GM opens the room again
- **THEN** the room is still in Free Mode

#### Scenario: Old room
- **WHEN** a room created before this change is opened
- **THEN** its preset is Dungeons & Dragons and it behaves as before

### Requirement: Active preset is visible
Every participant SHALL see the room's preset name in the room's top bar. The GM dashboard SHALL show each room's preset on its room card. The preset SHALL be shown as text, not by colour alone.

#### Scenario: Player sees the preset
- **WHEN** a player joins a Free Mode room
- **THEN** the top bar shows "Free Mode" next to the room name

### Requirement: New presets need no change to the selection flow
Adding a preset SHALL require only a new definition in the preset registry (id, name, description, configuration) and its documentation; the create-room form, the server's validation, persistence and display SHALL pick it up without code changes of their own. The repository SHALL document how to add a preset.

#### Scenario: Registry drives the form
- **WHEN** a test registers a third preset definition
- **THEN** the create-room form offers it and the server accepts its id without other changes
