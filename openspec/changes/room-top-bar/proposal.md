## Why

The room page mixed play and setup in one long sidebar column. Who was at the table was hidden behind a button, and the page didn't look like the layout the team prefers (the reference mockup): players across the top, tab buttons on the top right, and dice results as cards.

## What Changes

- **A top bar spans the room page:**
  - Left: Home (GM only) and the room name.
  - Centre: the participants as coloured initials. At most 5 are shown, then a "+N" circle. Clicking opens the participants list, including the GM's Remove action.
  - Right: Play / Tokens / Dice / Manage (Manage is GM only), then Activity log (GM only) and Guide. Each button has its own icon.
- **The sidebar shows only the selected tab** on every screen size. The tab is remembered per browser. Pressing the open tab hides the sidebar, and pressing any tab while it's hidden shows it. On phones the tabs stay above the panel.
- **The sidebar hides and shows instantly.** The 180 ms column slide made the board wait and then jump.
- **Dice results are cards:** the total in a box with its dice breakdown, then the expression and who rolled it.
- **Share and Reset link** are a matching pair of buttons, spaced apart and aligned right.
- **The guided tour** covers every tab, switching to the tab each step needs.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `room-ui-refinements`: adds the top bar, the tabbed sidebar, the instant collapse and a tour that follows the tabs.

## Impact

- `apps/web`: `RoomPage.tsx`, `RoomPanel.tsx`, `ParticipantsButton.tsx`, `DicePanel.tsx`, `ShareButton.tsx`, `ActivityLog.tsx`, `Board.tsx`, `GuideTour.tsx`/`guide.ts`, `styles.css`.
- Web only; no contract change.
