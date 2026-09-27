# Design

## Context

See proposal.md for the motivation and specs/asset-library/spec.md for the required behavior.

What exists today:

- `PATCH /api/library/:id` (`apps/server/src/http/library.ts`) already accepts `{ grid }`. It resolves the GM, returns 404 for other owners' assets, validates the body with the shared `GridSpec` (positive size up to 2000, canonical offsets), and refuses a grid on a token. It does not check the line limit. The stored record has the image's `width` and `height`.
- `decide` rejects `scene.setMap` and `scene.setGrid` when `!canRenderGrid(cellSize, map)` (`packages/shared/src/decide.ts`). Placement also raises old library grids with `normalizeLegacyGridForBoard`.
- The room's grid editor is `GridForm` in `apps/web/src/pages/GmPanel.tsx`. It is private to that file and includes `GridLineFields` and `GridLinePreview`, a small SVG line-style sample drawn in board pixels. The draft logic (`gridDraft.ts`: string fields, parsing, line-limit check, `gridsEqual`) is already standalone.
- The on-board draft preview is drawn by `BoardView.syncGrid` (Pixi). It depends on `RoomState` and the room connection, so the library cannot use it.
- `LibraryPage.tsx` renders owned assets with `AssetCard` (rename, delete) and built-ins with `BuiltinCard` (read-only).

## Goals / Non-Goals

**Goals:**
- One grid form shared by the room and the library, so the fields, nudges, validation and messages cannot drift apart.
- A full-map preview in the library that places lines at exactly the same positions the board does.
- The server enforces the same drawable-grid limit on every path that stores a grid.

**Non-Goals:**
- Automatic grid detection or confidence scores (FR-GM-03). The editor keeps "Confidence: manual".
- Sending library edits to rooms, and room-side notices about them.
- Checking uploaded image sizes on the server. `width` and `height` are still reported by the client at upload.
- Changes to `packages/shared` schemas, commands, events or the room pipeline.

## Decisions

### 1. Move `GridForm` into its own module with configurable labels

Move `GridForm`, `GridLineFields` and `GridLinePreview` from `GmPanel.tsx` to `apps/web/src/pages/GridForm.tsx` without changing their behavior. Add a `submitLabel` / `busyLabel` pair, defaulting to "Apply grid" / "Applying…", so the library can show "Save grid" / "Saving…". `GmPanel` imports it and keeps its in-room "Save grid to library" child.

*Alternative:* a second, library-only form. Rejected because the validation messages, nudge rules and line-limit handling were tuned in KAN-10 review, and a copy would drift.

### 2. A pure helper for grid line positions

Add `gridLines(grid, rect)` in `apps/web/src/board/gridLines.ts`. It returns the x positions of vertical lines and the y positions of horizontal lines that fall inside a board-pixel rectangle. It uses the board's rule: start at the offset and step by the cell size, including the far edge. `BoardView.syncGrid`, `GridLinePreview` and the new full-map preview all use it, so the three renderers agree on positions. The file has no Pixi imports. It sits in `board/` next to `gridRenderLimit.ts` because it defines board geometry.

*Alternative:* an SVG `<pattern>` tile. Cheaper to write, but it would not share the board's line rule, and scaled patterns can show seams or shimmer, which is misleading in an alignment tool.

### 3. The full-map preview is SVG with a viewBox camera

The new `MapGridPreview` component (`apps/web/src/pages/MapGridPreview.tsx`) renders an `<svg>` containing the map `<image>` at its pixel size and one `<path>` of grid lines. Zoom and pan change only the SVG `viewBox`, so everything stays in board coordinates (invariant 8) and no screen-pixel values are stored.

