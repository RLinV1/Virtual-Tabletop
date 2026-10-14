## Context

`2252bbf` removed the board's Fog tool. That commit is a complete, reviewed implementation: about 145 lines in `boardView.ts`, plus `ToolRail.tsx`, `Board.tsx` and `tools.ts`. Since then the fog renderer in `boardView.ts` has changed:

- `983df00` added the drifting cloud texture tinted to the map's colour, and the `layerFog` reordering.
- The fog edge moved into `fogEdgeGraphics`.
- `FOG_GM_ALPHA` became `1`.

`fogRegionAt` is still in `board/tools.ts`, and the map editor's `FogCanvas` uses it. `ToolRail` still filters `gmOnly` tools, and `Board` still sends every command through `guardedConnection`, which drops commands while `readOnly` (View as player) is on.

Today `GmFogView` is `"tint" | "player" | "off"`. Only `"tint"` and `"off"` can be set, from Show › Fog. `"player"` is a legacy saved value that `Board` treats as "on". `redrawFog` already handles it, so the GM can still be put into the player rendering even though nothing offers it.

## Goals / Non-Goals

**Goals:**
- Bring the tool back from `2252bbf` with the same behaviour, on top of the current renderer, without reintroducing the old fog fill.
- Make the GM's tinted view see-through without losing the cloud look players get.

**Non-Goals:**
- Sharing input code between the board tool (Pixi) and the editor's `FogCanvas` (SVG). This was already accepted in `map-editor-larger-view-and-fog` (Risks: "Two fog tools").
- Changing the editor's draft model.

## Decisions

### D1. Re-apply the removed code; don't rewrite it

Take the `2252bbf` hunks for `tools.ts` (`FogMode`, `BoardTool` fog variant), `ToolRail.tsx` (`CloudFog` button with `gmOnly: true`, `FOG_MODES` flyout, `ToolOptions.fog`, `toolFor`) and `Board.tsx`:

- `addFog` and `removeFog` callbacks through `guarded.command`.
- `FOG_HINTS`.
- Enter, Backspace and Escape handling ahead of the Escape-leaves-tool branch.

In `boardView.ts`, restore the gesture side:

- `pendingFog`, `removingFog`, `fogPoints` and `fogHover`.
- `sendFog`, `closeFogPolygon`, `undoFogPoint`, `cancelFogPolygon` and `fogClick`.
- `drawFogDraft`.
- The `setTool` reset and the pointer hooks.

*Alternative:* rebuild on `FogCanvas`'s logic. Rejected because that code is SVG and React, and Pixi stays in `board/` (CLAUDE.md).

### D2. Pending and removing regions go through the current `redrawFog`

The old `redrawFog` drew pending regions and skipped removing ones with a flat `FOG_COLOR` fill. The current one uses a cloud texture and a separate edge graphic. Instead of restoring the old fill, the restored `draw` loop in `redrawFog`:

- iterates `state.fog` minus `removingFog`, then `pendingFog` (as `fogDraftPoints`);
- draws pending regions with the edge at half alpha, as before.

`fogDraftPoints` and `FOG_CLOSE_PX` come back. `FOG_COLOR` is used only by the rectangle preview in `drawFogDraft`, which can use `FOG_EDGE` instead, so it does not come back.

### D3. GM tint is 50%, fog stays over tokens

`FOG_GM_ALPHA` goes from `1` to `0.5`. This value matches the `gm-view-as-player` requirement. The wisp layer stays at `fillAlpha * FOG_WISP_ALPHA`.

`layerFog(true)` keeps fog above tokens for a GM with Show › Fog on. At half opacity a fogged token looks covered rather than hidden. This is the spec's "fogged token is marked for the GM", and it tells the GM what players are missing.

*Alternative:* move fog back under tokens for the GM. Rejected because fogged and unfogged tokens would then look the same.

### D4. Drop `"player"` from `GmFogView`

`GmFogView` becomes `"tint" | "off"`. `isGmFogView` in `Board.tsx` still accepts a saved `"player"` but maps it to `"tint"`, so browsers with the old value don't fall back silently. The `gm` flag in `redrawFog` becomes `this.you?.role === "gm"`.

The player preview needs no flag: `RoomPage` passes the previewed player as `you`, so `role !== "gm"` already draws fog opaque. The map editor's Player view is `FogCanvas`'s own prop and is unaffected.

### D5. The tool and Show › Fog off

With Show › Fog off the GM sees only faint outlines, and the Fog tool still works on them. Reveal hit-testing uses region geometry, not what is drawn. Nothing switches the view automatically.

### D6. No contract change

This change only uses `fog.add` and `fog.remove`. `decide`, `reduce`, both visibility filters and undo are untouched, so there is no ADR and no review by the Real-Time Architecture owner.

## Risks / Trade-offs

- [Re-applied code drifted from the current `boardView.ts` (gesture shape, `redrawOverlay` signature)] → Apply by hand against the current file, not with `git revert`. The restored `boardTools.test.ts` cases and a manual check of each mode cover it.
- [Two live fog UIs: the board tool and the editor draft] → If the GM opens the editor, its draft starts from current room state, and saving uses `fog.replace` against the ids it saw. A board edit while the editor is open isn't possible, because the editor is a full-screen modal for that GM.
- [A GM at 50% tint could misjudge what players see] → View as player shows the exact player rendering. The spec names it as the way to check.
- [The rail grows by one button for GMs] → Players' rails are unchanged.

## Migration Plan

Client-only. Deploy with the web app. Rollback is a revert of the change. A saved `"player"` value is read as `"tint"` (D4), so it can't break anything.

## Open Questions

- Should the tool get a keyboard shortcut like the other rail tools? Board tools have none today, so this is deferred.
