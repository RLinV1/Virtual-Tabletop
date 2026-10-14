# Game presets: how to add one

A game preset is what a room is set up for, chosen on the Create room form and kept with the room (KAN-63, [ADR 0027](adr/0027-game-presets.md)). Free Mode, with every tool on, is the only preset for now. Adding another game is adding one definition; the form, the server's checks, persistence and display pick it up on their own.

## 1. Add the definition

In `packages/shared/src/gamePresets.ts`, add an object to `GAME_PRESETS`. The array order is the order the form offers, and the first is selected. With two or more presets the Create room form shows the choice on its own.

```ts
const PATHFINDER2E: GamePreset = {
  id: "pf2e",                      // stable: it is written into every room's log. Never rename it.
  name: "Pathfinder 2nd Edition",  // shown on the form, the room's top bar and the dashboard
  description: "Conditions, HP and AC, attack rolls with GM rulings, and a 5 ft grid.",
  features: { attacks: true, conditions: true, armorClass: true },
  conditions: ["blinded", "frightened", "grappled", "prone", "stunned", "unconscious"],
  grid: { unitsPerCell: 5, unitLabel: "ft" },
};

export const GAME_PRESETS: readonly GamePreset[] = [FREE, PATHFINDER2E];
```

| Field | What it does |
|---|---|
| `id` | Persisted in `RoomCreated`. Lowercase, no spaces. Unknown ids read as the default, so never remove one that rooms use. |
| `name`, `description` | Text on the form (name + description), the top-bar badge and dashboard cards (name). |
| `features.attacks` | Attack rolls (to-hit and damage), GM rulings, damage application, named attacks on tokens. Off: the Play tab has no Attack section and the server rejects those commands. |
| `features.conditions` | Status conditions on tokens. Off: no Conditions in the token editor or Add token; the server rejects setting any. |
| `features.armorClass` | AC on tokens. Off: no AC field; the server rejects a non-empty AC. |
| `conditions` | Which conditions the editor offers, from `ConditionId`. Empty when `features.conditions` is off. |
| `grid` | Units for a new room's squares. The GM can still change them in the grid settings. |

Everything not covered by a flag (maps, tokens, HP, fog, dice, chat, initiative, pings, areas, checkpoints, undo) works the same in every preset.

## 2. If the game needs something no flag covers

A new kind of rule (for example a different condition list per game, or a stat other than HP/AC) is a feature change, not a preset: add a flag to `PresetFeatures`, enforce it in `decide` with `presetRefusal`, strip it in `tableForPreset`, hide its controls where `presetOf(state).features` is read in `apps/web`, and give every existing preset a value for it. That changes a shared contract, so it needs an ADR and Real-Time Architecture review.

## 3. Tests to add

- `packages/shared/test/gamePresets.test.ts`: the registry order, and one enforcement case for each feature the new preset turns off.
- If it turns off a feature no other preset does, a server case in `apps/server/test/gamePresets.test.ts` for a forged command.

Run `npm run lint && npm run typecheck && npm test`.
