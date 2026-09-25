## 1. Home link

- [x] 1.1 In `RoomPage`, render a GM-only `Link` to `/` with a `House` icon and "Home" label as the first toolbar item.

## 2. Verification

- [x] 2.1 Browser: the GM sees it and it navigates home in-app; a player joined by invite doesn't see it; it's visible with the sidebar collapsed.
- [x] 2.2 `npx openspec validate gm-home-link`, then `npm run lint && npm run typecheck && npm test`.
