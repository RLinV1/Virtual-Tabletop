## 1. GM sees through fog

- [x] 1.1 In `boardView.ts`, set `FOG_GM_ALPHA` to `0.5` and keep `layerFog` putting fog over tokens for a GM with Show › Fog on (design D3). Verify in `npm run dev`: a GM sees a fogged token dimmed under the tint, and a player's view stays opaque.
- [x] 1.2 Drop `"player"` from `GmFogView`, simplify the `gm` flag in `redrawFog`, and make `isGmFogView` in `Board.tsx` map a saved `"player"` to `"tint"` (D4). Verify with `npm run typecheck`, and by loading with `localStorage["vtt.ui.gmFogView"] = '"player"'`: the GM sees the 50% tint.
- [x] 1.3 Check that View as player draws fog fully opaque and that Show › Fog off still shows only faint outlines. Verify in `npm run dev`.

## 2. Fog tool contract in the web app

- [x] 2.1 In `board/tools.ts`, restore `FogMode` (`"rect" | "polygon" | "reveal"`) and the `{ kind: "fog"; mode: FogMode }` variant of `BoardTool` from `2252bbf`. Verify `npm run typecheck` names every `BoardTool` switch that needs a fog case.
- [x] 2.2 In `ui/ToolRail.tsx`, restore the GM-only `CloudFog` Fog button, the `FOG_MODES` flyout (Rectangle, Polygon, Reveal), `ToolOptions.fog` with default `rect`, and the fog branch of `toolFor`. Verify with a rail test that a GM sees the Fog button and its three modes, and a player sees no Fog button (FR-GM-17).

## 3. Board gestures

- [x] 3.1 In `boardView.ts`, restore `FogDraft`, the `addFog` and `removeFog` callbacks, `FOG_CLOSE_PX`, `fogDraftPoints`, and the `pendingFog`, `removingFog`, `fogPoints` and `fogHover` state, against the current file (D1). Verify `npm run typecheck`.
- [x] 3.2 Restore Rectangle (drag end calls `sendFog`), Polygon (`fogClick` corners, close on the first corner, `closeFogPolygon`, `undoFogPoint`, `cancelFogPolygon`, hover edge) and Reveal (`fogRegionAt` over regions not being removed). Also restore the `setTool` reset of the polygon draft. Verify each mode in `npm run dev` as GM: a second browser as a player sees each change live.
- [x] 3.3 Draw pending regions and hide removing ones inside the current cloud-texture `redrawFog`. Restore `drawFogDraft` for the rectangle preview and the polygon draft, using `FOG_EDGE` (D2). Verify a released rectangle doesn't blink before the server answers, and a refused Reveal brings the region back.
- [x] 3.4 In `Board.tsx`, wire `addFog` and `removeFog` through `guarded.command`, restore `FOG_HINTS` and the hint selection, and handle Enter (close), Backspace (drop corner) and Escape (abandon polygon, then leave the tool) for the fog tool. Verify in `npm run dev` that the hint text changes per mode and the keys work. While viewing as a player, check in the network panel that no fog command is sent.

## 4. Tests

- [x] 4.1 Extend `apps/web/test/boardTools.test.ts` with `fogRegionAt` topmost-wins and miss cases, and `fogDraftPoints` for a rectangle dragged in any direction, all under `describe("... (FR-GM-17)")`. Verify `npm test --workspace=@vtt/web`.
- [x] 4.2 Confirm `apps/server/test/fog.test.ts` and `packages/shared/test/fog.test.ts` still pass unchanged, showing no contract change (D6). Verify `npm test`.

## 5. Docs and checks

- [x] 5.1 Update `ui/guide.ts` board-tools text to mention the GM's Fog tool, and the FR-GM-17 row in `docs/DESIGN.md` to name the board tool and the editor Fog step. Verify by reading the guide's Board tools step as GM in `npm run dev`.
- [ ] 5.2 Ask the teammate who removed the tool in `2252bbf` to review the PR. Verify their approval on the PR.
- [x] 5.3 Run `npm run lint && npm run typecheck && npm test` and confirm all pass.
