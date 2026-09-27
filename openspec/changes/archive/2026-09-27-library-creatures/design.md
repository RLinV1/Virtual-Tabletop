# Design

## Context

See proposal.md for the motivation and the three delta specs for the required behavior.

What exists today:

- **Tokens already carry the needed fields.** `token.create` accepts `name`, `size`, `stats: { hp, maxHp, ac }`, `imageUrl` and `assetId`. `decide` rejects `hp > maxHp` and numbers duplicate names (KAN-62). The limits live in `Token` (`packages/shared/src/state.ts`) and `TokenStats` (`conditions.ts`).
- **Add Token** (`apps/web/src/panels/AddToken.tsx`) already has fields for every value. It builds a `TokenDraft`, and the GM then picks a square. Its "From library" button sets only the image, deliberately leaving the name blank. The reason comes from ADR 0004: a library label must never become a token name.
- **Library assets** (`library_assets`, `LibraryAssetRecord`) describe uploaded files: object key, URL, width, height. Routes live in `apps/server/src/http/library.ts` behind `withGm`, which answers 401 without a GM identity and 404 for another GM's asset.
- **"In use" tracking:** `setAssetRefs` builds the in-use index from each room's current state. `/api/library/:id/usage` returns `{ rooms }`. `LibraryPage`'s delete confirmation lists those rooms.

## Goals / Non-Goals

**Goals:**
- A saved creature always produces a valid `token.create`, with limits taken from the existing schemas rather than copied.
- No changes to the room pipeline. A creature is a way to fill in the form, not a room concept.
- Creatures are protected by the same ownership and privacy rules as library assets.

**Non-Goals:**
- Stats hidden from players, a separate current HP, conditions or owners on a creature, creature data for built-ins, and whole encounters (FR-GM-13).
- Placing a creature in one click without the form.

## Decisions

### 1. A separate creature resource, not a new asset kind

Creatures get their own table (`library_creatures`), store methods, and routes under `/api/library/creatures`.

*Alternative:* add `kind: "creature"` to `library_assets`. Rejected. Every asset row has a stored file, pixel size and object key, which creatures lack, and every existing asset consumer would need to handle the new kind (list, picker, delete, usage, `toWire`). A separate resource keeps asset code unchanged, apart from the delete warning.

### 2. Shared schemas built from the token limits

In `packages/shared/src/protocol.ts`:

```ts
export const CreatureFields = z.object({
  name: Token.shape.name,
  size: Token.shape.size,
  maxHp: TokenStats.shape.maxHp,
  ac: TokenStats.shape.ac,
  imageAssetId: z.uuid().nullable(),
});
export const CreateCreatureRequest = CreatureFields.extend({ size: Token.shape.size.default(1) }); // other fields default to null
export const UpdateCreatureRequest = CreatureFields.partial().refine(nonEmpty, "Nothing to change");
export interface LibraryCreature { id; name; size; maxHp; ac; imageAssetId; imageUrl: string | null; createdAt }
```

`imageUrl` is resolved by the server from the linked asset, so the client can draw and place a creature without a second lookup. `hp` is not stored. A helper in `apps/web` (`creatureDraft(creature)`) produces the Add Token values with `stats: { hp: maxHp, maxHp, ac }`, so `hp ≤ maxHp` always holds. A unit test places a creature at every boundary value through `decide` to confirm it produces a valid token.

### 3. Storage: the image link is cleared by the database when art is deleted

Prisma migration `0004_library_creatures`:

```prisma
model LibraryCreature {
  id           String   @id @db.Uuid
  ownerGmId    String   @map("owner_gm_id") @db.Uuid
  name         String
  size         Float
  maxHp        Int?     @map("max_hp")
  ac           Int?
  imageAssetId String?  @map("image_asset_id") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  owner GmIdentity    @relation(fields: [ownerGmId], references: [id])
  image LibraryAsset? @relation(fields: [imageAssetId], references: [id], onDelete: SetNull)
  @@index([ownerGmId])
  @@index([imageAssetId])
  @@map("library_creatures")
}
```

`onDelete: SetNull` means deleting token art needs no extra step in Postgres, and the creature list (joined to the asset for `imageUrl`) shows null straight away. The memory store matches this: `deleteAsset` sets `imageAssetId` to null on that GM's creatures.

