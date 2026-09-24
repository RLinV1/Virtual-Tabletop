# Design

## Context

`resolveGm(req)` (`apps/server/src/http/gmAuth.ts`) reads an `X-GM-Token` header, hashes it, and looks up a `gm_identities` row. That row has three columns: id, token hash, created-at. There is no user, email or password column anywhere in the schema. Possession of the token **is** the identity, and it grants ownership of every room (`rooms.owner_gm_id`) and every library asset (`library_assets.owner_gm_id`) created from that browser.

The mechanism itself is borrowed from guest tokens (DESIGN.md §5.1), where it is appropriate: a guest token grants a **seat in one room**, is revocable per room (FR-GM-20), and its compromise is bounded by that room. Reusing the same mechanism to own a person's entire body of work removes both of those bounds.

## Goals / Non-Goals

**Goals**
- Settle whether the device identity is permanent or temporary, so KAN-7 has a target.
- Stop a read from creating server-side identity state.
- Bound the blast radius and the lifetime of an unauthenticated owner.
- Keep the first-run experience fast while the bridge exists.

**Non-Goals**
- Building accounts, sessions or password hashing. That is KAN-7 / FR-GM-01.
- A user-facing claim or merge flow. DESIGN.md §13.1 excludes ownership transfer from the Core Loop.
- Any change to guest/player identity. FR-PL-02 is settled and correct.
- Changing `resolveGm`'s signature or any route. The seam already works.

## Decisions

### D1. The device identity is a bridge, not a tier

It exists only until FR-GM-01 lands, and it is deleted afterwards. It is never presented as an anonymous account, never gains a settings surface, and never accrues features.

**Why:** the alternative, a permanent anonymous tier, requires written rules for claim-on-login, two-sided merge conflicts, what happens when a second person signs in on the same browser, whether the device token survives claiming (it must not, or it is a permanent backdoor), retention, and an upload quota, since anyone can mint unlimited identities. None of that is in scope for the Core Loop, and §13.1 already refused the adjacent version of it.

### D2. Hosting is account-gated at cutover; playing never is

This restores DESIGN.md §13.1 verbatim. The homepage line "Free account required to host; players join without one" becomes true at that point. Until then, hosting stays open, because gating it today would make the product unusable: accounts do not exist.

**Why:** the "no account" promise that differentiates this product is aimed at **players** (FR-PL-01). Extending it to hosts is what created the ownership problem, and it buys much less.

### D3. Mint on write, never on read

A GM token is created on the first action that **creates server state**: creating a room, or uploading an asset. Opening `/library` with no token lists nothing and creates nothing.

**Why:** a GET should not create a row. Today `LibraryPage` mints on mount, which manufactures junk identities for anyone who merely looks, and previously changed which page `/` rendered for the rest of the session.

### D4. Unclaimed identities expire after 30 days

An identity owning zero rooms and zero assets, last seen more than 30 days ago, is deleted. Identities that own something are retained until cutover.

**Why:** without this the table grows monotonically with casual visits and never shrinks, and D3 alone does not fix rows already created.

### D5. The interface states the bound plainly

While the bridge exists, any surface that offers to save something says it is tied to this browser. The home page already carries: "No sign-in needed. The library is tied to this browser until accounts arrive, so it does not follow you to another device yet."

**Why:** "your library" is a promise the system cannot keep. It belongs to a browser profile, so a second browser on the same machine is a different library, and clearing site data loses it silently.

### D6. At cutover, `gm_identities` is removed

`rooms.owner_user_id` becomes non-null per §13.1, `gm_identities` and `owner_gm_id` are dropped, and `resolveGm`'s body is replaced with the session cookie lookup that ADR 0004 already anticipates. Routes do not change.

## Risks / Trade-offs

- **Data loss at cutover** if the team picks "abandon" (the proposal's open question) and real users have appeared by then. Mitigation: pick the operator-migration option instead, or land KAN-7 before inviting real users.
- **Slower first run after cutover.** A first-time GM gains one screen before their first room. §13.1 accepted this explicitly, and mitigates it with the return-intent flow: "Signed-out Play opens login/signup with a same-origin return intent; successful authentication continues room creation."
- **D3 is a small behaviour change to a shipped page.** A GM who has never created a room sees an empty library rather than an empty library plus a new identity row. No user-visible difference beyond that.
- **30 days is a guess.** It is a starting value, not a researched one, and is cheap to change.

## Migration

No migration is required by this change. It constrains future behaviour and removes a mount-time side effect. The schema change (dropping `gm_identities`) belongs to KAN-7, and this document records what that change must do.
