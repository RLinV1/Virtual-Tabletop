## Context

`MapSection` in `GmPanel.tsx` has three entry points:
- Upload: `api.upload`, then `imageSize`, then `onSetMap` (commits), then open the grid modal in setup mode.
- From library: `place(asset)`, then `onSetMap(map, asset.grid)` (commits), then grid setup when there is no saved grid.
- Adjust grid: open the grid modal for the live map.

`GridForm` already takes `map`, `grid`, a `draft` and `onApply(grid)`. Its draft is GM-local and previewed on the GM's board only (`room-grid-calibration`). `scene.setMap` accepts an optional `grid`, and `decide` folds both into one `MapSet` event (ADR 0004). `Modal` wraps `<dialog>.showModal()` with focus return.

## Goals / Non-Goals

**Goals:**
- Zero room traffic until Apply, then exactly one command.
- Reuse the grid editor rather than building a second one.

**Non-Goals:** see proposal.md, Non-goals.

## Decisions

### 1. Draft lives in `MapSection` state
`const [prep, setPrep] = useState<{ map: MapImage; grid: GridSpec; source: "upload" | "library" } | null>(null)`. Upload and pick set `prep` instead of calling `onSetMap`. The overlay renders when `prep` is set. Apply calls `onSetMap(prep.map, gridFromEditor)`. Close sets `prep` to null. No new global store: the draft is short-lived and owned by one component.

*Alternative:* persist the draft on the server (contract §13.2). Deferred, see the proposal's Non-goals.

### 2. The editor previews against the draft image, not the board
For the live map, `GridForm` previews on the room board through `onGridDraftChange`. For a draft map, the board must keep showing the live map, so the overlay passes the draft image to `MapGridPreview` (which draws its own canvas) and does **not** call `onGridDraftChange`. A `previewTarget: "board" | "local"` prop on `GridForm` selects this.

### 3. Initial grid for a draft
A library map with a saved grid uses `normalizeLegacyGridForBoard(asset.grid, map)`, as `place` does today. Otherwise it takes the room's current grid with offsets normalised (`normalizeGridOffsets`). "Apply map" stays enabled even with an unchanged grid (as setup mode allows today via `allowUnchanged`), because the map itself is the change.

### 4. Dirty check on close
The draft is "dirty" once the grid differs from its initial value. `Modal`'s close path calls a guard. When dirty, a small confirm dialog (Keep editing / Discard) opens on top. The shared `Modal` supports nesting, because only the top layer is interactive.

### 5. Wide sheet
The overlay uses a `.prep-sheet` modal class: `width: min(1120px, 100vw - 48px)`, full viewport on narrow screens, scrolling body, sticky action row.

## Risks / Trade-offs

- [Upload succeeds, then the GM cancels: an unused object stays in storage] → It is recorded in `room_uploads` and deleted with the room. A later sweep can clean it up. Acceptable for now.
- [Reload during preparation loses the draft] → Expected without server drafts. The map was never published, so nothing at the table is wrong.
- [Players expected to see the map appear early] → That is the very behaviour the ticket removes. The GM can still apply first and adjust the grid afterwards.
