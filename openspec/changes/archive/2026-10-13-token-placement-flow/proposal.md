## Why

Putting a saved creature on the board takes two stacked dialogs. You open Add token, then From creature, then pick the creature, then Choose a square. Each token is a separate trip, unless you guessed the count up front. Duplicate has its own count box and spreads copies automatically around the original. During play a GM wants the opposite: pick what to place, then click where each one goes until done.

## What Changes

- **Two buttons.** The Tokens section's "Add token" becomes **New Token** (today's form) and **Saved Creatures**. Saved Creatures is shown only to a GM with a library account.
- **Saved Creatures** opens the creature picker directly in one dialog, with a **Hidden from players** checkbox above the list. Picking a creature closes the dialog and starts placing it: no owner, the chosen Hidden state, and the creature's values. Hidden is chosen before anything is created, so an ambush never reaches players.
- **New Token** keeps its form and its From creature button, so values can still be adjusted before placing. **BREAKING (UI):** the count field is removed.
- **Placement repeats.** For New Token, Saved Creatures and Duplicate, every click on the board creates one more token until the GM presses Esc or Cancel, right-clicks, or picks a board tool. The server keeps numbering names (Goblin, Goblin 2, ...).
- **Place automatically is removed.** Keyboard placement replaces it. While placing, the board takes focus, the arrow keys move the placement ghost one square at a time (starting at the map's centre), Enter places one and stays in placing mode, and Esc finishes. Each move and placement is announced to screen readers.
- **Duplicate** in the token editor no longer asks for a count. It starts repeating placement of copies of that token, and each click sends `token.duplicate` with the chosen square.
- **Contract:** `token.duplicate` gains an optional `position`. With it, the copies start on that square and spread like `token.create`'s, with the same copying and group joining as today. Without it, behaviour is unchanged. `count` stays in both `token.create` and `token.duplicate` for compatibility; the client sends 1. This is recorded in a new ADR for review by the Real-Time Architecture owner.

## Non-goals

- Changing what a copy or a creature carries, the unique-name rule, or undo.
- An inline creature list in the sidebar, or switching creature in the middle of placing without reopening the picker.
- Choosing an owner in Saved Creatures. New Token's From creature still does that.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `token-placement`: placing repeats until cancelled, and Place automatically is replaced by keyboard placement.
- `library-creatures`: Saved Creatures places a creature directly with a Hidden choice; From creature belongs to New Token; several tokens are now added by repeated placement, while the command's count stays as a server contract. **Depends on `kan-70-creature-templates` being archived first**, because it modifies that change's versions of two requirements.
- `token-duplication`: Duplicate places copies one click at a time. **Depends on `kan-82-duplicate-tokens-and-groups` being archived first** (its spec has no main copy yet).

## Impact

- **`packages/shared`:** `commands.ts` (`token.duplicate.position`), `decide.ts` (place one copy at `position`), tests in `packages/shared/test`.
- **`apps/server`:** an integration test for `token.duplicate` with `position`.
- **`apps/web`:**
  - `panels/AddToken.tsx`: New Token and Saved Creatures buttons; no count.
  - `pages/LibraryCreatures.tsx`: `CreaturePicker` with a Hidden option.
  - `panels/TokenRoster.tsx`: Duplicate starts placing.
  - `board/Board.tsx`: repeating placement, placing from a duplicate, no Place automatically, keyboard placement.
  - `board/boardView.ts`: a keyboard cursor for the ghost.
  - `board/placement.ts`: `autoPlacementPoint` is no longer used by the board.
- **Docs:** `docs/adr/0033-duplicate-at-position.md`, `ui/guide.ts`, `docs/DESIGN.md`.