`LibraryStore` gains `listCreatures`, `findCreature`, `createCreature`, `updateCreature`, `deleteCreature` (all scoped by `ownerGmId`, like assets) and `creaturesUsingImage(assetId, ownerGmId)`.

### 4. Routes and image validation

In a new `apps/server/src/http/creatures.ts`, registered from `registerLibraryRoutes` and sharing its `withGm`, `notFound` and id parsing:

- `GET /api/library/creatures`: the GM's creatures, newest first.
- `POST /api/library/creatures`: 201 with the creature.
- `PATCH /api/library/creatures/:id` and `DELETE /api/library/creatures/:id`: 404 when the id is malformed or another GM owns it, 204 on delete.

When a request sets `imageAssetId` to a non-null value, the route loads it with `store.findAsset(id, gmId)` and requires `kind === "token"`. A missing asset, another GM's asset and a map all get the same 400, "Image must be your own token art", so the response doesn't reveal which assets exist. Built-in art has no library id, so it can't be referenced.

*Race:* token art can be deleted between that check and the insert. Postgres then raises a foreign-key error (Prisma `P2003`). The store maps it to the same 400 rather than a 500.

### 5. `/usage` also lists creatures

`LibraryUsageResponse` becomes `{ rooms: { id, name }[]; creatures: { id, name }[] }`. This is a change to an existing shared type, so it is recorded in ADR 0012. Clients that ignore the new field keep working. `AssetCard`'s confirmation lists rooms first, then creatures ("Used by 2 creatures: Goblin, Goblin Boss. They will lose their image."). Deleting still needs only one confirmation.

### 6. Library page

- **Tabs:** the `kind` state becomes a tab id, `"map" | "token" | "creature"`. The labels are Maps, Token Art and Creatures. The empty state says "token art", and the upload button says "Upload token art" (still `kind: "token"` on the wire).
- **Creatures tab:** replaces the upload button with **New creature**, lists `CreatureCard`s (image or colour disc, name, "Size 1 · AC 15 · 7 HP"), and reuses the search box. Creatures load with `api.library.creatures.list` only when a GM token exists, following the library's "browsing doesn't create an owner" rule. No built-ins section appears on this tab.
- **Creature form:** a `Modal` with Name, Size (cells), Max HP, AC and an Image field ("Choose token art" / Remove) for New and Edit. It validates with the shared schema before submitting, and shows server errors in the modal.
- **Image picker:** `LibraryPicker` gains `includeBuiltins={false}`, so the creature image picker lists only the GM's own token art.

### 7. Add Token: From creature

A **From creature** button sits above the Name field whenever `gmToken` exists. It opens a stacked `Modal` with a searchable creature list (its own small component, since `LibraryPicker` lists assets). Choosing a creature sets the form's existing state from `creatureDraft`: name, size, hp, maxHp, ac, and image (`{ url, assetId, label: name }`). Rotation, Owner and Hidden keep their current values. Every field stays editable, and submitting goes through the unchanged `onAdd`, so placement, duplicate numbering and authorization are exactly as today. No creature id reaches the command.

### 8. ADR 0012

`docs/adr/0012-library-creatures.md` records:

- why creatures are a separate resource
- the null-on-delete image link
- that placement copies values, like map grids in ADR 0004
- the `LibraryUsageResponse` change
- the name rule: a creature's name is entered as a board name, so using it is an exception to ADR 0004's "library labels never become token names". Asset labels still never do.

## Risks / Trade-offs

- [Players see a creature's name, HP and AC on visible tokens] → This is the same as typing them in, and it is today's behavior. Hidden tokens are still withheld. GM-only stats are out of scope, as agreed.
- [Creatures fall out of sync with tokens already placed] → This is intended (spec: placed tokens are independent). The form shows the creature's values at the time it's chosen.
- [Changing `LibraryUsageResponse`] → The change is additive, and it is reviewed through ADR 0012 by the Real-Time Architecture owner.
- [Token art deleted during creature save] → Mapped to the same 400 (decision 4). A server test covers it in the memory store, and the Postgres test does too when a database is available.
- [Renaming the tab could confuse returning GMs] → The in-room pickers and "Add token" wording are unchanged. Only the library tab label and its related text change.

## Migration Plan

Deploy migration `0004_library_creatures` (it only adds a table and indexes). Existing rows and rooms don't change. To roll back: remove the routes and UI and drop the table. Placed tokens don't depend on it.
