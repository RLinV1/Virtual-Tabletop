# Tasks

## 1. Lift the editing token to RoomPage

- [x] 1.1 Replace `TokenRoster`'s local `editingId` state with `editingTokenId` / `onEditToken(id | null)` props, threaded through `RoomPanel`. Edit, close, save, duplicate and delete call `onEditToken`. Verify `npm run typecheck` passes and the existing `tokenEditor`, `tokenGroups` and `tokenAttacksUi` web tests still pass.
- [x] 1.2 In `RoomPage`, hold `editingTokenId` and implement `onEditToken`: switch to the `tokens` tab; if the sidebar is collapsed, open it and set the id after the sidebar-open wait. Move `onGuide`'s 220 ms / reduced-motion wait into one shared helper that both use. Verify in the running app (`npm run dev`) that Edit from a collapsed sidebar on the Play tab opens the editor on the Tokens tab.
- [x] 1.3 Reset `editingTokenId` to `null` in `RoomPage` when `state.tokens[editingTokenId]` is missing, so undoing a delete doesn't reopen the editor. Verify with a test, or by deleting a token in one tab while editing it in another and then undoing.

## 2. Board token card

- [x] 2.1 Extract the inline token card in `board/Board.tsx` into `board/TokenCard.tsx` (`token`, `state`, `you`, `onClose`, `onEdit?`, `onDuplicate?`), with no visual change. Verify that the card looks the same in the running app and `npm run typecheck` passes.
- [x] 2.2 Add Edit (shown when `can.editToken`) and Duplicate (GM only) to `TokenCard`. Both clear the selection when pressed. In `Board`, move the `duplicateToken` handle body into a local function that both the handle and the card use, and add an `onEditToken` prop that `RoomPage` passes. Verify that pressing Duplicate on the card starts the existing placing flow (placement bar shows "Placing Goblin") and that Esc ends it.
- [x] 2.3 Add `apps/web/test/tokenCard.test.tsx` (`describe("board token card actions (FR-GM-08, token-card-actions)")`): GM sees Edit and Duplicate; owner sees only Edit; non-owner player sees neither; each button calls its callback with the token id. Verify the test passes.

## 3. Sidebar roster row

- [x] 3.1 Add a GM-only Duplicate link button with `aria-label="Duplicate <name>"` next to Edit in `RosterRow`, calling `onDuplicateToken(token.id)`. Switch Edit's check from `can.moveToken` to `can.editToken`. Verify in the running app that roster Duplicate starts placement, and that each click places one copy until Esc.
- [x] 3.2 Extend the roster tests (`tokenGroups.test.tsx` or a new `tokenRosterActions.test.tsx`, referencing FR-GM-08): GM rows show Duplicate and Edit; a player's row shows Edit only on their own token and never shows Duplicate; pressing Duplicate calls `onDuplicateToken` with the id. Verify the tests pass.

## 4. Verification

- [x] 4.1 Run `npm run lint && npm run typecheck && npm test` and confirm everything passes.
- [x] 4.2 Run `openspec validate token-card-actions --strict` and confirm the change is valid.
