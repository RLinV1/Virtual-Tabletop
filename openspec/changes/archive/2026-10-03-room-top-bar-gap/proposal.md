## Why

In the room's top bar, the right-hand controls (Play, Tokens, Dice, Manage, Activity log, Guide, Share) ran into the participant avatars on laptop-width windows. The bar is a three-column grid with equal side columns so the people sit centred, and the right column could shrink below its own content. Measured with the GM's controls: the first tab overlapped the avatars by 5 px at 1280 px wide and by about 195 px at 900 px; below that the Home button and title also ran under them.

## What Changes

- The controls column never shrinks below its content (`minmax(max-content, 1fr)`): the title side gives way instead (it already ellipsizes), and the people shift left with the normal 12 px gap.
- The two-row top bar (title and people on one row, controls on the next) now starts at 960 px instead of 720 px, the width below which the GM's controls no longer fit on one line.
- CSS only (`apps/web/src/styles.css`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Layout fix, no behaviour change (`skip_specs: true`).

## Impact

- `apps/web/src/styles.css`: `.room-topbar` grid columns and a new `@media (max-width: 960px)` block for the top bar.
