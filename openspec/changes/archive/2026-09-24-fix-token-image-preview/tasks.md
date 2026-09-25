## 1. Preview

- [x] 1.1 Export `DEFAULT_TOKEN_COLOR` from `packages/shared` and use it in the `token.create` default.
- [x] 1.2 Add `ui/TokenPreview.tsx` (fixed-size circle, colour disc, `object-fit: cover`, hidden alpha) and use it in Add token. The token editor shows no image, so it needed nothing.
- [x] 1.3 Scope the `.token-image-field .row > *` flex rule to the buttons; the name takes the rest of the row, with an ellipsis.
- [x] 1.4 Remove doesn't flex: it sits at the row's right edge, aligned with the form's full-width Add token button (both right edges at 847 px in the check).

## 2. Verification

- [x] 2.1 Browser: wide and tall images preview as centred circles matching the placed token; hidden dims it; a long name truncates.
- [x] 2.2 `npx openspec validate fix-token-image-preview`, then `npm run lint && npm run typecheck && npm test`.
