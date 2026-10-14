## Why

During play a GM often has to fog a room or reveal the next one in the middle of a scene. Today the only way to draw or reveal a region is Manage › Battle map › Manage Fog. That opens the full-screen map editor, edits a draft, and needs Save changes. The board's GM-only Fog tool, which did this in one gesture (FR-GM-17, KAN-28), was removed in `2252bbf`. The in-flight `map-editor-larger-view-and-fog` proposal still says that tool stays "for fog during play".

The GM's own board has also stopped showing what is under fog. `983df00` raised the GM's fog fill to fully opaque (`FOG_GM_ALPHA = 1`) and layered it over tokens. This contradicts FR-GM-17 ("the GM sees them semi-transparent") and the `gm-view-as-player` requirement that the GM's normal view shows through fog. A board fog tool is unusable if the GM cannot see what they are revealing.

## What Changes

- **Board Fog tool back on the rail.** A GM-only **Fog** button on the left tool rail. Its options flyout has three modes:
  - **Rectangle:** drag.
  - **Polygon:** click corners; close on the first corner or with Enter; Backspace drops a corner; Esc abandons the polygon.
  - **Reveal:** click a region to remove it.

  Each gesture sends `fog.add` or `fog.remove` straight to the room, with no dialog and no draft. Players never see the button. The tool is inert while the GM is viewing as a player.
- **GM sees through fog.** In the GM's normal view, fog is drawn half-opaque with its outline, so the map and every token under it stay visible. Fog stays fully opaque for players, in View as player, and in the map editor's Player view.
- **Show › Fog off stays.** It still hides the tint entirely and leaves a faint outline. It changes only the GM's own view.
- **Cleanup.** The unused `"player"` value of `GmFogView` is removed. Saved `"player"` values read as the default tint view.

## Non-goals

- No new commands, events, state or visibility rules. `fog.add`, `fog.remove`, server authorization, the visibility filters and activity-log undo are reused unchanged, so no ADR is needed.
- No change to the map editor's Fog step or its draft-and-save flow (`fog.replace`). The board tool is for play; the editor is for preparing a map.
- No new fog shapes, snapping or brush painting.
- The keyboard "fog a block of cells" form, removed in `2252bbf`, is not restored here.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `fog-of-war`: the add/remove requirement names the board Fog tool's location and live behaviour, and the GM-view requirement says when fog is see-through and when it is opaque. The spec is still in `kan-28-manual-fog`, which must be archived first.
- `gm-view-as-player`: "GM default view shows through fog" also covers the map editor's Player view and fog over tokens. "GM can switch the fog tint off" is unchanged in behaviour, so this change keeps it as it is. The spec is still in `gm-view-as-player`, which must be archived first.

## Impact

- `apps/web/src/board/tools.ts`: `BoardTool` gains `{ kind: "fog"; mode: FogMode }`.
- `apps/web/src/ui/ToolRail.tsx`: GM-only Fog button and mode flyout; `ToolOptions.fog`.
- `apps/web/src/board/boardView.ts`: Fog gestures, pending and removing state, polygon draft drawing; `FOG_GM_ALPHA` back to see-through; `GmFogView` drops `"player"`.
- `apps/web/src/board/Board.tsx`: `addFog` and `removeFog` callbacks through the read-only guard, Fog hints, Enter, Backspace and Esc keys, migration of the stored `"player"` value.
- `apps/web/test`: `boardTools.test.ts` and a rail test for GM-only visibility.
- Docs: `ui/guide.ts` board-tools text; `docs/DESIGN.md` FR-GM-17 note.
- `packages/shared`, `apps/server`: none.
