## 1. Sidebar handle

- [x] 1.0 Fix the handle losing clicks: the global `button:active` transform replaced its `translate(-100%, -50%)` offset mid-press. Position it with the `translate` property instead, and add the scenario to `room-ui-refinements`.

- [x] 1.1 Add an optional `interactive` flag to `GuideStep` and set it on the `sidebar-handle` step in `ui/guide.ts`.
- [x] 1.2 In `GuideTour.tsx`, render blockers around the spotlight hole for interactive steps, and re-measure on `transitionend`; verify in the browser that the handle collapses and expands mid-tour, while other steps still block clicks.

## 2. Board renders on demand

- [x] 2.1 `boardView.ts`: `autoStart: false`, add `invalidate()` (one rAF-coalesced render), and call it from every mutation path (update, focus, fit, wheel, pan, drag, pinch, resize, texture loads).
- [x] 2.2 Replace `tick` and ticker-based ping animation with an active-animation loop that stops when idle.
- [x] 2.3 Cap `resolution` at 2; resize the canvas once the host size settles, keep the panel body at full width during the slide, and stop Pixi's system ticker.
- [x] 2.4 Verify: idle room ≤ 1% main-thread busy; remote moves, pings, drag ghosts, map image loads and sidebar collapse all redraw correctly (token art uses the same load-then-redraw path as the map).

## 3. Page effects

- [x] 3.1 Remove `backdrop-filter` from `.tool-button` and `.token-chip.is-hidden .token-disc`.
- [x] 3.2 Remove the scroll-driven `drift` and `.reveal` timelines; make `.reveal` a one-shot entrance via a shared IntersectionObserver; decode lazy map images asynchronously. Paint containment was dropped as unnecessary (see design).
- [x] 3.3 Verify: home scroll pass at 4× throttle has no per-frame animation work; visual check in light and dark themes and with reduced motion.

## 4. Activity log refresh

- [x] 4.1 Replace the Refresh button with an icon-only `ArrowClockwise` button on the search row (`aria-label="Refresh"`, `title`, disabled while busy); verify in the browser.

## 5. Verification

- [x] 5.1 `npx openspec validate fix-sidebar-tour-and-render-performance`, then `npm run lint && npm run typecheck && npm test`.
