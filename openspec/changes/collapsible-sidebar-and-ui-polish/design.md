# Design

## Context

See proposal.md (Why) and the `room-sidebar-layout` spec delta for required behaviour. Observed current state:

- `RoomPage.tsx` renders `.room` (CSS grid, `1fr 20rem`) containing `<Board>` and `<aside class="panel" id="room-panel">`. `useCompactLayout()` switches to the tabbed phone layout at 720px via `matchMedia`; `styles.css` has a second, older 760px media block that partly duplicates it.
- `BoardView.init` uses Pixi `resizeTo: this.host`, and on the renderer `resize` event calls `fitToScreen()` only while `autoFit` is true. Once the viewer pans or zooms, `autoFit` is false and the `world` container keeps its position, so the map stays anchored to the **top-left** of the canvas. A wider or narrower host therefore shifts the visible centre. The spec requires the centre to be preserved.
- Sections are inconsistent: `MyTokens`, `InitiativeTracker`, `TokenRoster`, `DicePanel` use `<section class="panel-section"><h2>`; `GmPanel` uses bare `<section><h2>`. Some panels return different roots for empty and non-empty states (`MyTokens`, `InitiativeTracker`).
- There are no web component tests today (`apps/web/test` has one unit test file, no DOM environment configured).

## Goals / Non-Goals

**Goals:**
- Collapse is a pure presentation concern owned by the web app: no shared-contract, server or event changes.
- One reusable section primitive so collapse, headings, aria and spacing are implemented once.
- The canvas is never remounted by a layout change.

**Non-Goals:**
- Resizable sidebar width, theming, per-room collapse state, or syncing state across devices.
- Changing what the panels contain or the phone tab layout's behaviour.

## Decisions

### D1. Collapse state lives in a small `usePersistentState` hook backed by `localStorage`
`ui/usePersistentState.ts`: `usePersistentState<T>(key, initial, validate)` returns `[value, setValue]`. Reads once on mount inside try/catch and runs `validate` (a zod schema or type guard) so corrupt data falls back to `initial`; writes on change inside try/catch. Keys are namespaced `vtt.ui.sidebar` and `vtt.ui.sections`. Sections are stored as one record `{[sectionId]: boolean}` so a single key holds them all.

The state is per browser, not per room, because it is a layout preference. It is never derived from `RoomState`, so nothing about it can reach the server.

Alternative considered: per-room keys. Rejected as more storage for no user value, and stale keys accumulate.

### D2. `PanelSection` component
`ui/PanelSection.tsx` takes `id`, `title`, optional `badge`/`actions`, and `children`. It renders `<section>` with an `<h2>` that wraps a `<button aria-expanded aria-controls>` and a body `<div id hidden>`. The body is hidden with the `hidden` attribute (display: none), which removes it from tab order and the accessibility tree, and keeps children mounted so half-typed form input survives. Collapse state comes from a context provided by `RoomPanel` (backed by D1) so panels do not each touch storage.

`GmPanel` sections and the four play panels are migrated to it. Panels that render several root shapes are made to render a single `PanelSection` with different children.

### D3. Sidebar collapse is a CSS-grid change plus an inert body
`RoomPage` holds `sidebarCollapsed` (D1) and adds a modifier class: `.room.sidebar-collapsed { grid-template-columns: 1fr 0 }`, so nothing of the panel remains. The `<aside>` always stays in the DOM and holds the toggle (`aria-expanded`, `aria-controls="room-panel-body"`), absolutely positioned as a tab handle straddling its left edge at `top: 50%`; with a zero-width column the handle ends up centred on the viewport's right edge, over the board. The panel body wrapper gets `hidden` when collapsed, so it is inert and not read by screen readers. A grid column transition is animated only when `prefers-reduced-motion` is not set. The handle is desktop-only: in compact mode the toggle is not rendered and the collapsed flag is ignored (the state is retained for when the window widens).

`<Board>` stays the same element in the same tree position in both states, so React never remounts it and `BoardView` is not recreated.

### D4. Preserve the board's centre on resize
Add to `BoardView` (in `board/`, keeping Pixi out of React): in the `resize` handler, when `autoFit` is false, remember the world-space point at the old viewport centre and re-position `world` so that point is at the new centre. Track the previous `screen.width/height` to compute the delta; equivalently translate `world.position` by half the size change. Zoom scale is untouched. Auto-fit behaviour is unchanged.

This makes the "centre preserved" scenario hold for any host resize (window resize too), which is a small behaviour improvement, not a regression: previously a manually panned board drifted toward the left edge when the window grew.

`Board.tsx` needs no change; the `resize` event already fires because of `resizeTo`.

### D5. Focus and skip link
When collapsing, if `document.activeElement` is inside the panel body, focus moves to the toggle (done in the click handler, before the body is hidden). The skip link target `#room-panel` remains the `<aside>`; following it while collapsed expands the sidebar via a `hashchange`/click handler on the skip link and then focuses the aside (`tabIndex={-1}`).

