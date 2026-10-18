# Tasks

## 1. Popover support

- [x] 1.1 Add opt-in `buttonProps` (spread onto the button) and `placement: "fixed"` to `PopoverButton`. Fixed placement positions the panel from the button's rect, flips above when there isn't room below, and closes on scroll (capture) or resize. Verify that existing callers (More, Participants, Share) render and behave the same, and that `npm run typecheck` and the existing web tests pass.

## 2. Move to menu

- [x] 2.1 Add `moveToGroup(tokenId, groupId | null)` to `TokenRoster`. It skips when the token is already in that group, and otherwise sends `group.assign` with that one token through `send`. Verify through the tests in 2.3.
- [x] 2.2 Add `panels/GroupMoveMenu.tsx`: a grip `PopoverButton` (`aria-label="Move <name> to group"`, `data-move-handle=<id>`, fixed placement) listing groups in creation order, then Ungrouped. The current entry is marked and disabled, and choosing an entry closes the menu and calls `onMove`. Render it at the start of GM rows only when the room has groups. Verify in the running app that a row near the bottom of a long list opens its menu fully visible.
- [x] 2.3 Add `apps/web/test/rosterGroupMove.test.tsx` (`describe("moving a token between groups from the roster (FR-GM-08, KAN-82)")`). Cover:
  - choosing "Patrol" sends `{ type: "group.assign", groupId: "patrol", tokenIds: ["g2"] }`;
  - Ungrouped sends `groupId: null`;
  - the current group is disabled with `aria-current`;
  - menu order matches creation order;
  - no handle when the room has no groups;
  - no handle for a player.
  Verify that the test passes.
- [x] 2.4 Restore focus after a move by menu: focus the moved token's handle in its new section, or that section's heading toggle if it's collapsed. Verify with a test that fires the menu choice, then rerenders with the updated `tokenGroups` and checks `document.activeElement`.

## 3. Drag onto a group

- [x] 3.1 Make the handle `draggable`. Hold `dragging` and `dropTarget` in `TokenRoster`, wire `dragover`, `dragleave` and `drop` on every `section.roster-group` (collapsed and empty ones included, Ungrouped as `""`), clear on `dragend`, and add the `drop-target` highlight in `styles.css`. Verify in the running app (Chrome) that dragging "Cultist" onto the "Back room" heading moves it, and that dropping on its own group does nothing.
- [x] 3.2 Extend `rosterGroupMove.test.tsx` with drag tests using `fireEvent.dragStart`, `dragOver` and `drop` and a stub `dataTransfer`. Cover:
  - a drop on another group sends `group.assign`;
  - a drop on its own group sends nothing;
  - a drop on a collapsed group's heading sends `group.assign`;
  - the section has `drop-target` during `dragOver` and loses it after `dragEnd`.
  Verify that the tests pass.

## 4. Verification

- [x] 4.1 In the running app, move a token by menu and by drag, then undo each from the activity log. Verify that the token returns to its previous group each time.
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` and `openspec validate roster-group-move --strict`, and confirm both pass.
