# Design

## Context

`MapSection` in `GmPanel.tsx` opens the editor in a `Modal` with class `map-editor`. Inside, from top to bottom:

1. `Modal`'s own `modal-head` (title "Edit map" and Close).
2. The steps bar (`map-editor-steps`).
3. `map-editor-body`, a two-column grid: the step's canvas or form, and a 20 rem `map-editor-hud`.

`.modal-body` adds padding and a `gap` between those rows. `WallCanvas` holds its own camera (`cx`, `cy`, `zoom`), a ResizeObserver-measured size, the pointer-to-map mapping and the pan and zoom handling. Fog today lives in `FogPanel` (keyboard controls, Manage tab) and in the board's Fog tool (`boardView.ts`: rect, polygon and reveal modes, using `fogRegionAt`).

## Decisions

### D1. One header row

`Modal` gets an optional `headerContent` prop (default none, so every other modal is unchanged). It renders in the title bar between the title and Close. The editor puts its step tabs and draft notice there, so the editor has one header row: the "Edit map" heading, the steps, the draft notice and Close. The title id, `aria-labelledby` and the close button stay as they are.

Alternatives considered: a `chromeless` modal where the child supplies its own header (more surface, duplicates the close button and title id), and hiding `.modal-head` with CSS (leaves both in the accessibility tree).

### D2. Canvas sizing

- `.map-editor .modal-body` padding goes to `var(--space-2)` and its `gap` to `var(--space-2)`.
- The side panel narrows from 20 rem to 17 rem and scrolls inside itself.
- `.map-editor-split` uses `grid-template-rows: minmax(0, 1fr)` so the canvas takes the full height. This is the likely cause of the shrunk map: `height: 100%` on a grid whose parent is a flex child with `min-height: 0` can resolve to the content height. It is confirmed first, by measuring the canvas in the running editor with Playwright, before the fix is chosen.
- `fit` already letterboxes the map in the canvas; the canvas background is a flat dark colour so the letterbox reads as part of the board.
- The Grid step shows `GridForm`, whose map canvas was `clamp(12rem, 48dvh, 36rem)` inside a 1120 px column. Inside the editor the column widens to 1800 px and the canvas to `clamp(16rem, 64dvh, 70rem)`; the form below it scrolls.
- Under 760 px the layout stacks, with `minmax(50dvh, 1fr)` for the canvas.

### D3. Shared `MapCanvas`

Extract from `WallCanvas`:

- the camera state and fit,
- the ResizeObserver size,
- `toMap`, `onMap`, wheel zoom, Space/middle-button/Pan-mode panning, the click-versus-drag slop,
- the zoom buttons.

`MapCanvas` takes the map, the grid, a `mode` string that is only used for the cursor class, and render-prop layers: an SVG layer drawn in map coordinates, and pointer callbacks that receive map points (`onClick(point, event)`, `onDrag`, `onMove`, `onLeave`, `onKeyDown`). `WallCanvas` becomes the wall layers and wall handlers on top of it, with unchanged behaviour. `FogCanvas` is the fog layers and handlers.

This keeps invariant 8 in one place: every handler sees map pixels, never screen pixels.

### D4. Fog canvas behaviour

- **Rendering:** each fog region is a semi-transparent dark shape (the GM's view of fog, as on the board), drawn over the map and under the tool overlays. The region the Reveal tool would remove is highlighted.
- **Rectangle:** pointer down starts, move shows a dashed preview, pointer up sends `fog.add` with `{ shape: "rect", from, to }`. A drag shorter than the click slop sends nothing.
- **Polygon:** each click adds a corner; Enter, or a click within 12 screen pixels of the first corner with at least 3 corners, sends `fog.add` with `{ shape: "polygon", points }`. Escape, right-click or changing tool drops it. More than `MAX_FOG_POINTS` corners is refused in the UI with a message, matching the shared schema, and the server still validates.
- **Reveal:** a click uses `fogRegionAt(state.fog, point)` (already in `board/tools.ts`, topmost wins) and sends `fog.remove`.
- **Snap:** fog points are not snapped (the board's Fog tool does not snap either). Alt makes no difference here.
- **Pan:** as in Walls.

### D5. `FogControls` shared with the Manage tab

`FogPanel` splits into `PanelSection` + `FogControls`. `FogControls` holds Fog whole map, Fog a block of cells, the region list and Reveal, with its status and error handling unchanged. The Manage tab's section and the Fog step's side panel both render it. The Fog step's side panel adds the tools and a hint above it. This keeps one implementation of the focus handling after a reveal and the screen-reader status.

### D6. Steps

`STEPS` in `GmPanel.tsx` gains `{ key: "fog", label: "4 · Fog" }`. With no map the step renders the same "Apply a map in the Map step first" message as Walls. Applying a draft map still moves to Walls (walls first, then fog).

### D7. No protocol change

Fog commands, events, `reduce`, `decide` and both visibility filters are untouched, so no ADR and no review by the Real-Time Architecture owner is needed. The editor sends commands only through `RoomConnection.command` (the standard pattern, step 5), and authorization stays on the server.

## Risks / Trade-offs

- **Extraction churn.** Moving camera and pointer code out of `WallCanvas` risks regressions in Walls. Mitigation: the Walls tests in `mapEditorWalls.test.tsx` run unchanged before and after the extraction.
- **Chromeless modal.** A second `Modal` mode is more surface. It is one optional prop, and it removes a duplicated header instead of hiding it.
- **Two fog tools.** The board and the editor both draw fog. They share `fogRegionAt` and the commands but not input code (Pixi versus SVG), as for walls. Accepted: CLAUDE.md keeps Pixi in `board/`, and the editor is SVG.
- **Window size claims.** The 90% figure in the spec is checked in a real browser at 1920 × 1080 with Playwright, not in jsdom, which has no layout.