- **Controls:** mouse wheel or trackpad pinch zooms around the cursor, dragging pans, and buttons provide zoom in, zoom out and fit, for keyboard and touch users. Zoom ranges from fit-to-map to about 8 screen pixels per board pixel, and the view is kept over the map.
- **Line count:** lines are computed only for the visible part of the map, so zooming in never adds lines. At fit, the form's minimum cell size already keeps the count within `MAX_GRID_LINES`.
- **Line width:** lines use the draft's colour and opacity. Their width is the draft width in board pixels but never less than one screen pixel, using `vector-effect: non-scaling-stroke` when needed. Otherwise a 1 px grid on a 4000 px map would disappear at fit. The Advanced section's `GridLinePreview` still shows the exact proportion.
- **Invalid drafts:** while the draft is invalid, the preview keeps showing the last valid draft. This matches the room ("Preview is paused at the last valid values").

*Alternatives:* reuse `Board` with a fake room and a no-op connection, or move the Pixi grid drawing into a shared class. The user rejected both in favor of SVG. They drag in room-only machinery or require changes to `boardView.ts`, and neither is worth it here.

### 4. The library editor's state lives in `Library`

`Library` holds `gridTarget: LibraryAsset | null`, and one `Modal` renders the editor for that asset. `AssetCard` gets an **Edit grid** link, shown only when `asset.kind === "map"`. `BuiltinCard` stays unchanged. When the modal opens, the draft starts from `toGridDraft(normalizeLegacyGridForBoard(asset.grid ?? DEFAULT_GRID, asset))`. The comparison baseline is the saved grid as stored, so a raised old grid can be saved even if the GM changes nothing. Saving calls `api.library.update(gmToken, id, { grid })`. On success the modal closes and the updated asset replaces the old one in the list, which refreshes the "· 64px grid" label. On failure the modal stays open and shows the server's message. Cancel, Escape, the close button and a backdrop click discard the draft, as `Modal` already does.

The modal shows the preview and the form side by side on wide screens and stacked on narrow ones (320–390 px). It also includes a short note: "Rooms already using this map keep their grid; new placements use this one."

### 5. Server limit check in the PATCH route

In `PATCH /api/library/:id`, after the ownership and kind checks and before `store.updateAsset`, add:

```ts
if (patch.data.grid && !canRenderGrid(patch.data.grid.cellSize, existing)) {
  return void res.status(400).json({ error: "Grid cell size is too small for this map" });
}
```

`existing` already has `width` and `height`, which satisfies `BoardSize`. A rename without a grid is not checked, so old stored grids can still be renamed. The in-room "Save grid to library" path uses the same route. A room grid has already passed `decide` against the same map size, so it passes this check too.

*Alternative:* put the check in `LibraryPatchRequest`. Not possible, because the schema does not know the asset's size.

## Risks / Trade-offs

- [Moving `GridForm` out of `GmPanel.tsx` could break the in-room flow] → Move the code without changing its logic, keep the defaults on the room's current labels, and rerun the KAN-10 checks (Apply, Cancel, invalid drafts, the 320 and 390 px layouts) in the browser.
- [Using the shared helper changes `BoardView.syncGrid`] → The helper follows the existing loop exactly (start at the offset, include the far edge). Unit tests cover the offsets at the edges, and the in-room preview is checked visually.
- [The SVG preview's minimum line width makes lines look thicker than on the board when zoomed out] → Only the library preview does this, so the lines stay visible. Exact proportion appears at higher zoom and in the Advanced sample.
- [Very large maps (many megapixels) in an SVG `<image>`] → The browser decodes the image once, as the thumbnail does. The line count is bounded by the view, so zooming is cheap.
- [The limit check trusts dimensions the client reported at upload] → Accepted and listed as a non-goal. The check still matches the room pipeline, which trusts the same numbers.
- [The GM edits the same map's grid from a room and from the library] → The last save wins, which is acceptable for a single GM.

## Migration Plan

No data migration is needed. Existing library grids stay as they are. Grids below the limit are raised when the editor opens or when the map is placed. Rolling back means reverting the web changes and the one server check. There is no stored-format change.
