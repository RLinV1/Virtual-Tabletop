## Context

- **What the room stores.** `Token.attacks` (`TokenAttacks`: at most 8, unique names ignoring case) is set by `token.create` (from creatures) and `token.duplicate`. Nothing changes it afterwards: `TokenUpdate` has no `attacks`.
- **Who sees it.** `filterStateForViewer` → `tokenForViewer` strips `attacks` for players who don't own the token. `TokenOwnersSet` resyncs a player whose ownership of a token with attacks changes.
- **What the Attack section edits.** It reads `presetsForToken`: the browser's `vtt.attack.presets[tokenId]`, else the legacy `vtt.attack.saved` (migrated), else `token.attacks`. It writes only to `vtt.attack.presets`.
- **Save as creature** reads `browserTokenAttacks(token)`.
- **`token.configure`** is already authorized with `can.editToken` (`decide.ts:68`: the GM, or an owner of the token). The fields name, position, size, rotation, image, owners and hidden are GM-only. Stats and conditions are owner-allowed and emit `TokenStatsSet` / `TokenConditionsSet` with `previous`, which `undo.ts` can reverse.
- **Undo** (`history.undo`) is GM-only.

## Goals / Non-Goals

**Goals:** one copy of each token's attacks, in the room, edited the same way from the token editor and the Attack section, by the GM and owners.

**Non-Goals:** merging edits made at the same moment; moving attacks saved only in a browser; undo for players.

## Decisions

### D1. An owner-allowed `attacks` field on `token.configure`, not a new command

`TokenUpdate` gains `attacks: TokenAttacks.optional()`. In `decide`:
- It is **not** in the GM-only field list, so `can.editToken` already allows the GM and the token's owners. A hidden or fogged token stays `not_found` for a player, through the existing `concealedFrom` check.
- `presetRefusal` gets `attacks: changes.attacks !== undefined` (refused while the preset has attacks off).
- When the new list differs from `token.attacks ?? []`, it emits `TokenAttacksSet { tokenId, attacks, previous }`, ordered like the other edit events.

*Alternative:* a separate `token.setAttacks` command, as first discussed. Rejected because `token.configure` already has exactly the GM-or-owner rule. The token editor already sends one `token.configure` per save, so attacks join stats and conditions in the same action and the same undo entry.

### D2. `TokenAttacksSet` event, reducer, visibility, undo, log

- **reduce:** set `token.attacks`.
- **filterEventForViewer:** pass for the GM and the token's owners, unless the token was hidden from them (the same `hiddenBefore` rule as the other token edits). Redacted for every other player. Snapshots already strip attacks, so a reload never leaks them.
- **undo:** add the event to the reversible set. The inverse swaps `attacks` and `previous`. The conflict check compares `token.attacks` with the event's `attacks`, as for stats.
- **activityLog:** "<actor> set <token>'s attacks to Scimitar, Bite" ("none" when empty), like the conditions entry. The log is GM-only (`room-activity-log`), so naming the attacks reveals nothing to players.

### D3. One way to edit attacks, used in two places

The Attack section's attack list and `PresetEditor` already handle add, edit and remove, plus the limits. A small `useTokenAttacks(connection, token)` helper builds the new list and sends `token.configure { tokenId, changes: { attacks } }`. Both the Attack section's `onPresets` and the token editor's Attacks section use it.

In the token editor, attack edits are part of the form: they're sent with the form's other changes on **Save**, so one Save is one action. The Attack section saves each add, edit or remove at once, as it does today.

### D3a. A collapsible Attacks section in both dialogs

The token editor already groups sections in `<details className="token-editor-section">` with a count in the `<summary>` ("Conditions · none"). Attacks follows that pattern, closed by default: `<summary>Attacks<span className="token-editor-summary">{n || "none"}</span></summary>`. New Token uses the same markup next to its "Advanced settings" `<details>`.

One `AttackListEditor` component (the list, Add attack, and `PresetEditor` in a stacked modal for Edit and Remove) is used by both dialogs and works on a local list. Each dialog decides when to send: the token editor on Save as `token.configure { attacks }`, and New Token in the draft's `attacks` on placing. New Token's `attacks` state already exists (filled by From creature); it gains this UI. The section is hidden when the room's preset has attacks off, matching `tokenDraftFor`'s gating.

### D4. Browser storage cleared

`presetsForToken` becomes `token.attacks ?? []`. The `vtt.attack.presets` and `vtt.attack.saved` persistent states, their validators, the migration from the legacy format, and `readTokenAttacks` / `browserTokenAttacks` are deleted. On room load, a one-off `clearLegacyAttackStorage()` removes both keys inside try/catch (storage may be blocked).

Save as creature uses `token.attacks`.

### D5. Contract, ADR 0034

The added `TokenUpdate.attacks` field and the new `TokenAttacksSet` event are written up in `docs/adr/0034-shared-token-attacks.md` for review by the Real-Time Architecture owner. `TokenUpdate` is `.strict()`, so an older server refuses a configure carrying `attacks`. The server and web app ship together, as for ADR 0033.

## Risks / Trade-offs

- [Attacks saved only in a browser are lost] → Decided. The activity log can't restore them, because they were never in the room.
- [Edits at the same moment] → The last write wins, and the other device gets it live. The GM can undo.
- [An owner edits a token's attacks while the GM is in its editor] → The editor sends attacks only when the GM changed them in the form (the same dirty check as stats), so an unrelated Save doesn't overwrite the owner's edit.
- [Players' undo] → Not offered. The GM can undo any player's change.
