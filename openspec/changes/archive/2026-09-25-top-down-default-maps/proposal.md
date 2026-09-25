# Proposal

## Why

The three maps that ship with the app, used both on the home page and as the library's built-in maps, are drawn at an angle. Walls, towers and bridges show their sides, so a square grid cannot fit them: squares further away should be smaller. The hero map also has a large dragon, and the jungle map has giant serpent statues.

This contradicts what the page claims:
- The grid demo says "Got a map with a grid already drawn on it? Match ours to it", but its map has no grid anything could match.
- The overlay does not even divide the image evenly: 1672 × 941 at 70 px is 23.9 × 13.4 squares.
- Tokens are placed by eye at percentages, not on squares.

## What Changes

- **New top-down maps replace the three built-in maps in place.** The files keep their paths in `public/img/` and their names (The Broken Span, Hollowfrost Keep, Temple of the Green Sun). They are AI-generated, viewed from directly overhead, with no creatures and no creature-shaped statues. They are large enough to use as real maps, at about 70 px per square. The sources are in `assets/default-maps/`.
- **Each built-in map carries its own grid**, measured from the art so the grid lines roughly follow the drawn paving and walls:

  | Map | Size | Square | Offset |
  |---|---|---|---|
  | The Broken Span | 3344 × 1882 | 69.4 px | 10, 31 |
  | Hollowfrost Keep | 3269 × 1882 | 70 px | 47, 46 |
  | Temple of the Green Sun | 2740 × 1604 | 70 px | 21, 36 |

  Before this change, all three shared 1672 × 941 and the default grid.
- **The home page shows crops, not whole maps**, in the hero, grid demo and visibility sections. Each crop is 16:9, 20 squares wide, and starts on a grid line. At about 33 px per square on screen, a token is roughly one square wide.
- **Every map example on the home page shows a faint grid.**
- **Tokens sit in the middle of a square.** Positions are given as square coordinates, not percentages. The hidden token sits in the Temple's shadowed side chamber.
- **The grid demo works the way its copy says.** The faint grid is the map's own squares. The slider starts slightly off and moves the app's rust-coloured grid until the two line up.
- **The library shelf shows each whole map with a lighter grid.** Its size label comes from the built-in catalogue, not a hard-coded "1672 × 941".
- **Alt text is rewritten** to describe the new art.
- **BREAKING (test data only):** a room that already placed one of these maps stored the old 1672 × 941 size. It will show the new art spilling past its grid until the GM places the map again. Existing rooms are test data (see `device-identity-bridge`), and this was accepted.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `builtin-library-assets`: built-in maps are top-down, contain no creatures, and each carries its own measured grid and size, applied when placed in a room.
- `gm-home`: the home page's maps are shown as crops starting on a grid line, with a faint grid on every example, tokens centred in squares, and a grid demo that lines up with the map's own squares.

## Impact

- **Assets:**
  - `apps/web/public/img/{hero-map,map-ice,map-jungle}.webp`, replaced from `assets/default-maps/`;
  - new home crops and shelf thumbnails in `apps/web/public/img/home/`.
- **apps/web:**
  - `net/builtinAssets.ts`: per-map size and grid;
  - `pages/HomePage.tsx`: image sources, crops, the faint grid, token square coordinates, grid-demo behaviour, alt text, and a shelf driven by the catalogue;
  - `styles.css`;
  - `test/builtinAssets.test.ts`: maps no longer use the default grid.
- **Tooling:** a dev dependency for image processing (`sharp`), and a script that cuts the home crops and thumbnails from the full maps, with the crop regions written into it.
- **No server, schema, event or protocol changes.** `GridSpec` already supports fractional cell sizes and offsets.
- **Not in scope:**
  - token portraits
  - the board's handling of an image whose real size differs from its stored size
  - regenerating The Broken Span, whose drawn tiles are uneven enough that its grid drifts by about a third of a square in places
