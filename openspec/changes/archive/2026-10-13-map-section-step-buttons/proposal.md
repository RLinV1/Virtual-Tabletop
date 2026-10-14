# Proposal

## Why

In a room, Manage › Battle map has one Edit map button. It always opens the map editor on the Grid step, so a GM who wants to change the map, set up walls or fog first has to find the right step tab. Unsaved work is also handled unevenly inside the editor. Switching steps never asks about it, and closing the editor asks about walls, fog and a draft map but silently throws away grid changes to the current map.

## What Changes

- With a map in the room, Manage › Battle map shows four buttons instead of Edit map: **Change Map**, **Edit Grid**, **Manage Walls** and **Manage Fog**. Each opens the same map editor on its step (Map, Grid, Walls, Fog). The step tabs stay, so the GM can still move between steps.
- With no map yet, the section is unchanged: Upload map and From library.
- Change Map opens the editor's Map step. A map chosen from the library there becomes a private draft that goes through the Grid step and Apply map, as uploads already do, instead of being sent straight to the table as Manage's From library does when there is no map.
- Switching step tabs with unsaved changes asks **Save / Discard / Keep editing**:
  - walls or fog changes: Save sends them (Save changes), and Discard drops the walls and fog draft;
  - grid changes to the current map: Save applies the grid, and Discard resets the grid draft;
  - a draft map: asked only when leaving the Map and Grid steps for Walls or Fog, since uploading a map moves from Map to Grid on purpose. Save applies the map with its grid, and Discard drops the draft map.
  - Keep editing stays on the current step. Save is disabled, with the reason shown, when the grid isn't valid.
- Closing the editor also asks about unsaved grid changes to the current map, like it already does for walls, fog and a draft map.
- Step changes the editor makes itself, such as moving to Walls after Apply map, never ask.
- The guide's Map setup step names the new buttons.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `map-editor`: "Map setup opens as its own screen" changes from one Edit map control to four step buttons. A new requirement covers asking about unsaved changes when switching steps, and when closing with grid changes.

## Impact

- `apps/web/src/pages/GmPanel.tsx` (`MapSection`, `GmPanel` passes the grid draft state through), `apps/web/src/ui/guide.ts`.
- Tests: `apps/web/test/mapEditorWalls.test.tsx` (it uses "Edit map"), plus new tests.
- No change to `packages/shared`, the server, commands or events. Saving still uses the existing grid apply and walls/fog save paths.
- Sequencing: depends on the `map-editor` change being archived first so `map-editor` is a main spec. The `map-editor-drafts` and `map-editor-larger-view-and-fog` changes only add requirements and are not affected.
