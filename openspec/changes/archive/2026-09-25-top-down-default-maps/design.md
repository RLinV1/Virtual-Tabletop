# Design

## Context

See proposal.md, Why. Current state that shapes the approach:

- **Built-in catalogue.** `net/builtinAssets.ts` declares all maps as `MAP_SIZE = 1672×941` with `DEFAULT_GRID`, and `test/builtinAssets.test.ts` asserts that maps use `DEFAULT_GRID`. Rooms store a built-in's URL, width and height when it is placed.
- **The board.** `boardView.ts` sizes the board, grid and fit-to-screen from the *stored* width and height, but draws the texture at its *real* size. That is why replacing the files in place breaks rooms that already placed a built-in (accepted; see proposal).
- **`GridSpec`** already allows a fractional `cellSize` and `offsetX`/`offsetY` (0 ≤ offset < cellSize), so per-map grids need no schema change.
- **Home page images.**
  - `HomePage.tsx` shows `MAPS.hero`, `MAPS.grid` and `MAPS.visibility` at `width={1672} height={941}`.
  - It sets `--map: url(...)` on each figure for a blurred glow.
  - It places `TokenChip`s by hand-picked `left`/`top` percentages.
  - The grid demo's `.grid-overlay` uses `background-size: ${cell}px`, which is screen pixels, starting at 70 with a range of 36 to 140.
  - `SHELF` hard-codes "1672 × 941 · 70px grid".
- **The performance spec** (`client-render-performance`) allows long frames only for one-time image decodes. The home page also blurs each map image into a background glow.
- **Source files.** `assets/default-maps/*.webp` are real WebP at 3344×1882, 3269×1882 and 2740×1604.
- **Tooling.** There is no WebP encoder on the build machine. `sips` can resize but cannot write WebP.

## Goals / Non-Goals

**Goals:**
- Built-in maps whose grid follows the art.
- A home page where every map visibly has squares, and tokens visibly sit in them.
- A grid demo that can actually be lined up.

**Non-Goals:**
- Fixing the board to size from the real image, which would make old rooms self-heal.
- Automatic grid detection at runtime.
- New token art.

## Decisions

### Grids are measured once and written down, not detected at runtime

Each map's square size and offset were measured from the art: the strongest repeating period of the paving lines along each axis, then the offset that spreads any remaining drift evenly, then a visual check with the grid drawn over far corners.

| Map | Square | Offset (x, y) | Worst local drift |
|---|---|---|---|
| The Broken Span | 69.4 | 10, 31 | ~25 px (its tiles are uneven) |
| Hollowfrost Keep | 70 | 47, 46 | ~18 px across, ~6 px down |
| Temple of the Green Sun | 70 | 21, 36 | ~10 px across, ~3 px down |

`builtinAssets.ts` changes from `map(slug, name, url)` with the shared `MAP_SIZE`/`DEFAULT_GRID` to `map(slug, name, url, { width, height }, { cellSize, offsetX, offsetY })`, which fills in `unitsPerCell: 5, unitLabel: "ft"` from `DEFAULT_GRID`. A later regenerated map needs its own measurement; the script's check (below) is how you tell.

*Alternative considered:* trimming each image so its grid starts at 0,0 and every map uses `DEFAULT_GRID`. That was rejected because it would cut off art and still not fix the Span's uneven tiles. Offsets are exact, and the grid already supports them.

### Home crops are pre-cut files, not a CSS crop of the full map

A new script, `apps/web/scripts/home-maps.mjs`, uses `sharp` as a new dev dependency. For each map it reads the full image from `public/img/` and writes two files to `public/img/home/`:
- **a crop:** 20 squares wide starting at a grid intersection, taken at 16:9, then resized to **1400 × 788**. Every crop then has exactly 70 px squares, starting at 0,0, 20 across and 11.25 down, whatever the source cell size;
- **a thumbnail:** the whole map at 640 px wide, for the shelf.

Crop origins, chosen for content and snapped to grid intersections:

