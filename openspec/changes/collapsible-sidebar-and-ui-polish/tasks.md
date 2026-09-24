# Tasks

## 1. Persistent UI state (apps/web/src/ui)

- [x] 1.1 Add `ui/usePersistentState.ts` per design D1: try/catch on every storage access, a `validate` argument, fall back to the initial value on absent/corrupt/throwing storage. Verify with unit tests in `apps/web/test` using a stub `localStorage`: round trip, corrupt JSON, wrong shape, and a storage that throws on get and on set (spec: Collapse state is client-side only).
- [x] 1.2 Add a `SectionCollapseContext` (record of section id → collapsed) backed by `usePersistentState("vtt.ui.sections", …)`. Verify with `npm run typecheck`.

## 2. Shared section component

- [x] 2.1 Add `ui/PanelSection.tsx` per design D2: `<section>`, `<h2>` containing a button with `aria-expanded`/`aria-controls`, body with `hidden` when collapsed, optional badge/actions slot. Verify with `npm run lint && npm run typecheck`.
- [x] 2.2 Migrate `MyTokens`, `InitiativeTracker`, `TokenRoster` and `DicePanel` to `PanelSection`, each rendering one section root in all states, and the compact-layout Participants block in `RoomPanel` (since superseded by 3.4). Verify by typecheck and that the phone tabs layout still shows the same content (spec: Phone layout unchanged).
- [x] 2.3 Migrate every section in `pages/GmPanel.tsx` (Manage tokens, Invite players, Battle map, Grid, Add token, and "Save grid to library", which is folded into the Grid section rather than given its own heading) to `PanelSection`. Verify a GM sees them with the same heading control as play sections (spec: GM sections match play sections) and a player still receives none of them.

## 3. Sidebar collapse

- [x] 3.1 In `RoomPage.tsx` add `sidebarCollapsed` via `usePersistentState("vtt.ui.sidebar", false, …)`, the toggle handle (`aria-expanded`, `aria-controls`) centred on the panel's inner edge, the `sidebar-collapsed` modifier class and the body wrapper with `hidden`. Toggle not rendered and flag ignored when `compact`. Verify at 1280px that collapsing removes the whole panel, the board spans the full width and the handle sits centred on the right edge, and that at 390px there is no toggle.
- [x] 3.2 Focus handling per design D5: moving focus to the toggle when collapsing from inside the panel, and making the skip link expand the sidebar and focus the aside. Verify with keyboard only: Tab into a panel control, collapse via the toggle, focus stays on the toggle; use the skip link while collapsed (spec: Keyboard and assistive-technology access).
- [x] 3.3 Confirm `<Board>` keeps the same position in the tree in both states so it is never remounted. Verify in the browser that toggling does not create a new canvas (one `<canvas>` element, same node before and after) and there is no console error.

- [x] 3.4 Participants popover per design D5a: add `ui/ParticipantsButton.tsx`, render it at the top left of the board via a `toolbar` prop on `Board` beside Fit, and remove the desktop Participants section (`RoomPage`) and the compact Participants block (`RoomPanel`). Verify: no Participants section at 1280px or 390px; the button shows the count, opens the list with the GM marked in text, closes on Escape (focus back on the button), second click and outside click, and stays top left when the sidebar is collapsed (spec: Participants on demand).
- [x] 3.5 Share button per spec "Share invite from the header": extract the popover mechanics from `ParticipantsButton` into a shared `ui/Popover.tsx`, add `ui/ShareButton.tsx` (read-only link + Copy), render it GM-only at the top right of the panel header row, and remove `InviteLink` from `GmPanel`. Verify: GM sees Share top right, Copy copies the link and shows "Copied", Escape closes and refocuses the button, a player sees no Share button, and there is no Invite players section.

## 4. Board centre preservation (apps/web/src/board)

