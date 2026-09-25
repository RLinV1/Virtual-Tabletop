## Context

See proposal.md (Why) and `specs/token-names/spec.md` for the requirements. This section covers only the code facts that shape the approach.

- `token.create` already goes through `decide` (`packages/shared/src/decide.ts:63`), GM-only, inside `LiveRoom`'s per-room ordered queue. So a check there always runs against up-to-date state, and two concurrent creates are serialized for free. Unlike KAN-61, no server route has to change.
- `TokenCreated` carries the full `Token`, including `name`. `reduce` copies it as-is. If `decide` puts the final name in the event, replay reproduces it without running the numbering again.
- `TokenDeleted` removes the token from `state.tokens`. So "tokens that currently exist" is just `Object.values(state.tokens)`. No extra status is needed.
- KAN-61 added `normalizeDisplayName(name)` (NFC, trim, `toLocaleLowerCase("en-US")`) in `decide.ts`. Token names need exactly the same comparison.
- No command renames a token today. `token.setStats` / `setConditions` never touch `name`.
- The only UI that sends `token.create` is `apps/web/src/panels/AddToken.tsx`. It closes the modal on success and does not show the name it sent anywhere, so a numbered name needs no client change. The roster and activity log read the name from state.

## Goals / Non-Goals

**Goals:**
- One pure numbering function in `packages/shared`, computed from `RoomState` only.
- Make the common "place five goblins" case take no extra effort.

**Non-Goals:**
- A token rename command or UI. The helper for a future rename is added (D5), the command is not.
- Fixing duplicates that already exist in stored rooms. `reduce` does no validation, so old events replay unchanged.
- Numbering in the client before sending. The server decides, per invariant 7.
- Any schema, event or `RejectionCode` change, or an ADR.

## Decisions

**D1. Share one normalizer.** Rename `normalizeDisplayName` to `normalizeName` and keep `normalizeDisplayName` as an exported alias so KAN-61 callers and tests do not change. Token names use `normalizeName`.
- *Alternative: a separate `normalizeTokenName`.* Rejected. Two copies of the same rule would drift apart.

**D2. `uniqueTokenName(state, name): string` in `decide.ts`.** Steps:
1. `trimmed = name.trim()`. The `token.create` case rejects a blank result with `invalid` before calling this.
2. If `!isTokenNameTaken(state, trimmed)`, return `trimmed`.
3. Otherwise split off a trailing ` <digits>` suffix: `base = trimmed.replace(/\s+\d+$/, "")`. If that leaves an empty string (the name was just "12"), use `base = trimmed`.
4. Build the set of normalized names in use once. For `n = 2, 3, …`, form `candidate = fit(base, n)` and return the first candidate that is not in the set.
5. `fit(base, n)` shortens `base` (then trims its end) so `` `${base} ${n}` `` is at most 60 characters.

The loop ends after at most `tokens + 1` steps, because each token can hold only one number. It uses nothing but `state`, so it is deterministic (invariant 2). The result is written into `TokenCreated.token.name`, so replay never calls this function.
- *Alternative: "Goblin (2)".* Rejected. The ticket asks for "Goblin 2", and it is shorter in the roster.
- *Alternative: number from the highest existing suffix (max + 1).* Rejected. The spec asks for the lowest free number, so deleting "Goblin 2" frees it.
- *Alternative: always number, starting at "Goblin 1".* Rejected for now. The ticket's open question assumes a lone token stays plain. Changing this later only changes step 2.

**D3. Hidden tokens count, and the small leak is accepted.** The GM's roster shows hidden tokens, so they must be unique too. A player who sees "Goblin 2" appear can guess that some other "Goblin" exists. This does not reveal where it is, what it is, or that it is hidden (it may simply be off-screen). The GM can avoid it by naming the hidden token something else.
- *Alternative: number only against tokens the viewer can see.* Rejected. The GM sees every token, so the GM's roster would still have duplicates. Numbering also depends on who created the token, not on who is looking, so a per-viewer name is not possible.

**D4. Blank names use `invalid`.** `token.create` returns `reject("invalid", "Token name cannot be blank.")` when the trimmed name is empty. The zod `min(1)` still catches `""`. This only adds the whitespace-only case.

**D5. Rename helper for later.** `isTokenNameTaken(state, name, exceptId?)` is exported. A future `token.rename` must reject a taken name with `invalid` rather than number it, and must allow a change of case on its own name through `exceptId`. That rule is recorded here and in the ticket. It gets a spec requirement when the rename command is proposed.

## Risks / Trade-offs

- [Rooms that already have duplicate names] → They stay as they are. New creates are numbered against them, so the next "Goblin" becomes "Goblin 3" if "Goblin" and another "Goblin" already exist.
- [The GM types "Goblin" and gets "Goblin 2" without being told] → The new token shows up in the roster and the activity log with its real name. A short hint in the Add Token modal is optional (task 3.1).
- [A hidden token's name hints that it exists] → See D3.
- [Look-alike characters from different scripts] → Not handled, the same as KAN-61. NFC normalization covers composed and decomposed forms.

## Migration Plan

No data migration is needed. Only the server behavior changes. An older web client works unchanged. To roll back, revert the commit. Tokens created while the change was live keep their numbered names.
