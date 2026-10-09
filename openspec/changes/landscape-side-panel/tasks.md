## 1. Layout

- [x] 1.1 In `apps/web/src/styles.css`, replace the compact block's `orientation: landscape` rule with a two-column layout: `.room` columns `minmax(0, 1fr) clamp(15rem, 42vw, 20rem)`, rows `auto minmax(0, 1fr)`, height `100dvh`; board and panel in row 2; panel with a left border instead of a top border; `.panel-body` scrolling at `height: 100%`; panel tabs stack icon over label.

## 2. Verification

- [x] 2.1 Browser (Playwright MCP): at 667×375 the panel is beside the board, the page does not scroll and the panel body does; at 375×667 the stacked layout is unchanged; rotating back and forth refits the board; at 1280×800 the desktop layout is unchanged.
- [ ] 2.2 `npx openspec validate landscape-side-panel`, then `npm run lint && npm run typecheck && npm test`.
