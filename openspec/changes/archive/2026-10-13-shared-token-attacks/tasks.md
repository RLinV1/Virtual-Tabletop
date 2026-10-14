## 1. Contract (ADR first)

- [ ] 1.1 Write `docs/adr/0034-shared-token-attacks.md`: `TokenUpdate.attacks` (owner-allowed), the `TokenAttacksSet` event with `previous`, the visibility rule, undo, and that the server and web app ship together. Add it to `docs/DESIGN.md`'s document table. Request review from the Real-Time Architecture owner.
- [x] 1.2 In `packages/shared`:
  - Add `attacks: TokenAttacks.optional()` to `TokenUpdate` and the `TokenAttacksSet { tokenId, attacks, previous }` event.
  - In `decide`, make it owner-allowed, refuse it while attacks are off, and emit the event only when the list changed.
  - In `reduce`, set `token.attacks`.

  Verify `npm run typecheck`.
- [x] 1.3 In `visibility.ts`, send `TokenAttacksSet` to the GM and the token's owners (applying `hiddenBefore`) and redact it for other players. In `undo.ts`, make it reversible with a conflict check. In `activityLog.ts`, describe it. Verify `npm run typecheck`.
- [x] 1.4 Add `packages/shared/test` cases under `describe("... (FR-TAC-07)")`. Verify with `npm test --workspace=@vtt/shared`:
  - The GM and an owner can set attacks.
  - A non-owner player is refused as forbidden.
  - A hidden or fogged token is `not_found` for a player.
  - Over 8 attacks, or duplicate names, are refused.
  - Attacks are refused while the preset has them off.
  - An unchanged list emits nothing.
  - Undo restores the previous list.
  - The filter passes the event to the GM and owners and redacts it for another player.
  - The log text.
- [x] 1.5 Add an `apps/server/test` integration test: an owner's attack change reaches the GM live; another player's raw log never contains the attack name; a forged change to another's token is refused; after reconnect, the snapshots match `viewFor`. Verify with `npm test --workspace=@vtt/server -- -t "attacks"`.

## 2. Web app

- [x] 2.1 In `panels/attackRoll.ts` and `AttackPanel.tsx`:
  - `presetsForToken` becomes `token.attacks ?? []`.
  - Delete the `vtt.attack.presets` and `vtt.attack.saved` states, their validators, the legacy migration and `readTokenAttacks` / `browserTokenAttacks`.
  - The Attack section's add, edit and remove send `token.configure { attacks }` through a shared helper (D3).

  Verify that an edit in a GM browser appears in a second browser joined as the owner.
- [x] 2.2 Add `clearLegacyAttackStorage()` on room load, removing both keys inside try/catch. Verify with a unit test using a storage stub.
- [x] 2.3 Add a shared `AttackListEditor` (list, Add attack, and `PresetEditor` for Edit and Remove) working on a local list (D3a). In the token editor (`panels/TokenRoster.tsx`), add it inside a closed-by-default `<details className="token-editor-section">` headed "Attacks" with the count, shown to the GM and the token's owners when the preset has attacks on. Its changes are sent with the form's Save, only when changed. Verify that an owner can open the section and add an attack to their own token from its editor.
- [x] 2.3a In New Token (`panels/AddToken.tsx`), add the same collapsible Attacks section, closed by default with the count in its heading. It edits the existing `attacks` state (filled by From creature), hidden when the preset has attacks off. Verify that From creature → Goblin shows "Attacks · 2" closed, and that a Bite added there is on the placed token.
- [x] 2.4 Make Save as creature read `token.attacks`. Verify with the existing `creatureFromToken` tests, updated.
- [x] 2.5 Add or update `apps/web/test` cases. Verify with `npm test --workspace=@vtt/web`:
  - The token editor's Attacks section is a closed collapsible with the count, for the GM and an owner, and absent for another player.
  - Save sends `attacks` only when changed.
  - New Token's Attacks section is closed with the count, and its attacks reach the draft.

## 3. Checks

- [x] 3.1 Run `npm run lint && npm run typecheck && npm test` and confirm all pass.