### D5a. Participants popover
`ui/ParticipantsButton.tsx` renders an icon button (inline SVG people glyph + count, `aria-label="Participants, N"`, `aria-expanded`, `aria-controls`) and, when open, a positioned list (`role="dialog"`, `aria-label="Participants"`) built from `state.participants`, which is already filtered for the viewer by the server. Open state is local `useState`, not persisted. Closes on Escape (focus returns to the button), on a second click, and on a `pointerdown` outside the button and popover. It is rendered once, at the top left of the board: `Board` takes an optional `toolbar` node that it renders in a `.board-toolbar` row before its Fit button (plain React, no Pixi), so the button stays put whether or not the sidebar is collapsed and on the phone layout. It replaces the desktop Participants section in `RoomPage` and the compact Participants block in `RoomPanel`.

### D5b. Share button
The open/close mechanics (outside click, Escape with refocus, `aria-expanded`/`aria-controls`) move from `ParticipantsButton` into one `ui/Popover.tsx` (`PopoverButton` with `label`, `buttonContent`, `align`), so both popovers behave identically. `ui/ShareButton.tsx` is the old `InviteLink` (read-only field + Copy with clipboard fallback to selection) inside a right-aligned popover. `RoomPage` renders it in a `.panel-title-row` beside the `h1` only when `you.role === "gm"` and an invite code exists; the server-side rules are unchanged since the code was already GM-only.

### D5c. Guided tour
No tour library: the page already has everything needed, and a dependency for nine tooltips is not worth it. Targets are marked with `data-tour="..."` attributes (`PanelSection` sets its own from its id), so the tour never reaches into component internals. Steps live in `ui/guide.ts` as data with role-specific text; `GuideTour` filters out steps whose target is absent or has no size (GM sections for players, other phone tabs). The spotlight is one fixed element sized to the target with a very large dimming `box-shadow`, so the target itself stays undimmed without cutting holes in an overlay; a transparent full-screen layer under the card blocks clicks on the page while the tour is open. Position is recomputed on step change, window resize and scroll (capture phase, so the panel's own scrolling counts). The card is `role="dialog"` `aria-modal`, traps Tab, announces steps through its heading, and returns focus to the Guide button on close. Starting the tour clears the collapsed-sidebar flag. Not persisted; nothing is sent.

### D5d. Modals
`ui/Modal.tsx` wraps the native `<dialog>` opened with `showModal()`: the browser supplies the focus trap, top-layer stacking, inert background and Escape (the `cancel` event), so the component only adds a title bar, backdrop-click dismissal and focus return to the opening button. Forms keep their own state and error display; the parent closes the modal only when the command result is `ok`. The rule for what becomes a modal: forms filled in occasionally and dismissed (add token, grid, library picking, initiative scores, editing one token, browsing roll history) go into modals; anything used every turn stays inline. Modals stack natively, so the token-image library opens over Add token. `Modal` also handles Escape in `keydown` itself, because a focused `input[type=search]` spends the first Escape clearing its text and the dialog's `cancel` event never fires (found by the Playwright run); `stopPropagation` keeps a stacked modal from closing the one beneath it. For the GM, `TokenRoster` absorbs the old Manage tokens section (Add token button, and owner/visibility/delete in the Edit modal), so every token control is in one place and no token is listed twice.

### D6. Styling
Palette and type were chosen with the repo's `redesign-existing-projects` and `design-taste-frontend` skills: one cool slate neutral family with a single muted rust accent (`--accent: #b9582f`, white text 4.9:1) used only for primary actions and the active turn, Alegreya Sans for body and Alegreya Sans SC for section headings, tabular figures for dice, HP and initiative. Sections are separated by hairlines, not boxed; token rows are list entries, not bordered buttons. A first pass in brass on warm ink was dropped because it is the palette family those skills flag as the generic AI default. `[hidden] { display: none !important }` is global, because class-level `display` otherwise defeats the attribute (this is what left the collapsed panel rendered). `BoardView` also watches its host with a `ResizeObserver`, since Pixi's `resizeTo` reacts only to window resizes and would miss the sidebar collapsing.

Introduce CSS custom properties for spacing (`--space-1..4`), type scale (`--fs-sm/md/lg`), and radii next to the existing colour tokens, and rebuild `.panel`, `.panel-section` and headings from them. Panel width becomes `clamp(17rem, 24vw, 22rem)`, so a 1024px window gives about 17-18rem and wide screens cap at 22rem. The duplicate 760px block in `styles.css` is folded into the 720px compact rules so both breakpoints agree with `COMPACT_WIDTH`.

## Risks / Trade-offs

- **Hidden-not-unmounted sections keep running effects** (e.g. dice log subscriptions). These are cheap, and remounting would drop draft input. Accepted.
- **Migrating every panel to `PanelSection` touches many files.** Mitigated by doing it mechanically, one panel at a time, and by typecheck/lint plus the manual pass below.
- **No DOM test harness exists.** Logic (`usePersistentState` validation, corrupt/absent storage) is unit-testable in node with a stub `localStorage`; layout, focus and aria are checked with a manual pass at 1440, 1024, 768 and 390px. Adding jsdom + Testing Library is out of scope but is the natural follow-up if the team wants automated coverage.
- **The Pixi centre-preservation change cannot be unit tested without a renderer.** It is factored into a pure helper (`recenterOnResize(worldPos, oldSize, newSize)`) that can be, and the integration is verified manually.
- The hash-based skip link expanding the sidebar is a small extra behaviour; if it proves fiddly it can be replaced by simply keeping the skip link out of the collapsed state.

## Open Questions

- None blocking. Default section state is all expanded; if the team prefers Manage sections collapsed by default for GMs, that is a one-line default in D1.
