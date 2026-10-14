## Context

- **The path today.** `AddTokenButton` (`panels/AddToken.tsx`) runs `AddToken` in a modal. On submit it hands a `TokenDraft` (a `token.create` minus `position`) to `onPlaceToken`, which runs RoomPage → `BoardHandle.placeToken` → `Board`'s `placing` state `{ draft, busy, error }`.
- **Placing.** `Board.place` spreads the draft into `token.create` with the clicked `position`. It ends placing when `count` runs out. The placement bar offers Place automatically (`autoPlacementPoint`, which gets focus) and Cancel. The ghost comes from the draft.
- **Duplicate** (`panels/TokenRoster.tsx`) sends `token.duplicate { tokenId, count }`. `decide` copies the original server-side and calls `createTokens(..., { besideOrigin: true })`, then emits `TokensGrouped` when the original is grouped.
- **The creature list.** `CreaturePicker` (`pages/LibraryCreatures.tsx`) is a searchable list that calls `onPick`. `creatureDraft` turns a creature into token values.

## Goals / Non-Goals

**Goals:**
- One placing mode, used by all three entry points, that repeats until ended.
- Keyboard placement inside that mode.
- Duplicate kept server-side and atomic per copy.

**Non-Goals:**
- Changing `token.create`.
- Removing `count` from either schema.
- Placing several creature types without reopening the picker.

## Decisions

### D1. A placing source, with repeat built in

`placing` becomes `{ source, placed, busy, error, cursor }`:

- `source` is either `{ kind: "create", draft: TokenDraft }` or `{ kind: "duplicate", tokenId, ghost: TokenDraft-shaped look }`.
- `placed` counts the tokens created in this placement.

`place(at)` sends one of:
- `{ ...draft, count: 1, position: at }`
- `{ type: "token.duplicate", tokenId, position: at }`

On success it increments `placed` and keeps placing. On rejection it keeps the source and shows the reason, as today.

`count` is never read from the draft again, and `AddToken` stops producing it. No repeat flag goes into a command; repeating is just the absence of an end.

`BoardHandle` gains `duplicateToken(tokenId)`. It builds the ghost from the token as the GM sees it and starts placing with the duplicate source. `placeToken(draft)` stays for New Token and Saved Creatures.

*Alternative:* a `repeat` field on `TokenDraft`. Rejected because the draft is spread into the command, so the field would reach the server.

### D2. Ending placing

The existing ends stay: Esc, right-click, Cancel, and picking a board tool. `readOnly` (View as player) also ends placing, as today.

There's no "done after N". The placement bar reads "Placing **Goblin**: click squares to add more · 3 placed", plus Cancel, which is labelled "Done" once at least one token is placed. Place automatically and `placeAutomaticallyRef` are removed. `autoPlacementPoint` stays in `placement.ts`, which the server-side spread doesn't use, and tests still cover it, but the board no longer imports it.

### D3. Keyboard placement

When placing starts, the board container (`hostRef`, made focusable with `tabIndex={-1}` and an `aria-label`) receives focus instead of the removed button. `cursor` starts at the square nearest the map centre, using `snapTokenCenter` on the map's middle.

- **Arrows:** move `cursor` by one `grid.cellSize`, clamped to the map.
- **Enter:** calls `place(cursor)`.
- **Esc:** handled by the existing listener.

The ghost follows `cursor` after a key and follows the pointer after a mouse move; whichever moved last wins. That's `BoardView.setPlacement` with an explicit hover point, added as `setPlacementCursor(point)`.

A visually hidden live region in the placement bar announces "Goblin at column 8, row 5" on each move, and "Goblin 3 placed" after each success. Arrow keys are only captured while placing and the board has focus, so panel inputs still work.

### D4. `token.duplicate.position` (contract, ADR 0033)

The `token.duplicate` schema gains `position: Point.optional()`.

In `decide`, when `position` is present:
1. Check walls at `position`, as `token.create` does.
2. Call `createTokens(state, { ...copy, position }, command.count, ctx)` without `besideOrigin`.
3. Add the same `TokensGrouped` event for a grouped original.

When `position` is absent, behaviour is byte-for-byte today's. `reduce` and the visibility filters are untouched, because the events are the existing `TokenCreated` and `TokensGrouped`.

The ADR records the addition: optional, backwards-compatible, and with no new events. It goes to the Real-Time Architecture owner for review, per CLAUDE.md.

### D5. The Saved Creatures dialog

`AddTokenButton` becomes `AddTokenButtons`, which renders two buttons.

**Saved Creatures** opens a `Modal` titled "Saved creatures":
- A **Hidden from players** checkbox, unticked whenever the dialog opens.
- `CreaturePicker` below it.

`onPick` builds the draft as `AddToken` does for From creature: `creatureDraft(creature)` plus `name`, `ownerIds: []`, `hidden`, preset feature gating (AC, conditions, attacks) and the colour fallback. It closes the modal and calls `onPlace` from `onAfterClose`, as New Token does, so the board takes focus after the dialog has gone.

The draft-building code is moved into a shared helper in `AddToken.tsx`, so From creature and Saved Creatures can't drift apart.

## Risks / Trade-offs

- [Contract change] → It's optional and additive, so older clients keep sending `{ tokenId, count }`. The ADR and the owner's review come first (task 1).
- [Arrow keys on the board conflicting with other shortcuts] → They're captured only while placing with board focus; `isTyping` and open dialogs are excluded, as for the Esc handler.
- [No more "N at once" in the UI] → It was requested. The command still accepts `count`, so scripts and older clients aren't broken.
- [Spec dependencies] → `kan-70-creature-templates` (1 open task: ADR 0020 sign-off) and `kan-82-duplicate-tokens-and-groups` must be archived before this change, or its `library-creatures` and `token-duplication` deltas can't sync.

## Migration Plan

Deploy the server before or with the web app. An old web app against a new server is unaffected. A new web app against an old server would send `position`, which the old server's `.strict()` schema rejects, so Duplicate would fail with a validation error until the server is updated. Deploy them together, server first.

## Open Questions

- Should Duplicate's ghost show the original's art dimmed like a hidden token when the original is hidden? Default: yes, using the same hidden appearance as the placement ghost for a hidden draft.
