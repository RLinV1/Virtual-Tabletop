# ADR 0027: Game presets

**Status:** Proposed — awaiting review by the Real-Time Architecture owner (Raymond)
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/kan-63-game-presets` · **Ticket:** KAN-63

## Context

Every room was implicitly Dungeons & Dragons 5e: D&D conditions, HP and AC, attack rolls with GM rulings, a 5 ft grid. KAN-63 asks for a game preset chosen when the room is created, starting with Free Mode and Dungeons & Dragons, built so more games can be added without redesigning the flow. The preset must be saved with the room and enforced, not just hidden.

## Decision

### A registry of plain data

`packages/shared/src/gamePresets.ts` holds `GAME_PRESETS`, an ordered list of `GamePreset { id, name, description, features, conditions, grid }`. `features` has three flags: `attacks`, `conditions`, `armorClass`. Callers ask `presetOf(state).features.x`, never compare ids, so a new game is one new entry. `GamePresetId` is a refined string, so the schema does not change per preset.

- `dnd5e`, "Dungeons & Dragons 5th Edition" (SRD 5.1): every feature on, all conditions, 5 ft squares. The default.
- `free`, "Free Mode": attacks, conditions and AC off; HP stays as an optional counter; 1 sq squares.

### Saved in the log

`RoomCreated` gains optional `preset`; `RoomState.preset` is set by `reduce` (absent means `dnd5e`, so every existing room replays as before). No command changes it. It is public: players see which game they are in. Room lists that don't load the room read it from the room's first event (`presetFromLog`).

### Applied at creation

`POST /api/rooms` accepts optional `preset` (400 for an unknown id), writes it into `RoomCreated`, and appends a `GridSet` with the preset's units only when they differ from the default grid, so a D&D room's log is exactly what it was. A room created from an encounter template keeps the template's grid alignment but takes the preset's units, and loses data for features the preset turns off (`tableForPreset`).

### Enforced in `decide`

After authorization, `presetRefusal` rejects (`invalid`, naming the feature and preset) attack rolls, rulings, damage application, named attacks on tokens, setting conditions, and setting AC, when the preset turns them off. `encounter.apply` strips the same data instead of refusing, so a D&D template still loads into a Free Mode room. Plain dice, HP, initiative, fog, areas and everything else are unaffected. The UI hides the same controls as a hint only.

## Consequences

- Changes two existing contracts (`RoomCreated`, `RoomState`) additively; old logs and clients that ignore the field keep working, but web and server deploy together as usual.
- A rolled-back server ignores `preset`, so Free Mode rooms would behave as D&D: features return, nothing is lost.
- Changing a room's preset later is out of scope; it would need a rule for conditions and rolls already on the board.

## Alternatives considered

- **Store the whole configuration in the room.** Bigger events, and a fixed default could never reach existing rooms. The id plus a versioned registry is enough.
- **`z.enum` of preset ids.** Every new preset would edit the schema.
- **Hide features in the UI only.** Fails FR-GM-15: a forged command would still apply.
