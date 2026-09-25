# Tasks

## 1. Maps and catalogue

- [x] 1.1 Copy `assets/default-maps/The-Broken-Span.webp`, `Hollowfrost-Keep.webp` and `Temple-of-the-Green-Sun.webp` over `apps/web/public/img/hero-map.webp`, `map-ice.webp` and `map-jungle.webp`. Verify with `sips -g pixelWidth -g pixelHeight -g format` that the files are WebP at 3344×1882, 3269×1882 and 2740×1604.
- [x] 1.2 In `net/builtinAssets.ts`, replace the shared `MAP_SIZE`/`DEFAULT_GRID` with a per-map size and grid: Span 69.4 px offset (10, 31); Hollowfrost 70 px (47, 46); Temple 70 px (21, 36). Keep `unitsPerCell`/`unitLabel` from `DEFAULT_GRID`. Update `test/builtinAssets.test.ts`: replace "gives maps the default grid" with assertions of each map's size and grid, and check every map is at least 2600 px wide. Verify with `npm test --workspace=@vtt/web`.
- [x] 1.3 Place Hollowfrost Keep in a room from "From library". Verify the board shows 3269×1882, and that the grid lines follow the paving at the top-left and bottom-right corners.

## 2. Home crops and thumbnails

- [x] 2.1 Add `sharp` as a dev dependency of `@vtt/web`, and `apps/web/scripts/home-maps.mjs` with the crop origins from `design.md`. It writes a 1400×788 crop and a 640-wide thumbnail per map to `public/img/home/`, plus red-grid check images to `scripts/out/`. Add `scripts/out/` to `.gitignore` and a `maps:home` npm script. Verify the six outputs exist at those sizes, and that the check images show the grid on the paving from the crops' top-left.
- [x] 2.2 Inspect each check image for creatures, including creature-shaped statues, and for wall or building sides. Verify none is present in any crop or thumbnail.

## 3. Home page

- [x] 3.1 Point the hero, grid demo and visibility images (and their `--map` glow) at the `img/home/` crops with `width={1400} height={788}`, and rewrite the three alt texts for the new art. Verify the images load and each alt text describes what is shown.
- [x] 3.2 Add a faint grid overlay, sized as a fraction of the frame (`5%` across, `70/788` down, from 0,0), to the hero and both visibility views. Verify at 1366×768 and 390×844, in light and dark, that the lines follow the paving on each crop.
- [x] 3.3 Replace `TokenChip`'s `left`/`top` style with `at: { col, row }`, positioned at the centre of that square. Choose open-floor squares from the check images for Brenna, Toma and Ash (hero) and Brenna, Toma and the hidden token (visibility, hidden token in the side chamber). Verify each token sits centred in a square on the faint grid, and no token is on a wall.
- [x] 3.4 Rework the grid demo: the slider is in map pixels (40 to 110, starting at 60) and the rust overlay is drawn at `value/1400` of the frame, over the crop's faint grid. The caption reads "Lined up with the map's squares." at 70, and "Drag until the grids line up." otherwise. Verify that at 70 the two grids coincide at 1366 and 390 wide, and that the readout shows the value.
- [x] 3.5 Drive the library shelf from `BUILTIN_ASSETS`: use the thumbnails, a lighter grid overlay from each map's own grid (percentage cell size and offset), and a label with the real size and cell size. Verify the three labels read 3344 × 1882 · 69.4px, 3269 × 1882 · 70px and 2740 × 1604 · 70px grid, and that the grid follows each thumbnail's paving.

## 4. Verify

- [x] 4.1 Re-run the home page's copy checks: no implementation terms, no em-dashes, and each map's alt text is new. Verify the contrast of the faint grid does not reduce any text or control contrast, since the grid is decoration, not a boundary.
- [x] 4.2 Confirm the grid overlay and slider add no animation or per-scroll work, and that the page's only long frames are the image decodes. Verify in the Performance panel while scrolling the page once.
- [x] 4.3 `npm run lint && npm run typecheck && npm test` clean.
