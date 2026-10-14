## Why

To move a token to another group, the GM has to open Edit, find the Group field, change it, and press Save twice (once to save, once to confirm). This happens often while setting up a fight, for example sorting freshly placed goblins into "Gate guards" and "Patrol". Each move is several clicks plus a modal, though the roster already shows every group on screen (FR-GM-08, KAN-82).

## What Changes

- **Grip handle:** each row in the GM's token list gets a grip handle next to the token's name.
- **Click the handle:** it opens a **Move to** menu listing every group in creation order, then **Ungrouped**. The token's current group is marked and can't be picked. Picking another group moves the token there.
- **Drag the handle:** dropping it onto a group's section (its heading or its list) moves the token there. This includes collapsed groups, empty groups, and the Ungrouped section. Dropping it on the group it's already in does nothing.
- **One undoable move:** both ways send the existing group-membership command for that one token, as the editor's Group field does. Each move is one undoable action in the activity log.
- **When the handle shows:** only to the GM, and only when the room has at least one group. Players' lists are unchanged.
- The editor's Group field stays as it is.
- No command, event, schema, visibility, or server changes.

## Non-goals

- Moving several tokens in one action. The roster has no multi-select.
- Ordering tokens inside a group. The roster sorts tokens by name.
- Dragging a roster row onto the board, or a board token into the roster.
- Drag on touch screens. The menu covers phones and keyboards.
- Creating a group from the menu.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `token-groups`: a new requirement for changing a token's group straight from the GM's roster, by the Move to menu or by dragging. Who may change membership, single-group membership, and undo stay as they are.

## Impact

- **`apps/web`:**
  - `panels/TokenRoster.tsx`: `moveToGroup`, the grip handle on GM rows, and group sections as drop targets.
  - A new `panels/GroupMoveMenu.tsx`.
  - `ui/Popover.tsx`: can keep its panel inside the window, and can pass drag handlers to its button.
  - `styles.css`: the handle and the drop highlight.
  - Tests in `apps/web/test`.
- **`packages/shared`, `apps/server`:** none. The existing `group.assign` command is used as it is, so no ADR is needed.
