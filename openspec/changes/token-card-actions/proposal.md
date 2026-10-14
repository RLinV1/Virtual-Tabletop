## Why

To copy or edit a token, the GM has to find it in the sidebar's token list, press Edit, and then (for a copy) press Duplicate inside the editor. When the token is right there on the board, the card that opens on click only shows details and has no actions. Duplicate is also two clicks deep in the roster, though it is one of the most common setup actions (FR-GM-08).

## What Changes

- **Board token card:** the card that opens when a token is clicked on the board gets **Edit** and **Duplicate** buttons.
- **Sidebar token list:** each roster row gets a **Duplicate** button next to its existing **Edit**.
- **One label:** every copy button says **Duplicate**, the same as the editor's existing button.
- **Duplicate** shows only to the GM. It starts the existing repeating placement: each click on the board, or Enter on the keyboard position, places one copy, until the GM presses Esc or Cancel, right-clicks, or picks a board tool.
- **Edit** shows to the GM and to the token's owners, the same rule the server enforces for `token.configure`. On the board card, Edit opens the token editor that is already in the sidebar. The sidebar switches to the Tokens tab and opens first if it is collapsed.
- No command, event, schema, visibility, or server changes.

## Non-goals

- A second token editor on the board, or editing fields in the card itself.
- Returning the sidebar to the tab it was on before Edit.
- Changing what a copy carries, the placement flow, or undo.
- Duplicate for players, including on tokens they own.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `token-duplication`: Duplicate is offered on the board token card and on each sidebar roster row as well as in the editor, to the GM only, under the one label "Duplicate". A new requirement covers Edit on the board token card: who sees it, and that it opens the sidebar's editor on the Tokens tab.

## Impact

- **`apps/web`:**
  - `board/Board.tsx`: the token card renders Edit and Duplicate (moved into its own React component so it can be tested without Pixi). New `onEditToken` prop; Duplicate calls the board's existing `duplicateToken`.
  - `pages/RoomPage.tsx`: owns which token is being edited; `onEditToken` switches to the Tokens tab and opens a collapsed sidebar, waiting out its open animation.
  - `panels/RoomPanel.tsx`, `panels/TokenRoster.tsx`: the editing token id becomes a controlled prop; `RosterRow` gets Duplicate; Edit visibility uses `can.editToken`.
  - Tests in `apps/web/test`.
- **`packages/shared`, `apps/server`:** none. No ADR is needed.
