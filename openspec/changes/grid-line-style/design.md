## Context

`GridSpec` (`packages/shared/src/geometry.ts`) is `{ cellSize, offsetX, offsetY, unitsPerCell, unitLabel }`. It is set by `grid.set` → `GridSet { grid, previous }`, and it's copied into a room from a library map through `scene.setMap { grid }` → `MapSet { gridChange: { grid, previous } }` (ADR 0004). `BoardView.syncGrid` strokes all lines once, with `{ width: 1, color: 0x000000, alpha: 0.35 }`, and caches on `JSON.stringify([grid, size, mapMissing])`. Events come back from Postgres as stored JSON, without zod re-parsing.

## Decisions

### Schema: optional fields, defaults at the edge
```ts
export const GRID_LINE_WIDTHS = [1, 2, 3, 4, 6] as const;
lineColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
lineWidth: z.number().min(0.5).max(8).optional(),
lineOpacity: z.number().min(0.05).max(1).optional(),
export function gridLineStyle(grid: GridSpec) → { color: string; width: number; opacity: number } // "#000000", 1, 0.35
```
Why optional rather than `.default()`: stored events and library rows written before this change don't have the fields and aren't re-parsed on read. A `.default()` would only apply on paths that parse, so two code paths would disagree. With `optional()` plus a single `gridLineStyle()` resolver, every reader agrees. The schema accepts any width from 0.5 to 8, while the UI offers only the presets, which leaves room for more presets without another schema change. Colour validation reuses the token colour's hex rule.

### Board
`syncGrid` uses `gridLineStyle(grid)`: `stroke({ width, color: Number("0x" + hex), alpha: opacity })`. The cache key already includes the whole grid, so a style change redraws. The redraw goes through `invalidate()` (on-demand rendering, `fix-sidebar-tour-and-render-performance`).

### Colour wheel (`ui/ColorWheel.tsx`)
- A `<canvas>` disc drawn once per brightness: hue = angle, saturation = distance from the centre. Pointer down or drag picks a colour. A brightness slider (`<input type="range">`) sits below it.
- The value is `#rrggbb`. A hex text field edits it directly, and three swatches set it in one click.
- Keyboard: the disc is focusable, with `role="slider"`, `aria-valuetext` set to the hex value, ←/→ changing hue by 5°, and ↑/↓ changing saturation by 5%. The hex field is the precise route.
- Pure helpers (`hsvToHex`, `hexToHsv`, `pointToHueSat`) live in `ui/color.ts` and are unit-tested.

### Advanced disclosure and visual treatment
The line controls sit behind a closed-by-default "Advanced" row, a button with `aria-expanded`/`aria-controls`, a Phosphor `CaretDown` that rotates, and the live summary. The body fades in (opacity and 4 px translate, `cubic-bezier(0.16, 1, 0.3, 1)`), which is disabled under reduced motion. The treatment follows the redesign, taste and high-end frontend skills, within the app's existing tokens:
- The range inputs are themed, with no browser blue: a thin neutral track and a ringed accent thumb. Brightness runs from black to the hue, and opacity fades the colour in over a checkerboard.
- The wheel is always drawn at full brightness, so it never shows as a black disc; picking on it lifts brightness off black.
- The preview comes first and is full-width: an SVG of the current map in board coordinates, with the lines at true board width.
- It keeps the room's 4 px radius scale, uses one accent, and uses no eyebrows or em dashes.

### Thickness slider
`<input type="range" min=0 max=4 step=1>` over the `GRID_LINE_WIDTHS` indices, with a `<datalist>` for tick marks. `aria-valuetext` gives the preset name ("Medium, 3 px").

### Opacity slider
`<input type="range" min=5 max=100 step=5>`, showing its value as a percentage. `lineOpacity` is stored as a fraction (`value / 100`). The minimum is 5% rather than 0, so an applied grid can't become invisible by accident. Hiding the grid entirely is a separate feature, not a style.

### Preview
A 160×96 CSS box: a crop of the current map as its background (or the empty-map fill when there's no map), with an inline SVG `<pattern>` drawing lines at the chosen colour, width and opacity, scaled from board px by the board's current fit scale. It's approximate but honest about colour and relative weight.

### Commands, events, undo, visibility
No change. `grid.set` validates the new fields with the rest of `GridSpec` (zod, trust boundary). `GridSet.previous` holds the full old spec, so undo restores the style. The grid isn't hidden information, so the visibility filters need nothing. The activity log line "updated the grid" stays.

## Risks

- **An old client connected during a deploy** would drop the unknown fields when it re-sends a grid. That's a short-lived mismatch, and the next GM apply restores the style.
- **Thick, dark lines can hide map detail.** The presets stop at 6 px, and the preview shows the effect before applying.

## Verification

- Unit (`packages/shared/test`): `GridSpec` accepts and rejects colour, width and opacity; `gridLineStyle` defaults; `decide` for `grid.set` carries the style in `grid` and the old style in `previous`; `reduce` applies it; replaying an old `GridSet` without style yields the defaults.
- Unit (`apps/web/test/color.test.ts`): hex↔HSV round trip; wheel point → hue/saturation.
- Integration (`apps/server/test`): the GM sets a red 4 px grid, and a second client's state has it; a player's `grid.set` is still rejected.
- Browser: pick a colour on the wheel, a Thick preset and 70% opacity; the preview updates; Apply; the GM's and a player's boards both draw the new grid; the style survives a reload; "Save grid to library" and then placing the map carries the style.
- `npm run lint && npm run typecheck && npm test`.
