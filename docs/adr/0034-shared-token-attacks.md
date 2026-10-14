# ADR 0034 — Shared token attacks

**Status:** Proposed — awaiting review by the Real-Time Architecture owner (Raymond) · **Amends:** `docs/adr/0020-creature-templates.md` (`token.attacks`), `docs/adr/0013-undo.md` (reversible set)
**Owner:** Real-Time Architecture (Raymond) · **Change:** `openspec/changes/shared-token-attacks` · **Requirements:** FR-TAC-07

## Context

`Token.attacks` is set when a token is created (from a creature, or by Duplicate) and nothing can change it afterwards. The Attack section keeps edits in the browser that made them (`vtt.attack.presets`), so the token's owner and the GM's other devices never see them. Attacks are to become room state, edited from the token editor, New Token and the Attack section by the GM and the token's owners.

## Decision

- **Command:** `TokenUpdate` gains `attacks: TokenAttacks` (optional; at most 8, unique names ignoring case, the existing dice limits). It is **owner-allowed**, like `stats` and `conditions`: `token.configure`'s existing `can.editToken` check (the GM, or an owner of the token) applies. It is refused while the room's preset has attacks off.
- **Event:** `TokenAttacksSet { tokenId, attacks, previous }`, emitted only when the list changes, in the same decision as the configure's other edits.
- **Visibility:** the event passes to the GM and the token's owners, unless the token was hidden from them, and is redacted for every other player. Snapshots already strip `attacks` for non-owners, so reconnects stay consistent.
- **Undo:** reversible (the inverse swaps `attacks` and `previous`), with the usual "still current" conflict check. Undo stays GM-only.
- **Client:** the browser stores `vtt.attack.presets` and `vtt.attack.saved` are no longer read and are cleared on room load. Attacks saved only in a browser are not moved into the room.

## Consequences

- Additive for old clients.
- `TokenUpdate` is `.strict()`, so an old server refuses a configure carrying `attacks`. The server and web app ship together.
- The activity log, being GM-only, names the attacks in its entry.
