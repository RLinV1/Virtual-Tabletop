# ADR 0010: Library creatures

**Status:** Proposed. Awaiting review by the Real-Time Architecture owner (Raymond). **Amends:** `docs/adr/0004-asset-library.md` (token names, the usage response)
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/library-creatures`

## Context

GMs retype a monster's name, size, HP, Max HP and AC every time they add one during play (FR-TAC-07, FR-GM-08). The asset library (ADR 0004) stores only images. GMs want reusable creatures they prepare ahead of time and can place with the values already filled in.

Tokens already carry every value a creature needs: `token.create` accepts `name`, `size`, `stats`, `imageUrl` and `assetId`. ADR 0004 also records that "a library asset's name never becomes a token's name automatically", because a visible token's name reaches players.

## Decision

### Creatures are their own resource

A creature is a row in `library_creatures`, owned by one GM identity. It has a name, a size in cells, an optional Max HP, an optional AC and an optional `image_asset_id`. It is not a new kind of library asset. An asset row describes a stored file (object key, URL, pixel size), and a creature has none of those. Creatures have their own GM-only routes under `/api/library/creatures`. They follow the library's access rules: 401 without a GM identity, and 404 for another GM's row.

The shared schemas (`CreatureFields` and the request types) are built from `Token.shape` and `TokenStats.shape`, so any saved creature produces a valid `token.create`.

### Images are the GM's own token art, linked and cleared on delete

`image_asset_id` references `library_assets` with `ON DELETE SET NULL`. When token art is deleted, the creatures using it keep their values and lose their image. This is not a cascade: no row besides the asset is removed, so ADR 0009's rule against cascading deletes still holds. The server accepts an image only if it is the caller's own token art. Another GM's asset, a map, and an unknown id all get the same 400, so the endpoint can't be used to learn which assets exist. Built-in art has no library row and can't be linked.

### Placement copies values, like map grids

Placing a creature fills in the Add Token form: name, size, `stats: { hp: maxHp, maxHp, ac }`, and the image's URL and asset id. The GM sends an ordinary `token.create`. The room never records a creature id, so room state, commands, events, `decide`, `reduce` and the visibility filters are unchanged. Editing or deleting a creature later doesn't change any placed token. The image's asset id still reaches the room, so "in use" tracking for the art keeps working.

### A creature's name is a board name

This is an exception to ADR 0004's name rule. The GM enters a creature's name as the name its tokens show, knowing players will see it, just as they would type it into Add Token. **Asset labels still never become token names.**

### The usage response lists creatures

`LibraryUsageResponse` gains `creatures: { id, name }[]`, the GM's creatures whose image is the asset. The delete confirmation lists them next to the rooms. The field is additive, and older clients ignore it.

## Consequences

- Players see a placed creature's name, HP and AC on a visible token, exactly as if the GM had typed them. Hidden tokens stay withheld. GM-only stats would need their own ADR.
- Creatures and placed tokens drift apart by design. The form shows a creature's values at the moment it is chosen.
- Token art can be deleted between the ownership check and the insert. The Postgres store turns the resulting foreign-key error into the same 400.
- Built-in example art stays image-only.
