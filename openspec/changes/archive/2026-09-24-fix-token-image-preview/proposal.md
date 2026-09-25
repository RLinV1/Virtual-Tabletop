## Why

In the Add token dialog, the chosen image's preview is a squashed ellipse, not the round token that appears on the board. `.token-image-chosen img` sets 2rem × 2rem, but the broader rule `.token-image-field .row > * { flex: 1 }` also matches the `<img>`, so it grows to fill a third of the row. With `border-radius: 50%` on a wide box, the circle becomes an ellipse. The GM can't judge how the portrait will be cropped, because the board draws it differently (`boardView.ts`: a circle, with the image's short edge scaled to the diameter and centred).

## What Changes

- **Match the board.** The preview is a fixed-size circle (2.5rem) that never flexes. The image fills it the way the board does: the short edge scaled to the diameter and centred (`object-fit: cover`, centred), clipped to the circle.
- **Show it on its disc.** The token's colour disc sits behind the image, as on the board, so a transparent PNG previews the same way.
- **Show "Hidden".** When "Hidden from players" is ticked, the preview dims to the board's hidden look (45% opacity).
- **Keep the name readable.** The file or library name takes the remaining width and truncates with an ellipsis instead of pushing Remove off the row.
- **One component.** A shared `TokenPreview` component, so the Add token dialog and the token editor (Edit) can't drift from each other.

## Capabilities

### New Capabilities
- `token-image-preview`: how a chosen token image is previewed before it is placed.

### Modified Capabilities
None.

## Impact

Web only: `panels/AddToken.tsx`, a new `ui/TokenPreview.tsx`, `styles.css`, and the token editor if it shows the image. No schema, server or board change.
