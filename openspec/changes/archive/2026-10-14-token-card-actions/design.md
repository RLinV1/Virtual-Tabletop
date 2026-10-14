# Design

## Context

See proposal.md for the motivation. The pieces this design works around:

- `RoomPage` owns both the board (`boardRef`, `BoardHandle`) and the sidebar (`RoomPanel`). It already passes `duplicateToken`, which calls `boardRef.current.duplicateToken` and starts the `{ kind: "duplicate" }` placing flow, to the roster as `onDuplicateToken`.
- The token card is inline JSX in `board/Board.tsx`, rendered for `selected`. It has no actions, and it renders inside a component that needs Pixi, so it can't be tested in jsdom today.
- The token editor is a `Modal` (native `<dialog>.showModal()`) inside `TokenRoster`, driven by local `editingId` state. `RoomPanel` mounts `TokenRoster` only on the `tokens` tab, and the panel body is `hidden` while the sidebar is collapsed. So the editor can only show when the Tokens tab is the current tab and the sidebar is open.
- `RoomPage`'s `onGuide` handler already opens a collapsed sidebar and waits 220 ms for its animation before showing what it opened (0 with `prefers-reduced-motion`).
- `can.editToken` (GM or owner) is the server's rule for `token.configure`. The roster's Edit uses `can.moveToken`, which is the same rule under a different name.

## Goals / Non-Goals

**Goals:**
- One token editor, opened from either the roster or the board card.
- The board card can be tested in jsdom.

**Non-Goals:**
- Changing `BoardHandle`'s placement API. Duplicate reuses `duplicateToken` unchanged.
- Remembering and restoring the sidebar tab after the editor closes.

## Decisions

### Lift the editing token id to `RoomPage`
`RoomPage` holds `editingTokenId` and passes `editingTokenId` and `onEditToken(id | null)` through `RoomPanel` to `TokenRoster`, which drops its own `editingId` state. The roster's Edit and the editor's close and save both call `onEditToken`. The board gets `onEditToken` as a prop.

`RoomPage`'s `onEditToken(id)` does this:
1. Sets `editingTokenId`.
2. Calls `setTab("tokens")`.
3. If the sidebar is collapsed: `setSidebarCollapsed(false)`, then sets the id after the same 220 ms / reduced-motion wait as `onGuide`, so the dialog opens after the panel has its width. Put that wait in a small helper that both handlers use, rather than copying it.

*Alternative considered:* lifting the whole Modal and `TokenEditor` into `RoomPage`, so Edit works without changing the tab. That would mean moving `send`, the roster's error state, and the group, owner and feature props with it. The user chose the smaller tab-switch approach.

*Alternative considered:* an imperative `openEditor` handle on `TokenRoster`. That doesn't work: the roster is not mounted on other tabs, so there's nothing to call.

### Clear the id when the token goes away
`TokenRoster` already resolves `editing = state.tokens[editingTokenId]`, so the modal closes when the token is deleted or hidden from the viewer. `RoomPage` must also reset `editingTokenId` to `null` when that happens. Otherwise undoing a delete, which restores the same id (invariant 6), would reopen the editor without warning. Use an effect on `state.tokens[editingTokenId]` being missing.

### Extract the card into `board/TokenCard.tsx`
`TokenCard` is a plain React component taking `token`, `state`, `you`, `onClose`, `onEdit` and `onDuplicate`. Board renders it in place of the inline JSX. It never touches Pixi objects, so this stays within the `board/` convention, and it makes the visibility rules testable.

- **Edit:** shown when `can.editToken(you, token)`. Calls `onEditToken(token.id)`.
- **Duplicate:** shown when `you.role === "gm"`. Calls the board's own `duplicateToken` path, the same code as `BoardHandle.duplicateToken`. Move that code into a local function so the handle and the card share it, with no trip through `RoomPage`.
- Pressing either one clears the selection, so the card doesn't sit over the placement ghost or the editor.

### Roster row
`RosterRow` gets `onDuplicate?`. `TokenRoster` passes it only for the GM. It renders as a `link small` button next to Edit, with `aria-label={`Duplicate ${token.name}`}`, matching Edit's style. Edit's check changes from `can.moveToken` to `can.editToken`, which is what Edit actually does. The editor's Duplicate stays as it is.

## Risks / Trade-offs

- **GM ends up on the Tokens tab after editing from the board.** This is accepted, and it's in the proposal's non-goals.
- **Timing-based wait for the sidebar animation** could open the dialog before the panel has finished opening, if the CSS duration changes. Sharing the helper with `onGuide` keeps a single constant to update.
- **Placement and attack-aim conflict.** `duplicateToken` already sets the tool to `select`. Starting an attack already cancels placing. No new conflict.
- **Board card Duplicate on a hidden token while the GM previews as a player.** The preview's `you` is a player, so the button isn't shown. The server rejects it anyway.
