## Why

The tabletop is built around Dungeons & Dragons: D&D 5e conditions, HP/AC, to-hit and damage rolls with GM rulings, and a 5 ft grid. A group playing another game, or no particular system, gets all of that whether they want it or not. Jira KAN-63 asks for a game preset chosen when the room is set up, starting with Free Mode and Dungeons & Dragons, built so that more games can be added later without redesigning the flow.

## What Changes

- A **preset registry** in the shared package: each preset is one definition with an id, display name, short description, and its default configuration (which rules features are on, the condition list, default grid units). The create-room form and the server read the registry; neither names a preset in code.
- Two presets to start:
  - **Free Mode** (`free`): a plain tabletop. Tokens, maps, grid, fog, dice, chat, initiative and pings work as today. No attack rolls or rulings, no D&D conditions, AC hidden; HP stays as an optional generic counter; grid measures in squares.
  - **Dungeons & Dragons 5th Edition** (`dnd5e`, SRD 5.1): everything the room does today, unchanged.
- The GM picks the preset on the **Create room** form (and when creating from an encounter template). The default selection is Dungeons & Dragons, so existing habits do not change.
- The preset is **saved with the room**: recorded in `RoomCreated`, held in `RoomState.preset`, and restored on every reload and reconnect. Rooms created before this change are Dungeons & Dragons.
- The active preset is **shown** in the room's top bar next to the room name and on each room card in the GM dashboard.
- The **server enforces** the preset: in Free Mode it rejects attack rolls, rulings, damage application and conditions; the UI hides those controls as a hint only.
- A short **developer guide** `docs/GAME_PRESETS.md` explains how to add a preset.
- Out of scope: switching the preset of an existing room, presets for other games, per-preset character sheets.

## Capabilities

### New Capabilities
- `game-presets`: choosing a preset at room creation, the two initial presets and what each turns on, persistence and display of the active preset, server enforcement, and extensibility.

### Modified Capabilities

## Impact

- `packages/shared`: new `gamePresets.ts` (registry, `GamePresetId`, `presetOf`), `RoomCreated.preset` (optional), `RoomState.preset` (default `dnd5e`), `CreateRoomRequest.preset` (optional), `decide` checks; tests `packages/shared/test/gamePresets.test.ts`.
- `apps/server/src/http/routes.ts`: create-room passes the preset into `RoomCreated` and the room's grid defaults; GM room list includes it. Integration test for persistence across reload and Free Mode rejections.
- `apps/web`: create-room form preset choice (`GmDashboardPage.tsx`), preset badge in `RoomPage` top bar and dashboard cards, panels hide attack/rulings/conditions/AC in Free Mode.
- New ADR `docs/adr/0027-game-presets.md` (changes `RoomCreated` and `RoomState`), and `docs/GAME_PRESETS.md`.
