# Proposal

## Why

Every time a GM adds a monster during play, they retype its name, size, HP, Max HP and AC in Add Token. The library remembers only the art. Setup therefore happens at the table, where it slows the game down. GMs should be able to prepare reusable creatures ahead of time (FR-TAC-07 stats, FR-GM-08 token setup) and place one with its values already filled in. This is also a first step toward FR-GM-13's saved monster roster.

The library tab now called "Tokens" holds only images, so with creatures added the label becomes misleading.

## What Changes

- **Creatures in the library:** a new **Creatures** tab where the GM creates, edits and deletes creature entries. Each has a board name, a size in grid cells, an optional Max HP, an optional AC, and an optional image chosen from the GM's own uploaded token art.
- **Placing a creature:** Add Token gets **From creature**, which fills in name, size, HP (set to Max HP), Max HP, AC and image. The GM still chooses Owner and Hidden, can change any value, and then picks the square. The placed token is an ordinary token: the room does not record which creature it came from, and later creature edits do not change it.
- **Deleting token art that creatures use:** the confirmation lists those creatures as well as the rooms that show the image. Confirming deletes the image, and those creatures keep their values but lose their image, drawing as a plain colour disc.
- **Rename:** the library's **Tokens** tab becomes **Token Art**, so the tabs read Maps · Token Art · Creatures. The empty-state text and upload button say "token art". Room pickers and the internal asset kind are unchanged.
- A creature's name is entered as the name shown on the board, so it becomes the token's name when placed. A new ADR records this as a deliberate exception to ADR 0004's rule that library labels never become token names.
- Built-in example token art cannot be used by creatures and gets no creature data.

## Capabilities

### New Capabilities

- `library-creatures`: Creating, editing, deleting and listing creature entries, their ownership and validation, and placing them into a room through Add Token.

### Modified Capabilities

- `asset-library`: the browse requirement's tabs become Maps, Token Art and Creatures. The delete warning also names creatures that use the image, and confirming clears their image.
- `builtin-library-assets`: the "New GM sees the defaults" scenario refers to the Token Art tab.

## Impact

- **`packages/shared`:**
  - new zod schemas and types for creatures (a creature record and its create/update request), bounded by the existing `Token` and `TokenStats` limits
  - `LibraryUsageResponse` gains `creatures: { id, name }[]`, which is a change to an existing protocol type
  - no change to room state, commands, events, `decide`, `reduce` or visibility filters
- **`apps/server`:**
  - Prisma migration `0004` adds a `library_creatures` table. It references `library_assets` with a null-on-delete image link.
  - `LibraryStore` gains creature methods, and the memory store implements them too.
  - New GM-only routes under `/api/library/creatures`, and `/usage` includes creatures.
- **`apps/web`:**
  - `LibraryPage.tsx`: Creatures tab, creature form, tab rename, and the delete warning text.
  - `panels/AddToken.tsx`: From creature.
  - `net/api.ts`: creature calls.
- **Docs:** `docs/adr/0010-library-creatures.md`. Changing `LibraryUsageResponse` needs review by the Real-Time Architecture owner.
- **Out of scope:**
  - hiding creature or token stats from players
  - storing a current HP separate from Max HP
  - creature data on built-in example token art
  - saving whole encounters (FR-GM-13)
