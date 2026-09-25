# Proposal

## Why

Everything a GM does outside a room lives on the marketing page. Creating a room, "Your rooms" and the way into the asset library all sit on `/`, among the feature demos, and every way back leads there too: the room toolbar's **Home** link and the library's **My rooms** link both open `/`, so a GM scrolls past the hero to find their own rooms. The home page is trying to be the front door for newcomers and players and the GM's workspace at once.

There is also no single place to put the step accounts will need. `device-identity-bridge` plans to gate hosting behind sign-in once FR-GM-01 lands, but today there is no GM entry point to hang that on.

## What Changes

- **New GM dashboard at `/gm-dashboard`.** It holds the create-room form, the list of rooms this browser owns (moved from `/`), a link to the asset library, and the account menu. The library stays its own page at `/library`.
- **The home page keeps join first, and hands GMs off.** The hero's "Running a game?" block becomes a **Set up a room** link instead of a form. The "Your rooms" band is removed from `/`. The closing call to action leads the same way. The home page header gets no dashboard link: guest access is temporary, and the header's Sign in and Create account links are the long-term way in.
- **One entry rule for the dashboard.** A browser is *recognised* when it holds a GM identity or has previously chosen to continue as a guest. A recognised browser goes straight to the dashboard. Any other browser is sent to `/signin` first. This applies equally to the home page link and to opening `/gm-dashboard` directly.
- **Sign-in offers "Continue as guest" above the form.** Accounts are not implemented, so the guest option comes first and says that rooms and library items are saved in this browser. The form stays as a preview and still sends nothing.
- **A GM identity is created only by a write**: creating a room or uploading to the library. Opening the library or the dashboard, or continuing as a guest, creates nothing. Today `/library` creates an identity when it loads. This change takes that fix over from `device-identity-bridge` (its tasks 2.1 to 2.3).
- **Back links point at the dashboard.** The room toolbar's Home link and the library's "My rooms" link open `/gm-dashboard`.

## Capabilities

### New Capabilities
- `gm-dashboard`: the GM dashboard page, the entry rule and the "recognised" check, continuing as a guest, and GM surfaces linking back to the dashboard.

### Modified Capabilities
- `gm-home`: the GM device identity is created by a write only; the account placeholder gains "Continue as guest" and the account menu moves to the dashboard; the home page no longer lists rooms; the create path in the hero becomes a link into the GM flow.
- `room-navigation`: the GM's Home link opens the GM dashboard instead of the home page.
- `asset-library`: opening the library does not create a GM identity, and the first upload does.

## Impact

- **apps/web:**
  - new `pages/GmDashboardPage.tsx`
  - `router.ts` and `App.tsx` gain the `/gm-dashboard` route
  - `pages/HomePage.tsx`: the create form and `YourRooms` move out, and the hero gets a link
  - `pages/AccountPages.tsx`: Continue as guest
  - `pages/LibraryPage.tsx`: no identity on load, and "My rooms" points at the dashboard
  - `pages/RoomPage.tsx`: the Home link target
  - `net/identity.ts`: the guest flag and the "recognised" check
  - `styles.css`
- **No server, schema, event or protocol changes.** The dashboard uses the existing `GET /api/gm/rooms` and `POST /api/rooms`.
- **Overlaps with `device-identity-bridge`:**
  - Its tasks 2.1 to 2.3 (stop creating an identity on read) move here. Its task list and proposal should be updated to say so, with its owner's agreement.
  - Its `gm-home` change to "GM device identity" is a superset of this change's version (it adds the bridge's lifetime). If it is archived after this one, its wording should be the final one.
  - Its future account-gated flow says signing in continues into creating a room "rather than landing on a dashboard". That applies only after accounts exist. The difference is recorded in `design.md` for that change to settle.
- **Not in scope:**
  - building accounts (KAN-7)
  - the 30-day identity expiry and the docs cleanup, which stay in `device-identity-bridge`
  - moving the library into the dashboard
  - any change to how players join
