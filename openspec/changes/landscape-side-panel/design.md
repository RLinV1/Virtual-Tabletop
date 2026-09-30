## Context

`.room` is a CSS grid. On desktop it has two columns (board, `--panel-width` panel) and two rows (top bar, content), and is exactly `100dvh` tall with the panel body scrolling inside. Inside `@media (max-width: 720px)` it becomes one column and three rows (top bar, board at `46dvh`, panel), the page grows to `min-height: 100dvh` and scrolls, and `.panel-body` drops its own scroll. A nested `@media (orientation: landscape)` rule only changes the board row to `62dvh`.

## Decisions

**Override inside the compact block, not a new breakpoint.** The landscape rule already lives nested in the `max-width: 720px` block. Replacing it keeps every compact tweak (touch targets, one-line panel header, two-row top bar) and changes only placement: two columns, two rows, `grid-row: 2` for both board and panel, fixed `100dvh` height, and `.panel-body` scrolling again with `height: 100%` and `overflow-y: auto`.

**Panel width `clamp(15rem, 42vw, 20rem)`.** Smaller phones in landscape are 568–720 px wide. 15rem (240 px) is the narrowest width at which the compact tab bar and the roster fit without truncating labels; 42vw keeps at least 58% of the width for the board on a 568 px screen; 20rem caps it where the board would stop gaining. The desktop `--panel-width` (min 17rem) would leave too little board at 568 px.

**Stack tab icon over label.** At 280 px the panel's four tabs are ~60 px each, too narrow for icon and label side by side, so some tabs wrapped and others didn't. In this layout every tab stacks its icon over its label, so the row is uniform.

**CSS only.** `useCompactLayout` stays width-based. Rendering the panel's own tab bar in landscape is right: the top bar is already two rows on a compact screen and has no room for the desktop tab buttons.

## Risks

- **Top bar height.** The compact top bar wraps to two rows, which costs ~85 px of a 375 px screen. Accepted for now; a single-row landscape top bar can be a follow-up.
- **Board area.** At 667×375 the board column is 387×291 where the old strip was 667×232, so its raw area is smaller. But height is the binding dimension for a fitted map on a landscape phone, so a square map now fits at 291 px instead of 232 px, and nothing is hidden below the fold.
- **Orientation vs aspect.** `orientation: landscape` is width ≥ height, so a narrow desktop window that is wider than tall also gets this layout. That's the desired result there too.
