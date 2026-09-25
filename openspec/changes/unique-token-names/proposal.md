## Why

Nothing stops two tokens in the same room from having the same name. `Token.name` is only checked for length (`packages/shared/src/state.ts:36`). The token roster (KAN-53), the initiative tracker (FR-GM-21), roster search and the activity log all show tokens to the GM by name. With two tokens called "Goblin", the GM cannot tell which row is which creature. Tracked as KAN-62, a sibling of the display-name rule in KAN-61.

## What Changes

- When the GM creates a token whose name is already used by another token in the room, `decide()` gives the new token a numbered name instead: a second "Goblin" becomes "Goblin 2", a third becomes "Goblin 3". Placing five goblins stays a one-click action. The GM never has to type distinct names, and nothing is rejected.
- Numbering uses the lowest free number, starting at 2. Deleting "Goblin 2" frees that name for the next goblin. A lone token keeps its plain name ("Goblin", not "Goblin 1").
- Names are compared after trimming surrounding whitespace and ignoring case, using the same normalization as display names (KAN-61). "goblin" and "Goblin " collide with "Goblin".
- Only tokens that currently exist in the room hold a name. A deleted token does not block reuse of its name.
- Hidden tokens count. The GM's roster lists them too, so they must be unique as well.
- Token names are stored trimmed. A name that is blank after trimming is rejected with `invalid`.
- If the typed name already ends in a number and is taken ("Goblin 2" when "Goblin 2" exists), the trailing number is treated as the suffix and the lowest free number for "Goblin" is used, not "Goblin 2 2".
- The numbered name always fits the 60-character limit. The base is shortened when needed so the suffix is never cut off.
- The numbering is computed inside `decide()` from the current room state only. There is no `Math.random` and no `Date`, so replay and the room's ordered queue give the same result every time. `TokenCreated` carries the final name, and `reduce` does not change.

No zod schema in `packages/shared` changes shape, and no new command or event is added, so no ADR is needed. There is no token rename command today. This change adds the helper that a future rename would use to reject a taken name (see design D5), but adds no rename itself.

## Capabilities

### New Capabilities
- `token-names`: how tokens are named within a room so that each name points at exactly one token. This change adds the uniqueness rule and auto-numbering on create.

### Modified Capabilities
<!-- None. room-participants covers people, not tokens. -->

## Impact

- `packages/shared/src/decide.ts`: new `isTokenNameTaken(state, name, exceptId?)` and `uniqueTokenName(state, name)`. The `token.create` case trims the name, rejects a blank one, and uses the numbered name. `normalizeDisplayName` is reused for token names (renamed or aliased to a neutral `normalizeName`; see design D1).
- `apps/web/src/panels/AddToken.tsx`: no change needed. The roster, board and activity log already show the name from `TokenCreated`. A short hint under the name field is optional (task 3.1).
- Tests: `packages/shared/test/decide.test.ts` (collisions, lowest free number, reuse after deletion, trimming, trailing numbers, length limit, hidden tokens) and `apps/server/test/sync.test.ts` (two concurrent creates of the same name produce "Goblin" and "Goblin 2").
- Visibility: a player who sees "Goblin 2" can guess that some other "Goblin" exists, even if it is hidden. This is accepted and explained in design D3.
