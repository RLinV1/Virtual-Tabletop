## Context

See proposal.md - Why. Today `averageColor` shrinks the map to 8x8 and averages every pixel. `makeFogCanvas` then makes banks at 45% of that colour and mist 55% of the way to white, so contrast is high and the hue is washed out. `boardView.drawFog` strokes each GM region with a fixed `FOG_EDGE` (0x9fb3c8) line. The Show menu rows are `label.board-filters-row` with `display: flex`, but the screenshot shows them stacked, so another rule is overriding it.

## Goals / Non-Goals

**Goals:** fog looks like part of this map; GM outline is quiet; Show menu is compact.

**Non-Goals:** per-area tinting, new fog tools, changing the drift animation, or anything on the wire.

## Decisions

1. **One palette for the whole map, not a per-position tint.** Sample the map small and take a trimmed mean (drop the darkest and lightest tenth of samples), then keep its hue and lift saturation a little. Rejected: tinting fog by the blurred map under it. Players would see coarse colour and shape of hidden areas, which weakens fog as a cover. A single palette leaks nothing the average did not.
2. **Lower cloud contrast.** Banks at about 70% of the base colour and mist about 30% toward white. Exact values are tuned by eye against the screenshots in the request and fixed in constants.
3. **Edge in the fog's tone.** Derive the outline colour from the same palette (the mist colour at reduced alpha) and keep it 1-2 screen pixels. Drop the bright fixed colour. If the frame look comes from the fill and the stroke overlapping, draw the stroke inside the fill's alpha range so it does not add a second edge.
4. **Fog as a feathered mist layer, not a blurred fill.** Blurring the textured fill looked bad (halo, muddy rim). Instead draw the regions as a white shape into a low-resolution mask texture (it changes only when fog changes, not on drift), and show the cloud texture only where that mask is opaque. Sampling the small mask with linear filtering feathers the border for free, and the edge can be perturbed with the cloud noise so it billows instead of tracing the polygon. Only players (and a GM viewing as a player) get the mist; the GM keeps the flat see-through tint from `main`. Mist should be mostly pale and a little see-through at its thin edge, with darker banks kept subtle. Rejected: `BlurFilter` on the fill (tried, looked bad), a `pixi-filters` noise shader or custom GLSL (extra dependency or much more work).
5. **Menu row.** Find the rule that stacks the label (global `label` style or specificity) and fix it at `.board-filters-row`, not by changing global label styles. Menu `min-width` becomes `max-content`.

## Risks / Trade-offs

- [Trimmed mean still looks off on very high-contrast maps] -> constants are in one place; keep the fallback blue-grey when the image cannot be read.
- [Lower contrast makes fog less visible on pale maps] -> keep the mist/bank difference large enough that the cloud shape still shows; check on the stone map and a dark map.
- [Feathering could let a player see a sliver under the fog] -> the feather only extends outward, about one cell past the region (`FOG_FEATHER_CELLS`); the region itself is filled solid, so nothing inside it shows. Checked in the player view.
- [Mask texture size on big maps] -> render it at a fraction of map size, capped, and rebuild only when fog changes.
- [Fog texture is rebuilt when the map changes] -> unchanged; it is already rebuilt in `setFogBase`.

## Migration Plan

None. Client-only visuals; revert the commit to roll back.
