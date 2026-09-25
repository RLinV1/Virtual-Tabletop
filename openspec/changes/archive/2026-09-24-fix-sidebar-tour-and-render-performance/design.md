## Context

`BoardView` calls `Application.init` with the default `autoStart: true`, so Pixi's ticker renders the stage on every `requestAnimationFrame`. The view already knows when its picture changes: every mutation happens in `update`, the pan, zoom and drag handlers, `showPing`, `showDragPreview`, texture-load callbacks and the resize handler.

`GuideTour` renders a full-screen `.guide-blocker` under a `pointer-events: none` spotlight, so nothing inside the spotlight can be clicked.

## Decisions

### On-demand board rendering
- Pass `autoStart: false` to `app.init`. Add a private `invalidate()` that schedules a single `requestAnimationFrame(() => app.render())` and deduplicates repeated calls within a frame.
- Call `invalidate()` at the end of `update`, `focusToken`, `clearFocus`, `resetView`, wheel, pan and drag moves, pinch, the resize handler, and each `Assets.load` success.
- Animations (the ping ring, the drag-ghost expiry) register with a small active-animation set. While it's non-empty, a rAF loop renders every frame, and it stops when the set empties. `this.tick` goes away.
- Why not `ticker.maxFPS`? That only caps an always-on loop, so idle cost would still be non-zero. On-demand drops idle cost to zero.

### Resolution cap
`resolution: Math.min(window.devicePixelRatio, 2)`. Board coordinates are unaffected (invariant 8).

### Resize coalescing
Drop `resizeTo` and size the renderer from the host ourselves. The `ResizeObserver` callback marks a resize pending. Each frame compares the host size with the previous frame's, and `renderer.resize` runs only once the host has held one size for a whole frame. So the 180 ms column transition costs one canvas reallocation instead of one per frame. Until then the canvas keeps its old size. `.board` gets the canvas's clear colour, so an uncovered strip doesn't show. The panel body keeps a fixed width while its column animates (`.room` clips the overhang with `overflow-x: clip`), so its sections no longer re-wrap each frame. That re-wrapping also flashed a scrollbar.

### Tour click-through
Replace the single full-screen blocker with four blocker rectangles around the spotlight rect. A step can set `interactive: true`, and only then is the hole left open (`sidebar-handle`). Other steps keep one full-screen blocker, as now. While the tour is open, a `transitionend` listener on the document (capture) re-measures, so the spotlight follows the handle after the sidebar animates. The card's focus trap is unchanged.

### Home page effects
- Remove the `drift` keyframes and the `animation-timeline: view()` rules.
- `.reveal` uses the existing `enter` keyframes once, when the element first intersects. A single shared `IntersectionObserver` adds a class, and nothing runs per scroll frame.
- The bloom stays at `blur(46px)`. With the scroll-linked animations gone, nothing repaints it while scrolling, so paint containment turned out to be unnecessary. If lag remains on the target machine, the fallback is a small pre-scaled thumbnail as the bloom source, which blurs cheaply.
- Lazy map images get `decoding="async"`. Headless measurement still shows one first-view image decode of about 75 ms at 4× throttle. Desktop Chrome does that decode off the main thread.

### Activity log refresh
Use the existing `@phosphor-icons/react` dependency's `ArrowClockwise` in a `.icon-button` (2rem square, secondary style), placed at the end of the search row. The status line "New activity is available. Refresh to see it." stays.

## Risks

- **A missed `invalidate()` call leaves the board stale** until the next interaction. Mitigation: every mutation goes through the handful of methods above. They were checked in the browser (state updates, pan, zoom, drag and commit, ping, resize). Pixi needs WebGL, which the unit-test environment lacks, so this is a browser check rather than a unit test.
- **Pixi's shared system ticker is stopped.** It only re-tested hover for a scene moving under a still pointer. Hover and cursor still update on real pointer events.

## Verification

- Room idle main-thread busy % (CDP `Performance.getMetrics`, 3 s): target ≤ 1% (was 11.5%).
- Home scroll pass at 4× CPU throttle: no per-frame animation work. The only slow frame left is a first-view image decode.
- Manual: collapse and expand the sidebar via the handle, outside the tour and on the "More room" tour step.
- `npm run lint && npm run typecheck && npm test`.
