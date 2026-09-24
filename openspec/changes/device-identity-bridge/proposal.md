# Proposal

## Why

The repository currently holds two contradictory positions on who owns a room and a library asset, and neither one is marked as superseded.

**DESIGN.md §13.1 decided:** "Play requires an authenticated account to create a room. Keep FR-GM-01 and the non-null `rooms.owner_user_id`. Do not introduce unclaimed-room authority, expiry or ownership transfer in the Core Loop."

**ADR 0004 (status: Proposed, never reviewed) then introduced** a GM device identity that owns rooms and assets, made `rooms.owner_gm_id` nullable, and stated that "device-owned rows are then claimed by re-pointing `owner_gm_id`". That is unclaimed-room ownership plus ownership transfer, which is what §13.1 ruled out. It shipped in PR #13.

The result is a model nobody has agreed to, with three concrete problems today:

1. A non-expiring bearer token in `localStorage` is the **sole** proof of owning every room and asset a person has ever made. There is no expiry, no revocation and no recovery. Clearing site data silently orphans the rows forever.
2. Opening `/library` **mints a server-side identity on a read** (`LibraryPage.tsx` calls `getGmToken()` in a mount effect), so merely looking creates a `gm_identities` row. It also rewrote which page `/` rendered until this was fixed.
3. The UI says "your" rooms and "your" library. They belong to a browser profile, not a person. A second browser on the same machine is a different library.

This change does not build accounts. It decides **what the device identity is for and when it ends**, so that KAN-7 has something to land against.

## What Changes

- **The GM device identity is declared a time-boxed bridge, not a permanent anonymous tier.** It exists only until FR-GM-01 and is removed at cutover.
- **Hosting is account-gated at cutover**, restoring §13.1. Players continue to need no account, which is the actual differentiator.
- **No claim flow, no merge, no ownership transfer** is built. §13.1 forbids all three in the Core Loop, and warns separately: "Never silently merge all browser seats."
- **Identity is minted on first write, never on a read.** Opening the library lists nothing and creates nothing when the browser has no token.
- **Unclaimed identities expire.** An identity owning no rooms and no assets is deleted after 30 days, so the table does not grow from casual visits.
- **The UI states the limitation plainly** while the bridge exists, instead of implying an account.
- **The stale docs are reconciled:** DESIGN.md §11.2 still marks `/library` "Deferred, do not build" although it shipped, and ADR 0004 stays "Proposed" while its code is on `main`.

## Capabilities

### Modified Capabilities
- `gm-home`: the GM device identity requirement gains a lifetime, a creation trigger restricted to writes, a retention rule, and the cutover that ends it.
- `asset-library`: asset ownership inherits the same lifetime and retention, and the library read path no longer creates an identity.

## Impact

- **apps/web:** `pages/LibraryPage.tsx` (stop minting on mount; render an empty state without an identity), `net/gm.ts` / `net/identity.ts` (unchanged API, called from write paths only), `pages/HomePage.tsx` (copy already states the limitation).
- **apps/server:** a retention job or scheduled delete over `gm_identities`; no route changes, because `resolveGm` already isolates the seam.
- **docs:** ADR 0004 gains a "Relationship to DESIGN.md §13.1" section and moves out of "Proposed"; DESIGN.md §11.2 is corrected for what shipped.
- **Depends on:** nothing. **Unblocks:** KAN-7 (accounts), which currently has no agreed target state to build toward.
- **Not in scope:** building accounts, sessions or password hashing (KAN-7); guest-to-account linking, which §13.1 defers with its own conditions; any change to guest/player identity, which is FR-PL-02 and settled.

## Ordering

These deltas MODIFY requirements introduced by the `gm-home-and-asset-library` change, which is still open even though it shipped in PR #13. `openspec/specs/` is therefore empty and `openspec validate` reports that an archive would refuse the MODIFIED operations. **Archive `gm-home-and-asset-library` first**, so `openspec/specs/gm-home` and `openspec/specs/asset-library` exist, then archive this one.

## Open question for the team

**At cutover, what happens to rooms and assets owned by a device identity?** Two options, and this proposal recommends the first:

1. **Abandon.** Device-owned rows are dropped at cutover. Today this is test data only. Zero code, zero risk, no claim flow to secure.
2. **One-time operator migration.** An operator script re-points `owner_gm_id` to a user id for specific rows on request. Still no user-facing claim flow, so §13.1 holds, but it needs a script and a support process.

Option 2 becomes materially more attractive if real users appear before KAN-7 lands.
