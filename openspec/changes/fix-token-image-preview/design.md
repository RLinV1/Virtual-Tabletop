## Context

The board (`boardView.ts` `createTokenView`, `fitTokenImage`) draws a token as a disc of `token.color` with the image on top, scaled so its short edge equals the diameter, centred, and masked to the circle. Hidden tokens are drawn at alpha 0.45. The Add token dialog shows the chosen image with a plain `<img class="round">` inside `.token-image-field .row`, whose `> * { flex: 1 }` rule stretches it.

## Decisions

- **`TokenPreview({ url, color, hidden, size })`** renders a `<span class="token-preview">` with fixed `width`/`height`, `flex: none`, `border-radius: 50%`, `overflow: hidden`, and `background: color`. Inside is an `<img>` at `width: 100%; height: 100%; object-fit: cover; object-position: center`. For a circle, CSS `cover` crops exactly as `fitTokenImage` does: short edge = diameter, centred.
- **Alpha.** `hidden` sets `opacity: 0.45`, the board's hidden alpha.
- **Colour.** Add token has no colour field; the command defaults to `#c0392b`. The dialog passes that same default, exported from `packages/shared` as `DEFAULT_TOKEN_COLOR`, so the preview disc matches what the board will draw. Exporting a constant is not a schema change.
- **Layout fix.** Scope the stretch rule to what it was meant for, the upload and library buttons: `.token-image-field .row > button, .token-image-field .row > label { flex: 1 }`. Don't just override the image, because the name needs `flex: 1; min-width: 0` with ellipsis.
- **A failed image load** shows the colour disc alone, as the board does.

## Verification

- Browser: choose a wide (16:9) map-like image and a tall portrait. The preview is a circle, centre-cropped, and matches a screenshot of the placed token's crop. "Hidden from players" dims it. A long file name truncates, and Remove stays on the row.
- `npm run lint && npm run typecheck && npm test`.
