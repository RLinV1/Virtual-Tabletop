# Design

## Context

See proposal.md, Why. Current state that shapes the approach:

- **Routing** is hand-rolled. `router.ts` parses `location.pathname` into a `Route` union, `App.tsx` switches on it, and `navigate(path, { replace })` wraps `pushState`/`replaceState`. There is no route guard mechanism.
- **Home page GM pieces.** `HomePage.tsx` holds `YourRooms` (which calls `api.gm.rooms` only when `loadGmToken()` returns a token), `useCreateRoom` and `CreateRoomForm` (which call `getGmToken()`, creating the identity on submit), and a closing "Create room" button that scrolls to the form.
- **The library creates an identity on load.** `LibraryPage.tsx` calls `getGmToken()` in a mount effect and renders the asset list only once it has a token. `getGmToken` is `ensureGmToken(api.gm.identify)`: it creates, stores and registers a token.
- **Room panels only read the token.** `GmPanel.tsx` and `AddToken.tsx` read it with `loadGmToken()`. A GM inside a room created it, so they always hold a token.
- **Where the account screens live.** `AccountPages.tsx` has `AccountForm` (inert submit that shows `AccountsComingNotice`) and `AccountMenu`. The menu is currently rendered only in the library header.
- **Link targets.** The library header's "My rooms" link and the room toolbar's Home link (`RoomPage.tsx`) both point at `/`.

## Goals / Non-Goals

**Goals:**
- A single dashboard page that owns create-room and the room list.
- The entry rule implemented in one place.
- No GM identity created by any read.

**Non-Goals:**
- Accounts, sessions, or a real sign-in.
- The identity expiry job and the docs cleanup from `device-identity-bridge`.
- Redesigning `/library`, beyond its empty state and its back link.
- The dashboard's visual style beyond reusing what `/library` already uses.

## Decisions

### The guard lives in the dashboard route, not in the links

Every link into the GM flow is a plain `href="/gm-dashboard"`. The home hero, the closing call to action, the library's back link and the room's Home link all work this way. The dashboard page checks `isRecognised()` on first render. When the browser is not recognised, it calls `navigate("/signin", { replace: true })` and renders nothing.

This puts the rule in one place, so direct visits and link clicks cannot diverge, which the spec requires. Using `replace` means the history holds `/` then `/signin`, and never a `/gm-dashboard` entry that would redirect again. Pressing Back from sign-in returns to where the user came from (spec: Back does not loop).

*Alternative considered:* checking in each link's click handler and sending unrecognised users straight to `/signin`. That was rejected because a direct visit or bookmark would skip the rule, and every new link would have to remember to add it.

### "Recognised" is a pure function of two stored values

`net/identity.ts` gains:
- `markGuest()`, which writes `vtt.gmGuest = "1"` to `localStorage` and also sets a module-level flag;
- `isGuest()`;
- `isRecognised() = loadGmToken() !== null || isGuest()`.

The module-level flag covers storage that throws or is disabled. The choice then lasts for the page's lifetime instead of bouncing the user back to sign-in (spec: Storage unavailable).

A pure `entryTarget({ hasToken, guest }) -> "/gm-dashboard" | "/signin"` helper is exported so the rule gets unit tests in `apps/web/test`, like the existing pure tests there.

### Continue as guest goes to the dashboard, with no `next=` parameter

Sign-in is reached from two places: the dashboard's redirect, and the home header's "Sign in" link. Either way, the only thing a guest can go on to is the GM dashboard, so "Continue as guest" always calls `markGuest()` and then `navigate("/gm-dashboard")`. No return-URL parameter is needed, and there is no open-redirect surface to guard.

`AccountForm` gains an optional `guest` slot rendered above the fields. Only `SignInPage` fills it. `SignUpPage` keeps its current layout and links to sign-in.

### Dashboard composition reuses the home page's pieces

