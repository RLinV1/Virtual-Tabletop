## Why

On a phone held sideways (KAN-55), the room page stacks the board above the control panel, exactly as it does in portrait. A landscape phone is only about 360–430 px tall, so the board gets a thin strip (62% of the height) and the panel sits below the fold: the player has to scroll the whole page to reach their token, dice or roster, and then the board is off screen. Landscape has spare width, not spare height, so the panel belongs beside the board.

## What Changes

- **Compact landscape layout.** When the room page is in its compact layout (viewport 720 px wide or less) and the viewport is in landscape orientation, the board and the panel sit side by side under the top bar instead of stacked. The board takes the remaining width; the panel takes a fixed, narrower column (`clamp(15rem, 42vw, 20rem)`).
- **Full-height board.** The room fills the viewport (`100dvh`) again in that layout, so the board uses the full height below the top bar. The page no longer scrolls; the panel scrolls inside its own column, as it does on desktop.
- **Panel content unchanged.** The panel keeps its compact content (its own tab bar, 44 px touch targets). Its tabs stack icon over label so all four fit the narrower column.
- **Portrait and desktop unchanged.** Portrait phones keep the stacked layout (board 46dvh, panel below). Viewports wider than 720 px already show the side panel and are untouched.

## Capabilities

### New Capabilities
- `room-landscape-layout`: where the control panel sits on a narrow landscape viewport.

### Modified Capabilities
None.

## Impact

- **Web only:** `apps/web/src/styles.css`, inside the existing `@media (max-width: 720px)` block, replacing its `orientation: landscape` rule.
- **No contract change:** `packages/shared`, the server, commands, events and visibility filters are untouched. No ADR needed.
- **No JS change:** `useCompactLayout` in `RoomPage.tsx` still keys on width only, so the compact tab bar and hidden collapse handle stay as they are.
- **Board refit:** the board already refits on resize and rotation (KAN-54), so rotating between portrait and landscape re-fits the map to its new column.

## Non-goals

- A collapse handle for the panel in compact landscape. The compact layout has none today.
- Changing the 720 px breakpoint or the desktop panel width.
