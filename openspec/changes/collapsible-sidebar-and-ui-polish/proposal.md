# Proposal

## Why

The room page (`apps/web/src/pages/RoomPage.tsx`) gives the side panel a fixed 20rem column (`.room { grid-template-columns: 1fr 20rem }` in `styles.css`) that always shows every section: My tokens, Initiative, Tokens, Dice and, for the GM, five administration sections. On a laptop that is a lot of permanent chrome next to the board, which is the point of the app, and the sections differ in spacing, heading treatment and density (`.panel-section` in some panels, bare `<section>` in `GmPanel`). Jira KAN-65 asks for a sidebar that can get out of the way and a cleaner presentation overall.

## What Changes

- **Sidebar toggle:** a handle centred on the sidebar's inner edge hides the whole side panel (and brings it back). The board takes the full width; the handle stays centred on the right edge. `BoardView` already uses Pixi's `resizeTo: host`, so it refits itself, but it must keep the viewer's zoom/pan (see design).
- **Per-section collapse:** each panel section (My tokens, Initiative, Tokens, Dice, and the GM sections) gets a heading button that collapses and expands its body.
- **Participants on demand:** the participant list leaves the sidebar (and the phone Play tab). A people icon with a count, at the top left of the board beside Fit, opens it as a popover.
- **Share button:** the GM's "Invite players" section becomes a Share button at the top right of the panel header, opening the invite link with Copy.
- **Guided tour:** a Guide button in the board toolbar starts a role-specific, step-by-step spotlight tour of the room page, available at any time.
- **Setup forms in modals:** Add token and Grid stop being always-open sidebar sections; buttons open them in modal dialogs.
- **Remembered per browser:** sidebar and section collapse state is stored in `localStorage`, UI-only. No command, event, snapshot or server change.
- **UI cleanup:** one shared section component with a consistent heading, spacing scale, type sizes and colour tokens; clearer headings; sensible layout at common widths (wide desktop, 1280/1024 laptop, tablet, and the existing phone tabs layout).
- **Accessibility:** the toggle and section headings are real buttons with `aria-expanded` and `aria-controls`, keyboard operable, visible focus, and reduced-motion respected.

## Capabilities

### New Capabilities
- `room-sidebar-layout`: Collapsible sidebar and panel sections on the room page, their persisted client-side state, accessibility and responsive behaviour.

### Modified Capabilities
<!-- None. FR-PL-03 (responsive player board) is specified only in README.md; the phone tabs layout is unchanged and must keep working. -->

## Impact

- **apps/web only:** `pages/RoomPage.tsx` (rail/toggle, layout class), `panels/RoomPanel.tsx`, `panels/*.tsx` and `pages/GmPanel.tsx` (adopt a shared `PanelSection`), new `ui/PanelSection.tsx` and `ui/usePersistentState.ts`, `styles.css`, and a small hook in `board/Board.tsx` only if the refit needs a nudge. No new dependencies.
- **Not touched:** `packages/shared`, `apps/server`, the event model, and Pixi internals in `board/boardView.ts`. Per CLAUDE.md this needs no ADR because no existing schema changes.
- **Non-goals:** resizable/draggable sidebar width, a light theme, redesigning individual panel contents, and the phone tab layout (kept as is, only re-skinned via shared tokens).
