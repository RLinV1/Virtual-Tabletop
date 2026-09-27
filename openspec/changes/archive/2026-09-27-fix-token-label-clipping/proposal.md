# Proposal

## Why

The board label under a token can get cut off partway through a letter, even when no other token is nearby. In Firefox on macOS, a 26-letter name shows only up to "abcdefghijklmnopqrstuv". The rest is lost. Pixi sizes a label's texture by measuring the text on an `OffscreenCanvas`, then draws the text on a DOM `<canvas>`. With our `system-ui` font, Firefox resolves the font differently in the two canvases. The offscreen measurement comes out narrower, so the texture is too narrow and the end of the name is cropped. We confirmed this in the Firefox console: for the same font string, the offscreen width was smaller than the DOM width. With `"Helvetica Neue", Arial, sans-serif`, the two widths differed by less than 1px.

## What Changes

- Board text uses a named font list, `"Helvetica Neue", Arial, sans-serif`, instead of the `system-ui` keyword, so both canvases measure and draw the same font.
- The font is defined once as a module-level constant in `apps/web/src/board/boardView.ts`. All three board text styles use it (the token name label, the ruler/AoE distance label, and the condition-marker abbreviations), so a future board `Text` does not go back to `system-ui`.
- Out of scope: wrapping, ellipsizing or shrinking long names. After this fix a 60-character name is drawn in full on one line. How long names should look on the board is a separate UX decision.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `token-names`: gains a requirement that the board draws a token's whole name, with no characters cut off, whatever the name's length (up to the 60-character limit) and whether or not other tokens are nearby.

## Impact

- **Code:** `apps/web/src/board/boardView.ts`, where the token label, `measureLabel` and condition-marker text styles are set, plus the new font constant. No change to `packages/shared`, the server, commands, events, visibility filters or persisted data. No ADR needed.
- **Testing:** jsdom does not render fonts, so an automated test cannot catch this. Verification is manual: place tokens named with 26 and 60 characters in Firefox, Safari and Chrome on macOS, and confirm each name is drawn in full at several zoom levels.
- **Risk:** we only showed `system-ui` misbehaving. On Linux, where neither named font is usually installed, `sans-serif` picks the font. If clipping shows up there, the fallback is to have Pixi measure text on a DOM canvas instead of an `OffscreenCanvas`.
