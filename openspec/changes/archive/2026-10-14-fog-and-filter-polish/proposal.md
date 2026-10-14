## Why

The fog on the board looks pasted on. Its colour is the map's average, which on a map mixing stone, moss and rock comes out as flat grey, and its dark banks are much darker than the map around them. The GM's fog has a bright blue-grey frame that reads as a hard border instead of mist. The GM's "Show" menu stacks each checkbox above its label with wide empty space.

## What Changes

- Fog colours come from the map's own palette with lower contrast: banks are only a little darker than the map and the mist only a little lighter, so fog reads as haze over this map.
- The GM's fog outline is a thin line in the fog's own tone instead of the fixed bright blue-grey, and the fill meets the outline without a visible frame.
- The "Show" menu lays out each row as checkbox then label on one line, left aligned, and the menu is only as wide as its longest label.
- No command, event, state or visibility change. Colours are computed on each client from the map image the client already has.

## Capabilities

### Modified Capabilities
- `fog-of-war`: fog colour follows the map and the GM outline is subtle.
- `board-view-filters`: the Show menu layout.

## Impact

- `apps/web`: `board/fogTexture.ts`, `board/boardView.ts` (fog edge and base colour), `board/BoardFilters.tsx` and its rules in `styles.css`.
- Tests: `apps/web/test` for the colour derivation; Playwright check of the board.
- No change to `packages/shared`, `apps/server`, or any ADR.