`useCreateRoom`, `CreateRoomForm` and `YourRooms` move from `HomePage.tsx` into `pages/GmDashboardPage.tsx`, with their behaviour unchanged:
- `CreateRoomForm` still calls `getGmToken()` on submit, which is the write that creates the identity;
- `YourRooms` still skips the request when there is no token.

Two things change:
- `YourRooms` gains an empty state and an error line, because on the dashboard it is the page's main content, not an optional band.
- The dashboard uses the app's own style (the same header, `AccountMenu`, fonts and dark ground as `/library`), not the home page's marketing ground and theme toggle. The dashboard is a tool, like the library.

Layout:
```
Virtual Tabletop                        Asset library   [Account]
GM dashboard
+------------------------------+  +----------------------------------+
| Create a room                |  | Your rooms                       |
| [Room name ] [Your name ]    |  | The Broken Span  2 h ago  [Open] |
| [ Create room -> ]           |  | ...                              |
+------------------------------+  | Saved in this browser until      |
                                  | accounts arrive.                 |
                                  +----------------------------------+
```
It becomes one column below 760px.

### Home page changes

- The hero's "Running a game?" block keeps its label and becomes a short hint plus a **Set up a room** link, styled as the primary `cta`. It stays the page's only filled button. The join block above it is unchanged.
- The closing call to action becomes the same link. `focusCreate` and `roomNameRef` are removed.
- The header gets **no** dashboard link. Guest access is temporary, and after accounts arrive the header's Sign in link is the way in. Returning GMs use the hero link, so its hint covers both cases: "Create a room or reopen one you've run."
- `YourRooms` and its band are removed from `/`.

The hero gets shorter, so the 1366×768 and 390×844 first-screen checks get easier, not harder.

### The library stops creating an identity on load

`LibraryPage` reads the token with `loadGmToken()` instead of `getGmToken()`. With no token, it skips the assets request and shows the existing empty state plus the built-in shelf. The upload action calls `getGmToken()` when it submits, so the first upload creates the identity, then refreshes the list. This takes over `device-identity-bridge` tasks 2.1 to 2.3.

### Room Home link keeps its label

The toolbar link keeps the text **Home** and its house icon, and changes its target to `/gm-dashboard`. For a GM, the dashboard is home. The title attribute becomes "Back to your GM dashboard".

## Risks / Trade-offs

- [Creating a room now takes two steps from `/`] → The hero link goes straight to the dashboard for recognised browsers, and the create form is the dashboard's first element. First-timers see sign-in once.
- [The `gm-home` "GM device identity" requirement is also changed by `device-identity-bridge`] → Both changes state the same write-only rule. The bridge's version adds its lifetime paragraph and scenarios, so if it is archived after this change its wording becomes the final one, with nothing lost. If it is archived first, this change's delta needs to be rebased onto the bridge's wording before archiving.
- [`device-identity-bridge`'s cutover scenario says authenticating continues into creating a room "rather than landing on a dashboard"] → That applies only once accounts exist, and does not conflict with the guest flow now. At cutover, the bridge must decide whether "creating the room" means the dashboard's create form, which it now is. This is noted here for that change, and not changed from here.
- [`device-identity-bridge`'s `asset-library` change targets a requirement name, "Library assets are owned by a GM identity", that the main spec does not have; the main spec calls it "Library ownership and access"] → That will fail to sync when the bridge is archived. It is outside this change, but it should be raised with the bridge's owner together with the task hand-over.
- [A guest flag in `localStorage` is lost when site data is cleared] → The user then sees sign-in once more and can continue as a guest again. Nothing they own is lost that wasn't already lost with the GM token.
- [The home page stops listing rooms, which surprises GMs who were used to it] → The hero link reaches the rooms in one click for a recognised browser, and its hint says it is also the way back to existing rooms.

## Migration Plan

This is a client-only change with no data migration. Existing browsers that hold a GM token are recognised right away and go straight to the dashboard. Rolling back means reverting the web bundle. The guest flag left in `localStorage` is harmless to older code.
