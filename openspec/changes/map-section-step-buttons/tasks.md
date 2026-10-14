# Tasks

## 1. Step buttons

- [x] 1.1 In `MapSection` (`apps/web/src/pages/GmPanel.tsx`), replace Edit map with Change Map, Edit Grid, Manage Walls and Manage Fog in a wrapping `row button-row` (carrying `data-tour="gm-grid"`). Each calls `openOn(step)` for `map`, `grid`, `walls` or `fog`. Leave the no-map Upload map / From library row as is. Verify by test 3.1.
- [x] 1.2 Update the "Map setup" step in `apps/web/src/ui/guide.ts` to name the four buttons, and verify that `npm test --workspace=@vtt/web -- guide` passes.

## 2. Asking about unsaved changes

- [x] 2.1 Pass `gridDraft`, `hasGridDraft` and `onGridApply` from `GmPanel` into `MapSection`. Add `gridDirty` (the draft is invalid, or not `gridsEqual` to the room's grid) and the `pendingFor(from, to)` check from design.md. Verify that `npm run typecheck` passes.
- [x] 2.2 Generalise the "Save changes?" modal to `{ kind: "map" | "grid" | "draft", then: step | "close" }`, with Save / Discard / Keep editing doing what design.md describes for each kind. Save is disabled, with the reason, when the grid or draft map doesn't parse. Replace the "Discard this map?" modal with it. Verify by tests 3.2–3.5.
- [x] 2.3 Route tab clicks through `requestStep(key)`, and route `requestClose` through the same check (draft map, then grid, then walls/fog). Leave automatic `setStep` calls as they are. Verify by tests 3.2–3.6.

## 3. Tests

- [x] 3.1 In `apps/web/test/mapEditorWalls.test.tsx`, replace the "Edit map" clicks with the new buttons (Manage Fog for the fog helpers) and keep each test's checks. Add a test showing that each of the four buttons opens its step, that closing returns focus to the pressed button, and that a room with no map shows Upload map and none of the four. Verify with `npm test --workspace=@vtt/web -- mapEditorWalls`.
- [x] 3.2 Add `apps/web/test/mapEditorStepSwitch.test.tsx` (jsdom, `describe("map editor step switching (FR-GM-09, FR-GM-17)")`, mounting `GmPanel` the way `mapEditorWalls.test.tsx` does). Fog the whole map in the Fog step, then choose the Walls tab: the prompt appears and the Fog tab is still selected. Keep editing keeps the draft on Fog. Verify with `npm test --workspace=@vtt/web -- mapEditorStepSwitch`.
- [x] 3.3 In the same file, Discard sends no command and shows Walls, and Save sends `fog.add` and shows Walls. Verify with the same command.
- [x] 3.4 In the same file, with `hasGridDraft` and a changed grid draft, choosing Walls from Grid asks, and Save calls `onGridApply` with the parsed grid before showing Walls. A draft equal to the room's grid doesn't ask. Verify with the same command.
- [x] 3.5 In the same file, closing the editor with a changed grid draft asks instead of calling `onGridDraftCancel` straight away. Verify with the same command.
- [x] 3.6 In the same file, switching steps with nothing unsaved doesn't ask. Verify with the same command.

## 4. Wrap-up

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test` and verify all three pass.
