## 1. Measure and enlarge the canvas

- [ ] 1.1 Run the app (`npm run dev`) and use the Playwright MCP to open the editor at 1920 × 1080 and 1280 × 720; record the canvas size and which rule limits its height
- [x] 1.2 Add an optional `headerContent` prop to `Modal` (default none); the editor puts its step tabs and draft notice there, so one header row holds the "Edit map" heading, step tabs, draft notice and Close
- [x] 1.3 Tighten `.map-editor` padding and gaps, narrow `.map-editor-hud` to 17 rem, and give `.map-editor-split` a single `minmax(0, 1fr)` row so the canvas fills the height; keep the stacked layout under 760 px with the canvas at least `50dvh`
- [ ] 1.4 Re-measure with Playwright: canvas at least 90% of the window height at 1920 × 1080; whole map visible on open; screenshots for the PR

## 2. Extract the shared canvas

- [x] 2.1 Create `pages/mapEditor/MapCanvas.tsx` with camera, fit, ResizeObserver size, `toMap`/`onMap`, wheel zoom, pan (Pan mode, middle button, Space-drag), click-versus-drag slop and zoom buttons; handlers receive map points
- [x] 2.2 Rebuild `WallCanvas.tsx` on `MapCanvas` with its layers and handlers unchanged
- [x] 2.3 Run `mapEditorWalls.test.tsx` and `wallTools.test.ts` unchanged: all pass

## 3. Fog controls

- [x] 3.1 Split `FogPanel.tsx` into the `PanelSection` wrapper and a reusable `FogControls` (whole map, cells, region list, Reveal, status, error, focus after reveal)
- [x] 3.2 Keep `fogPanel.test.tsx` passing with no change to its expectations (FR-GM-17)

## 4. Fog step

- [x] 4.1 Create `pages/mapEditor/FogCanvas.tsx` on `MapCanvas`: render fog regions, Rectangle (drag), Polygon (click, Enter or first corner closes, Escape and right-click drop), Reveal (`fogRegionAt`), Pan; send `fog.add` and `fog.remove` only
- [x] 4.2 Refuse a polygon over `MAX_FOG_POINTS` corners with a message
- [x] 4.3 Create `pages/mapEditor/FogSetup.tsx`: tool buttons, hints, the canvas and `FogControls`; the "apply a map first" message when there is no map
- [x] 4.4 Add the `Fog` step to `STEPS` in `GmPanel.tsx` and render `FogSetup` for it

## 5. Tests (FR-GM-17)

- [x] 5.1 Add `describe("map editor fog (FR-GM-17)")` tests, reusing the harness in `mapEditorWalls.test.tsx` (move shared stubs to a helper): rectangle drag sends one `fog.add`; a click without drag sends nothing; a three-corner polygon closes on Enter and on the first corner; Escape drops it; Reveal sends `fog.remove` for the topmost region and nothing on empty map; no map shows the message
- [x] 5.2 Add a `GmPanel` test: the editor lists four steps and the Fog step opens its canvas and controls
- [ ] 5.3 Confirm with the visibility auditor that fog from the editor produces the same events as the board tool (no new payload)

## 6. Verify

- [ ] 6.1 Playwright end to end as GM and as a player in a second context: fog a rectangle and a polygon in the editor, reveal one, and confirm the player sees fog change and never sees editor-only state
- [ ] 6.2 Update `docs/DESIGN.md` and `guide.ts` text; run `npm run lint && npm run typecheck && npm test`
