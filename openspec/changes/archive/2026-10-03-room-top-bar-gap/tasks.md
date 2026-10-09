## 1. Fix

- [x] 1.1 Keep the top bar's controls column at least as wide as its content; verify in Playwright at 1600–961 px that no control overlaps the avatars and the page never scrolls sideways
- [x] 1.2 Move the two-row top bar breakpoint to 960 px; verify at 960, 800, 721 and 390 px that nothing overlaps
- [x] 1.3 Run `npm run lint && npm run typecheck && npm test`; verify all pass
