## Why

KAN-70 asks for reusable token templates. Library creatures (ADR 0012, `b2fdf58`) already deliver the core: a GM saves a creature with name, size, Max HP, AC and art, and places it from Add Token, with values copied into the room and nothing about the creature reaching players. Four parts of the ticket are still missing:

- A creature has no **colour**, so imageless creatures always place in the default red.
- A creature has no **starting conditions**. A "Goblin (prone)" or a summoned "Invisible stalker" has to be set by hand after every placement.
- There is no **"Save as creature"** from a token already on the board. A GM who builds a monster mid-session has to retype it in the library.
- There is no **"Add ×N"**. Four goblins means four trips through Add Token and four clicks on the map.

In this codebase the ticket's "template" is a library **creature**, so this change extends creatures rather than adding a parallel concept.

## What Changes

- Creatures gain `color` (hex, default the token default) and `conditions` (up to 12 condition ids, default none). DB migration adds two columns. Existing creatures keep working with the defaults.
- `token.create` gains optional `conditions` (default `[]`) and `count` (1–20, default 1). With `count > 1`, `decide` emits that many `TokenCreated` events in one command. Positions spread out from the clicked square to the nearest free squares, and names follow the existing numbering rule ("Goblin", "Goblin 2", "Goblin 3").
- Add Token's "From creature" fills colour and conditions too, and offers a count field (1–20).
- GM token editor gains **Save as creature**. It opens the creature form prefilled from the token (name, size, Max HP, AC, colour, conditions, and its art when that art is the GM's own token art) and saves through the existing creature API.
- Numbering uses the existing token-names rule, not "Goblin 1". The rule already ships and players are used to it.
- **Schema change** in `packages/shared` (`token.create` fields, `CreatureFields`): needs an ADR amending ADR 0012 and Real-Time Architecture owner review.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `library-creatures`: creatures gain colour and starting conditions; placement copies them and can place several at once; a placed token can be saved as a creature.

## Impact

- `packages/shared`: `commands.ts` (`token.create`), `decide.ts` (multi-create, free-square spreading), `protocol.ts` (`CreatureFields`, `LibraryCreature`).
- `apps/server`: Prisma migration `library_creatures.color`, `library_creatures.conditions`; creature routes and stores (memory and Postgres).
- `apps/web`: `panels/AddToken.tsx`, the creature form in `pages/LibraryPage.tsx` and `creatureDraft.ts`, and the token editor (Save as creature).
- Tests across shared, server and web.
