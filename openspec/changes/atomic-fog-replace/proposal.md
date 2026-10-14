## Why

Save in the map editor sends fog as separate `fog.add` and `fog.remove` commands. A room at the 100-region cap refuses the add before the remove can run, so a GM cannot swap one region for another. If the add succeeds and a later command fails, the room is left half saved. Review finding R13 on the walls change deferred this fix.

## What Changes

- New GM-only command `fog.replace { removeIds, add }`. The server removes and adds in one decision, so a full room can take a replacement and a refusal changes nothing.
- It emits the existing `FogRemoved` and `FogAdded` events, so there is no new event, no new state field and no visibility change. Undo reverses the whole swap as one action.
- Undo's fog-cap check counts the fog the undo would leave behind, so undoing a swap in a full room works.
- The map editor's Save sends one `fog.replace` instead of per-region fog commands, after wall and portal commands.
- ADR 0032 records the contract addition for Real-Time Architecture owner review.

## Capabilities

### Modified Capabilities
- `fog-of-war`: fog can be replaced in one action.

## Impact

- `packages/shared`: `commands.ts`, `decide.ts`, `undo.ts`, tests in `fog.test.ts`.
- `apps/web`: `mapEditor/mapDraft.ts` and its tests.
- Docs: `docs/adr/0032-atomic-fog-replace.md`.
