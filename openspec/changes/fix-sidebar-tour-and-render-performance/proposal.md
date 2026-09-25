## Why

The app has noticeable lag on the home page and in rooms, and the sidebar handle does nothing when clicked in one case. Measurements on `main` (4ebb55f):

- **Room, idle, empty board:** the PixiJS ticker redraws the whole canvas on every display frame (165 frames a second on a 165 Hz screen). The main thread is 11.5% busy with nothing changing, and the GPU redraws at full resolution with antialiasing the whole time.
- **Room, toolbar:** each toolbar button uses `backdrop-filter: blur(4px)` over that canvas. Each redraw forces the browser to blur the area behind every button again.
- **Room, sidebar collapse:** the column animation resizes the Pixi renderer on every animation frame for 180 ms, and each resize reallocates the canvas.
- **Home page, scrolling:** the scroll-linked `.reveal` and `drift` animations run on sections holding a 46 px `filter: blur()` bloom of the full map image. Headless Chromium at 4× CPU throttle shows 3 dropped frames per scroll pass (66–73 ms max) with them and none (18 ms max) without. On an integrated GPU the blur cost adds to that.

**Sidebar handle:** it often takes several clicks. The handle is placed with `transform: translate(-100%, -50%)`, but the global `button:active:not(:disabled) { transform: translateY(1px) }` rule is more specific. So while the mouse button is held down, it replaces that offset, and over 0.1 s the handle slides out from under the pointer. A release after roughly 100 ms lands on a different element and no click fires. Instant automated clicks pass. A 150 ms press left the sidebar collapsed every time. Separately, the tour's "More room" step spotlights the handle and says to click it, but the tour's full-screen blocker swallows the click.

**Activity log:** the full-width primary "Refresh" button sits between the search field and the entries and pushes the log down. It should be a small refresh icon.

## What Changes

- **Render the board on demand.** Stop the Pixi ticker's continuous rendering. Render only when something changes: state updates, pan and zoom, drags, pings, drag-preview ghosts, texture loads and resizes. Animations (pings, ghost expiry) keep the ticker running only while they are active.
- **Cap the board's render resolution** at 2× device pixels, so 3× screens don't draw 9× the pixels.
- **Batch renderer resizes** to at most one per animation frame, and render once after the sidebar transition settles.
- **Remove `backdrop-filter`** from the board toolbar buttons and the home page's hidden-token chips. Their backgrounds are already nearly opaque.
- **Home page:** drop the scroll-driven `drift` animation on the hero map, and make `.reveal` a one-shot entrance instead of one tied to the scroll position. Isolate the static bloom layers (`contain: paint`) so later repaints never reach them. The look at rest stays the same.
- **Guided tour:** the spotlit area accepts clicks on steps that ask for them. The sidebar-handle step lets the click through, so "Click again to bring it back" works mid-tour, and the spotlight follows the handle when the sidebar animates.
- **Activity log:** replace the Refresh button with a compact icon-only button (`aria-label="Refresh"`, tooltip) on the same row as the search field. It keeps its disabled-while-loading behaviour.

## Capabilities

### New Capabilities
- `client-render-performance`: the board renders only when its picture changes, and decorative page effects don't cost work on every frame.
- `room-ui-refinements`: the tour's spotlit target can be used, and a compact refresh control in the activity log.

### Modified Capabilities
None. `room-sidebar-layout` and `room-activity-log` are still in unarchived changes, so these refinements go in a new capability. That avoids delta conflicts at archive time.

## Impact

Web only: `apps/web/src/board/boardView.ts`, `ui/GuideTour.tsx`, `ui/guide.ts`, `panels/ActivityLog.tsx`, `styles.css`. No shared schemas, commands, events, server code or persisted data change, so invariants 1–8 are untouched. Board coordinates stay map pixels, and resolution affects only the backing buffer.

## Non-goals

- Code splitting and bundle size, which affect first load but not the lag while using the page.
- Viewport culling on large boards; there's no evidence it's needed at current token counts.
- A GM-only "back to home" button in the room: raised separately, not in scope unless it's added to this change.