- [x] 4.1 Add a pure helper `recenterOnResize` and use it in `BoardView`'s `resize` handler when `autoFit` is false, per design D4. Verify with a unit test of the helper (centre point maps to the same world point before and after a width change; zoom unchanged).
- [ ] 4.2 Verify manually: zoom in and pan to a token, toggle the sidebar and a window resize, and check the same map point stays centred and the zoom level is unchanged; with no manual zoom/pan the map still auto-fits (spec: Board view is undisturbed by layout changes).

## 5. Styling and layout

- [x] 5.1 Add spacing, type-scale and radius tokens to `:root` in `styles.css`; rebuild `.panel`, `.panel-section`, headings and the section toggle from them. Visible focus on the new buttons; motion only under `prefers-reduced-motion: no-preference`.
- [x] 5.2 Set panel width to `clamp(17rem, 24vw, 22rem)`, add the edge handle and fully-collapsed styles, and fold the duplicate 760px block into the 720px compact rules so the CSS and `COMPACT_WIDTH` agree. Verify at 2560, 1440, 1024, 768, 390 and 320px: no horizontal page scroll, board keeps the majority of width, panel content does not overflow (spec: Responsive layout).
- [x] 5.3 Check that state is never colour-only in the touched styles (active/private/status keep their border or badge). Verify by inspection.

## 6. Wrap-up

- [x] 6.1 Confirm nothing in `packages/shared` or `apps/server` changed and no socket/HTTP traffic occurs on toggle (network panel while toggling; spec: No network traffic).
- [x] 6.2 Run `npm run lint && npm run typecheck && npm test` and fix failures.
- [x] 6.3 Reload with sidebar and one section collapsed; confirm both persist, then clear site data and confirm defaults return (spec: Remembered after reload).

## 7. Guided tour

- [x] 7.1 Add pure helpers in `ui/guide.ts`: `guideSteps(role)` (ordered, role-specific steps keyed by `data-tour` targets) and `placeCard(target, card, viewport)` (right, left, below or above the target, else inside it, clamped to the viewport). Verify with unit tests: GM steps include share/map/grid/add/manage, player steps include none of them, and placement never leaves the viewport.
- [x] 7.2 Add `data-tour` targets (board, fit, participants, guide, share, sidebar handle, and every `PanelSection` via its id) and `ui/GuideTour.tsx`: spotlight + card, skip missing targets, scroll target into view, reposition on resize and scroll, focus trap, Escape, arrow keys, focus back to the Guide button. Verify with lint and typecheck.
- [x] 7.3 Mount the Guide button in the board toolbar and the tour in `RoomPage`, expanding a collapsed sidebar on start. Verify in the browser as GM: every step spotlights its area, collapsed and scrolled-away sections still work, Escape closes; and that the tour sends no network traffic (spec: Guided tour on demand).

## 8. Setup forms in modals

- [x] 8.1 Add `ui/Modal.tsx` on the native `<dialog>` (`showModal`, backdrop click, Escape via the cancel event, focus return to the opener). Verify with lint and typecheck.
- [x] 8.2 In `GmPanel`, replace the Add token and Grid sections with an `Add token` button at the top of Manage tokens and an `Adjust grid` button in Battle map, each opening its form in a `Modal`; close on success, keep open with the error on rejection. Move the `gm-add-token` and `gm-grid` guide targets to those buttons. Verify in the browser: open, submit, Escape and backdrop close, focus returns (spec: GM setup forms open in modals).
- [x] 8.3 Move the GM token controls into Tokens: Add token at the bottom of the section, and an Edit modal per token with stats, conditions, owner, visibility and a confirmed delete; drop the Manage tokens section. Verify the sidebar lists each token once.
- [x] 8.4 Initiative score entry moves into a Start encounter modal; Dice shows the latest roll and a Roll history modal with search by player; both library pickers open as searchable modals (token image picker stacked over Add token). Verify with the Playwright pass.

## 9. Browser verification

- [x] 9.1 Playwright pass against the dev server (GM and player contexts, installed Chrome): 42 checks covering share, every modal (open, submit, Escape, focus return, stacking), guide steps for both roles, collapse (canvas spans the full width, no scrollbars), skip link, keyboard collapse, reload persistence, widths 2560 to 320px, roll search, and no console errors.
