## Why

The grid is always drawn as 1-board-pixel black lines at 35% opacity (`boardView.ts` `syncGrid`). On dark maps (Hollowfrost Keep's chasms, night scenes) it disappears, and on busy maps a GM may want it bolder or subtler. The GM should be able to choose the grid's line colour with a colour wheel, its thickness with a preset slider, and its opacity, and every participant should see the same grid.

## What Changes

- **Three new grid fields.** `GridSpec` gains optional `lineColor` (`#rrggbb`), `lineWidth` (board pixels) and `lineOpacity` (0.05–1). Missing values mean today's look (`#000000`, 1, 0.35), so every existing room, event and saved library grid renders exactly as before.
- **Grid modal.** The GM's Grid modal gains an **Advanced** disclosure, closed by default. Inside:
  - **Colour:** a colour wheel (hue by angle, saturation by radius) plus a brightness slider, a hex field, and a few quick swatches (black, white, and the app's accent).
  - **Thickness:** a slider that snaps to five presets (Hairline 1, Thin 2, Medium 3, Thick 4, Bold 6 board pixels), labelled with the preset name.
  - **Opacity:** a slider from 5% to 100% in 5% steps, showing the percentage. It starts at today's 35%.
  - **Preview:** a small sample of grid lines over a crop of the current map updates live, because the modal's backdrop dims the board.
- **Applying.** "Apply grid" commits the style with the rest of the grid, through the existing `grid.set` command and `GridSet` event. That event already carries the full replaced `GridSpec` as `previous`, so undo restores the old colour and thickness (invariant 6).
- **Board.** The board draws lines in the chosen colour, width and opacity. Width is in board pixels, like every other board measure (invariant 8), so it scales with zoom the same way for everyone.
- **Library.** "Save grid to library" and placing a library map carry the style along with the grid, since it's part of `GridSpec`.

## Capabilities

### New Capabilities
- `grid-line-style`: GM-chosen grid line colour and thickness, shared by everyone in the room.

### Modified Capabilities
None. The grid's existing requirements live in unarchived changes; this change is additive.

## Impact

- **`packages/shared`:** `GridSpec` gains three optional fields. That's a change to an existing schema, so it needs **ADR 0005** (`docs/adr/0005-grid-line-style.md`, drafted with this change) and review by the Real-Time Architecture owner. `decide`, `reduce` and the visibility filters are unchanged: the grid is public, and `GridSet` already carries `previous`.
- **Web:** `board/boardView.ts` (`syncGrid`), `pages/GmPanel.tsx` (`GridForm`), and a new `ui/ColorWheel.tsx`.
- **Server:** no code change. The library's `grid` column is JSON, and stored events aren't re-validated on read, which is why the fields are optional with render-time defaults. No migration.

## Non-goals

- Dashed lines, or per-player grid preferences. Everyone sees the GM's choice.
- Hex or other grid shapes.
