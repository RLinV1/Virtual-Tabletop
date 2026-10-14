## 1. Contract (ADR first)

- [ ] 1.1 Write `docs/adr/0033-duplicate-at-position.md`: an optional `position` on `token.duplicate`, no new events, backwards-compatible, deploy the server first (design D4). Request review from the Real-Time Architecture owner. Verify the ADR is linked from `docs/DESIGN.md`'s ADR list.
- [x] 1.2 In `packages/shared/src/commands.ts`, add `position: Point.optional()` to `token.duplicate`. In `decide.ts`, with `position`, check walls, call `createTokens` from `position` without `besideOrigin`, and keep the `TokensGrouped` event. Verify `npm run typecheck`.
- [x] 1.3 In `packages/shared/test`, add `describe("... (KAN-82)")` cases. Verify with `npm test --workspace=@vtt/shared`:
  - A duplicate at a position lands there.
  - It joins the original's group in the same decision.
  - A hidden original gives hidden copies.
  - A position across a wall is rejected.
  - Without `position`, behaviour is unchanged.
- [x] 1.4 Add an `apps/server/test` integration test. Verify it with `npm test --workspace=@vtt/server -- -t "duplicate"`:
  - A GM `token.duplicate` with `position` reaches a player only when the copy isn't hidden.
  - A player's forged one is refused.

## 2. One repeating placing mode

- [x] 2.1 In `board/Board.tsx`, change `placing` to `{ source, placed, busy, error, cursor }` (design D1). `place` sends one token per click and stays in placing mode. Add `BoardHandle.duplicateToken(tokenId)`. Verify `npm run typecheck`.
- [x] 2.2 Remove Place automatically and its focus ref. The placement bar shows "N placed" and Cancel, which reads Done once something is placed (D2). Verify in `npm run dev` that three clicks make Goblin, Goblin 2 and Goblin 3, and that Esc ends with all three kept.
- [x] 2.3 Keyboard placement (D3):
  - The board takes focus when placing starts.
  - A cursor starts at the map's centre square.
  - Arrows move it, clamped to the map.
  - Enter places one.
  - A live region announces each move and placement.
  - `BoardView.setPlacementCursor` drives the ghost.

  Verify keyboard-only in `npm run dev`: New Token, Enter, right, right, Enter, Esc places one token two squares right of centre.

## 3. Entry points

- [x] 3.1 In `panels/AddToken.tsx`:
  - Remove the count field.
  - Move the creature-to-draft code into a shared helper.
  - Render **New Token** (the form, keeping From creature) and **Saved Creatures** (signed in only).

  Verify that a signed-out GM sees only New Token.
- [x] 3.2 Saved Creatures dialog (D5): a "Hidden from players" checkbox (unticked on open) above `CreaturePicker`. Picking a creature closes the dialog and starts placing after it closes. Verify that an Ogre placed with Hidden ticked never reaches a second browser joined as a player.
- [x] 3.3 In `panels/TokenRoster.tsx`, Duplicate drops its count input and calls `duplicateToken`. Verify that duplicating a grouped Goblin onto two squares adds two copies to the group, with one undo per copy.

## 4. Tests, docs and checks

- [x] 4.1 In `apps/web/test`, cover:
  - The shared creature-draft helper (Hidden, no owner, feature gating).
  - That the placing state never puts `count` other than 1 or extra fields into the command.
  - That AddToken has no count field.

  Verify with `npm test --workspace=@vtt/web`.
- [x] 4.2 Update the `ui/guide.ts` token text (New Token, Saved Creatures, repeating placement, keyboard placement) and the `docs/DESIGN.md` notes. Verify by reading the guide's token step as GM.
- [x] 4.3 Run `npm run lint && npm run typecheck && npm test` and confirm all pass.
- [x] 4.4 Before archiving this change, archive `kan-70-creature-templates` and `kan-82-duplicate-tokens-and-groups` so this change's `library-creatures` and `token-duplication` deltas can sync. Verify with `openspec validate token-placement-flow --strict`, which should show no "Archive would refuse" notes.
