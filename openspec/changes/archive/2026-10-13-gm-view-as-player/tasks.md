## 1. Preview state

- [x] 1.1 In `RoomPage.tsx` add `viewAs` state, memoised `viewState` via `filterStateForViewer`, and `viewYou`; return to the GM view if the viewed participant leaves or is not a player
- [x] 1.2 Pass `viewState` and `viewYou` to `Board` and `RoomPanel`; keep the real `you` for the banner and exit
- [x] 1.3 Unit test: preview state equals `filterStateForViewer(state, player)` and hides hidden tokens, fogged unowned tokens and GM-only rolls

## 2. Read-only guarantee

- [x] 2.1 Add a `preview` prop to `Board` that disables tools, drag, placement and aiming
- [x] 2.2 Mark the panel content `inert` while previewing (the tab bar stays usable); `previewConnection` rejects commands locally with a clear message and drops pings, drags and aims
- [x] 2.3 Test that no command is sent while previewing

## 3. UI

- [x] 3.1 Add "View as" per active player to the GM's participants control
- [x] 3.2 Add a persistent banner naming the viewed player with a "Back to GM view" button, outside the inert region
- [x] 3.3 Keyboard and screen-reader support: focus moves to the banner on entering, announced via a status region

## 4. GM fog

- [x] 4.1 GM view draws fog at 50% opacity (`FOG_GM_ALPHA`) with outline; players and the preview draw it fully opaque
- [x] 4.2 "Fog on / Fog off" toolbar button for the GM when fog exists: `setGmFogShown`, remembered per browser
- [x] 4.3 The toggle reuses `usePersistentState` (already tested) and only calls `BoardView.setGmFogShown`; it sends nothing

## 5. Verify

- [x] 5.1 Run `npm run lint && npm run typecheck && npm test`
- [ ] 5.2 Playwright: enter and leave the preview, hidden token and fog behave as a player's, controls inert, fog toggle works, at desktop and mobile widths (not run: needs a signed-in GM room)
