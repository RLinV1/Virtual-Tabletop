## Why

A token's named attacks are edited only in the Attack section, and those edits stay in the browser that made them (`vtt.attack.presets`). The room's copy, `token.attacks`, is set once when the token is created and can never change. So when the GM gives a goblin a new attack, the player who owns that goblin never sees it, nor does the GM on another device. The room's token editor, where every other token detail is edited, has no attacks at all.

## What Changes

- **Attacks are room state.** `token.attacks` becomes the only source of a token's named attacks, kept on the server and synced to every device of the GM and the token's owners.
- **Edited from the token editor and New Token.** The room's token editor and the New Token form each gain an **Attacks** section that collapses within the dialog, closed when it opens, with the number of attacks in its heading ("Attacks · 2"). Open, it lists the attacks with Add attack, Edit and Remove. It uses the same attack editor and limits as the Attack section: at most 8, unique names, the existing dice limits. In New Token, the section shows and edits the attacks a creature filled in, or attacks typed for a new token, and they are placed with the token.
- **Attack section edits are shared too.** Add, edit and remove in the Attack section save to the token for everyone who may see its attacks, instead of to the browser.
- **Owners can edit.** A player can add, edit and remove attacks on tokens they own. They can't change other tokens' attacks, and they still never receive attacks of tokens they don't own.
- **Contract:** `token.configure` gains an `attacks` field, allowed for the GM and the token's owners like stats and conditions. A new `TokenAttacksSet { tokenId, attacks, previous }` event is filtered to the GM and owners. The GM can undo it from the activity log. This needs an ADR and review by the Real-Time Architecture owner.
- **BREAKING (browser data):** attacks saved only in a browser (`vtt.attack.presets` and the older `vtt.attack.saved`) are no longer read and are cleared on load. Attacks on tokens that came from creatures or Duplicate are unaffected, because they are already in `token.attacks`.
- **Save as creature** uses the token's attacks, not the browser's.

## Non-goals

- Merging edits made at the same moment by two people. The later save replaces the list.
- Moving attacks made only in a browser into the room. They are cleared, by decision.
- Editing attacks of tokens a player doesn't own, or undo for players.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `attack-rolls`: "Named attacks" (browser-only) is removed and replaced by "Shared named attacks". The new requirement covers storage on the token, editing from the Attack section and the token editor, owner editing, privacy and undo.
- `library-creatures`: "Named template attacks" saves a token's own attacks as a creature, not the browser's.

## Impact

- **`packages/shared`:**
  - `commands.ts` (`TokenUpdate.attacks`), `events.ts` (`TokenAttacksSet`).
  - `decide.ts`: owner-allowed field; `presetRefusal` when attacks are off.
  - `reducer.ts`.
  - `visibility.ts`: the event reaches the GM and owners only.
  - `undo.ts`: reversible.
  - `activityLog.ts`.
  - Tests.
- **`apps/server`:** an integration test (an owner's edit reaches the GM, another player gets nothing, a forged edit to another's token is refused).
- **`apps/web`:**
  - `panels/AttackPanel.tsx` and `panels/attackRoll.ts`: shared presets; local stores dropped and cleared.
  - `panels/TokenRoster.tsx`: a collapsible Attacks section in the token editor; Save as creature reads `token.attacks`.
  - `panels/AddToken.tsx`: a collapsible Attacks section in New Token.
- **Docs:** `docs/adr/0034-shared-token-attacks.md`.