| Map (use) | Origin (x, y) | Region | Why |
|---|---|---|---|
| Broken Span (hero) | 148.8, 378.0 (col 2, row 5) | 1388 × 780.75 | the west courtyard, brazier, round tower and a bridge |
| Hollowfrost (grid demo) | 1657, 536 (col 23, row 7) | 1400 × 787.5 | the paved east courtyard with the crystal dais, whose paving makes the grid obvious |
| Temple (visibility) | 1281, 386 (col 18, row 5) | 1400 × 787.5 | the sun mosaic, the east pools and the shadowed side chamber |

The script also writes a check image per output, with the grid drawn in red, to `scripts/out/` (git-ignored), for a visual check in review.

**Why pre-cut:**
- The home page decodes and blurs three images.
- The perf spec only tolerates one-time decodes.
- A 3344 px image decoded to show a 666 px region, then blurred as a glow, is the kind of work that spec rules out.
- Pre-cut files are about a quarter of the pixels.

*Alternative considered:* showing the full map scaled up inside a frame (`object-view-box`, or a translated `<img>`). It needs no new tooling, but decodes and blurs the full image and needs per-map maths in CSS.

### The faint grid is sized in squares, not pixels

On a crop, squares are exactly 1/20 of the width, so the overlay is `background-size: 5% calc(100% * 70 / 788)` from 0,0. It stays aligned at any display width, with no JavaScript measurement.

The shelf thumbnail overlay uses the map's own grid as percentages of the whole image:
- `cellSize / width` across and `cellSize / height` down;
- the offset as `offsetX / width` and `offsetY / height`.

`HomePage` reads these from `BUILTIN_ASSETS`, so the shelf and the catalogue cannot disagree.

Line colour and opacity:
- the grid uses a light line with a dark hairline beside it, so it reads on both snow and jungle;
- faint means about 0.35 on the crops and about 0.2 on the thumbnails.

### Tokens are placed by square

`TokenChip` gains `at: { col, row }` in place of `style.left/top`:
- `left = (col + 0.5) / 20`
- `top = (row + 0.5) * 70 / 788`

The squares are chosen during implementation from the crop's check image, on open floor:

| Crop | Tokens |
|---|---|
| hero | Brenna, Toma, Ash |
| visibility | Brenna, Toma, and the hidden token inside the side chamber |

### Grid demo: a slider in map pixels

The slider's value becomes the app grid's cell size **in map pixels** on the 1400-wide crop:
- it ranges from 40 to 110 and starts at 60;
- it is drawn at `value / 1400` of the frame's width, so the rust grid lines up with the faint grid exactly at 70, at any screen size;
- the readout stays "**{value}** px squares · 1 square = 5 ft";
- the caption under the demo says "Lined up with the map's squares." when the value is 70, and "Drag until the grids line up." otherwise.

This makes the demo's copy ("Match ours to it") true without new wording.

### Alt text

Each map's alt text is rewritten from the new art. The shelf thumbnails use the same alt text as their crops, describing the whole map.

## Risks / Trade-offs

- [Rooms that placed a built-in map before this change] → Their art overflows the grid until the map is placed again. This was accepted as test data, and is noted in the proposal and release notes.
- [The Broken Span's drawn tiles are uneven] → Its best single grid still drifts by up to about a third of a square. That meets "roughly", and regenerating it is a later change if wanted.
- [`sharp` is a native dev dependency] → It is only used by a script run by hand, not at build or run time. Its outputs are committed, so CI and other machines never need it.
- [The crop origins are fractional for the Span] → `sharp`'s extract needs whole pixels, so the script crops a slightly larger whole-pixel region and resizes. That moves the origin by less than 1 px, which is invisible at 70 px squares.
- [The thumbnail grid at 640 px wide is dense (about 14 px squares on a 47-square map)] → A lighter opacity keeps it a texture that still shows the map is gridded, which is what was asked.

## Migration Plan

1. Copy the three sources into `public/img/` over the old files, then run the script to create `public/img/home/`. Commit both.
2. Rollback: revert the commit. Rooms placed on the new maps would then mismatch in the other direction, which is the same accepted cost.
