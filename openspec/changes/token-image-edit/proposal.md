## Why

A token's art can only be chosen when it is created. To change it, the GM has to delete the token and lose its stats, conditions, owners and turn order. The GM asked for an image upload in the token editor.

## What Changes

- **New GM-only command:** `token.setImage { tokenId, imageUrl | null, assetId }`.
- **New event:** `TokenImageSet`, which carries the previous image (ADR 0008).
- For players, the event is redacted when the token is hidden.
- The activity log reads "GM changed Goblin's image" or "GM removed Goblin's image".
- The GM's token editor gets an Image field with the current art, **Upload new**, **From library** and **Remove**. The change is saved with the editor's other changes.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `token-image-preview`: the GM can change or remove a token's image after it is created.

## Impact

- `packages/shared`: commands, events, decide, reducer, visibility, activity log, and tests.
- `apps/web`: `TokenRoster.tsx` (the token editor).
- `docs/adr/0008-token-image-changes.md`.
- No server code change.
