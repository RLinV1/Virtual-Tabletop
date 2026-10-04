# Proposal

## Why

FR-GM-01 ("Authenticated GM session", Must, M1) is the last Core Loop requirement with no implementation. KAN-7 is blocked on turning the decisions already made into endpoints, schema and UI:
- DESIGN.md §13.1's product rules: "Free account required to host; players join without one"; "accounts represent people; GM/player role remains per room";
- DESIGN.md §2's mechanism: argon2id, opaque server-side sessions, no JWT.

Today everything a person makes is tied to one browser:
- **A GM's rooms, library and creatures** are owned by a 32-byte token in `localStorage`.
- **A player's dice looks** (`dice-image-skins`) live only in that browser's IndexedDB.
- **Every seat in a room**, GM or player, is a credential held by one browser.

Clearing site data loses all of it, and a person on a second device starts over. Anyone can also create rooms with no identity at all (`TODO(FR-GM-01)` in `apps/server/src/http/routes.ts`).

## What Changes

The account system is built as three layers. Each answers one question, and the room kernel sees none of them.

**Identity: who is making this request?**
- **New: accounts for people, not roles.** Sign up with email, password and display name; sign in; sign out; change password. Passwords are hashed with argon2id.
- **Sessions.** An opaque `HttpOnly` session cookie, of which the server stores only the SHA-256. Sessions end after 30 days idle or 90 days total, and can be revoked instantly.
- **Abuse limits.** Rate limits on sign-in and sign-up; sign-in errors do not reveal whether an email has an account; the cookie is honoured for writes only when they come from the app's own origin.
- **New: operator password reset** until an email provider exists.

**Ownership: what does this person own?**
- **BREAKING: hosting requires an account (§13.1).** So do uploading to the library and creating a creature. Joining a room never does.
- **New: the library belongs to the person,** whether they host or only play: maps, token art, creatures and **dice looks**, the same on every device. A signed-out player's dice looks stay in the browser as today. After signing in, they are offered "save this browser's dice looks to my account".
- **New: bring a browser's legacy rooms into the account.** A browser still holding a legacy GM device token is offered a one-time, explicit move of everything that token owns, proven by the token plus the session. The device identity is then deleted.
- **Changed: the GM device identity becomes legacy.** It can read, edit and delete what it already has, and create nothing new.

**Membership: which room seats are this person's?**
- **New: seats taken while signed in are kept on the account,** whether the person created the room (GM) or joined it by invite (player). One seat per person per room; a signed-in visitor opening an invite link for a room they are already in gets "Resume as Kim".
- **New: resume a seat on any device.** Sign in, open the room from **Your rooms** (Hosting and Playing), and the server gives this browser a fresh credential for the **same participant**. No room event, and the person's other devices stay connected.
- **New: keep a guest seat on the account.** A guest who signs in mid-game is offered, inside that room, to keep their seat, proven by the seat's credential plus the session (§13.1's linking rules).
- **New: a device's seats end with its sign-in.** Signing out on a shared computer closes that computer's seats; signing in again resumes them. Guests who never sign in are unaffected.

**Screens**
- **BREAKING: "Continue as guest" is removed** for hosting. `/signin` and `/signup` become real.
- The dashboard becomes the person's **Your rooms** hub, and the account menu appears on the GM surfaces.

**Not in this change**
- **Showing a dice look to other players:** the follow-up `shared-dice-looks`. It changes the room kernel, so it gets its own ADR and review.
- **A one-time code** to move a guest seat to another device without an account.
- **Self-service password reset and email verification,** which need an email provider.
- **Account deletion.**
- **Co-GMs, OAuth and idempotent room creation.**

**Where the docs disagree, this change picks one answer** and design.md says why. In particular:
- sessions are kept in the main store rather than Redis (DESIGN.md §2);
- a verified claim of legacy rooms is allowed (§13.1 versus ADR 0004 and `device-identity-bridge` D1);
- dice looks are saved to the account (`dice-image-skins`).

## Capabilities

### New Capabilities
- `user-accounts` (identity): sign-up, sign-in, sign-out and password change; accounts as people; session lifetime and revocation; credential storage; rate limits, non-enumeration and the same-origin rule; the legacy move; operator reset.
- `room-membership` (membership): seats kept on the account; one seat per person per room; resume on any device; keeping a guest seat; seats that end with their device's sign-in.

### Modified Capabilities
- `gm-home`: the device identity becomes legacy; the placeholder account UI is replaced by working account screens; the home page states the hosting rule.
- `gm-dashboard`: the entry rule becomes "signed in" (keeping the signed-out Dice tab exception); "Continue as guest" is removed; the dashboard lists Hosting and Playing; the legacy-move offer.
- `asset-library`: assets belong to an account, host or player; uploading requires one.
- `library-creatures`: creatures belong to an account; creating one requires one.
- `dice-looks`: signed-in looks and the look in use live on the account; looks are checked on the server; browser looks can be saved into the account.
- `gm-identity-recovery`: a token the server does not recognise is forgotten, never registered again.

## Impact

- **Room kernel (`decide`, `reduce`, `Command`, `DomainEvent`, `RoomState`, visibility filters, `HandshakeAuth`): untouched.** No account, owner or membership data enters room state or any room payload.
- **packages/shared:** new `auth.ts`, `membership.ts` and `diceLooks.ts` wire schemas. `CreateRoomRequest.gmToken` is removed (ADR 0017, reviewed by Raymond as CLAUDE.md requires).
- **apps/server:** reorganised by layer into `identity/`, `ownership/` and `membership/` modules. The existing `http/` routes call into them. `resolveGm` becomes `ownership/resolveOwner`.
- **Prisma migration `0006_accounts`:**
  - new tables `users`, `sessions`, `room_members` and `dice_looks`;
  - `credentials.session_hash`, cascading from `sessions`;
  - `gm_identities.token_hash` becomes nullable.
- **New dependency:** `@node-rs/argon2`, which ships prebuilt binaries.
- **apps/web:**
  - a new `account/` module: account state, guard, pages and menu;
  - the Your rooms hub;
  - Resume on the invite page;
  - the keep-this-seat offer in the room;
  - an account backend for `ui/diceSkinStore.ts`, behind its existing hooks.
- **Docs:** ADR 0017; DESIGN.md §2, §5 and §6; INTERFACE.md; README; a pointer in ADR 0004.
- **Order of archiving:**
  1. `dice-image-skins`, which creates `dice-looks`;
  2. a trimmed `device-identity-bridge`;
  3. this change;
  4. then `shared-dice-looks`.
- **Owner:** KAN-7, Raymond (DELIVERY.md §8). Tests reference FR-GM-01.
