# ADR 0027: Game presets

**Status:** Proposed — awaiting review by the Real-Time Architecture owner (Raymond)
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/kan-63-game-presets` · **Ticket:** KAN-63

## Context

Every room was implicitly Dungeons & Dragons 5e: D&D conditions, HP and AC, attack rolls with GM rulings, a 5 ft grid. KAN-63 asks for a game preset kept with each room, starting with Free Mode (Dungeons & Dragons deferred at the GM's request, 2026-10-09), built so more games can be added without redesigning the flow. The preset must be saved with the room and enforced, not just hidden.

## Decision

### A registry of plain data

`packages/shared/src/gamePresets.ts` holds `GAME_PRESETS`, an ordered list of `GamePreset { id, name, description, features, conditions, grid }`. `features` has three flags: `attacks`, `conditions`, `armorClass`. Callers ask `presetOf(state).features.x`, never compare ids, so a new game is one new entry. `GamePresetId` is a refined string, so the schema does not change per preset.

- `free`, "Free Mode": every feature on, all conditions, 5 ft squares. The only preset for now, and the default, so rooms behave exactly as before. Game presets such as Dungeons & Dragons are later entries.

### Saved in the log

`RoomCreated` gains optional `preset`; `RoomState.preset` is set by `reduce` (absent means `free`, so every existing room replays as before). No command changes it. It is public: players see which game they are in. Room lists that don't load the room read it from the room's first event (`presetFromLog`).

### Applied at creation

`POST /api/rooms` accepts optional `preset` (400 for an unknown id; the form offers a choice only once there are two presets), writes it into `RoomCreated`, and appends a `GridSet` with the preset's units only when they differ from the default grid, so a Free Mode room's log is exactly what it was. A room created from an encounter template keeps the template's grid alignment but takes the preset's units, and loses data for features the preset turns off (`tableForPreset`).

### Enforced in `decide`

After authorization, `presetRefusal` rejects (`invalid`, naming the feature and preset) attack rolls, rulings, damage application, named attacks on tokens, setting conditions, and setting AC, when the preset turns them off. `encounter.apply` strips the same data instead of refusing, so a template still loads into a room whose preset turns features off. Plain dice, HP, initiative, fog, areas and everything else are unaffected. The UI hides the same controls as a hint only.

## Consequences

- Changes two existing contracts (`RoomCreated`, `RoomState`) additively; old logs and clients that ignore the field keep working, but web and server deploy together as usual.
- A rolled-back server ignores `preset`; with Free Mode as the only preset nothing changes.
- Changing a room's preset later is out of scope; it would need a rule for conditions and rolls already on the board.

## Alternatives considered

- **Store the whole configuration in the room.** Bigger events, and a fixed default could never reach existing rooms. The id plus a versioned registry is enough.
- **`z.enum` of preset ids.** Every new preset would edit the schema.
- **Hide features in the UI only.** Fails FR-GM-15: a forged command would still apply.
