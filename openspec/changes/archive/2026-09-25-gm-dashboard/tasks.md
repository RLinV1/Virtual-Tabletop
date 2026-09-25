# Tasks

## 1. Recognition and routing

- [x] 1.1 In `net/identity.ts`, add `markGuest()`, `isGuest()`, `isRecognised()` and a pure `entryTarget({ hasToken, guest })`. The guest flag goes in `localStorage` under `vtt.gmGuest`, with an in-memory fallback when storage throws. Verify with a new `apps/web/test/gmEntry.test.ts` covering: token only, guest only, both, neither, and storage throwing on write.
- [x] 1.2 Add a `gmDashboard` route for `/gm-dashboard` to `router.ts` and `App.tsx`. Verify `/gm-dashboard` and `/gm-dashboard/` both resolve to it, and unknown paths still reach not-found.

## 2. The dashboard

- [x] 2.1 Create `pages/GmDashboardPage.tsx`. On first render, when `isRecognised()` is false, call `navigate("/signin", { replace: true })` and render nothing. Verify in a fresh private window: opening `/gm-dashboard` lands on `/signin`, and Back returns to the previous page, not to a redirect loop.
- [x] 2.2 Move `useCreateRoom`, `CreateRoomForm` and `YourRooms` from `HomePage.tsx` into the dashboard, unchanged in behaviour. Add an empty state ("no rooms yet") and an error line when the room list fails to load. Verify:
  - as a guest with no token, the empty state shows and the Network tab has no `/api/gm/rooms` request;
  - after creating a room, it opens, and Home later lists it with its last activity.
- [x] 2.3 Add the dashboard header (brand, **Asset library** link, `AccountMenu`), the browser-bound note under the room list, and the two-column layout that becomes one column below 760px. Verify at 1366×768 and 390×844.

## 3. Sign-in and guest

- [x] 3.1 Give `AccountForm` an optional slot above the fields. On `SignInPage`, fill it with "Continue as guest", the note that accounts are not available yet and that rooms and the library are saved in this browser, and a divider before the form. The button calls `markGuest()` and then `navigate("/gm-dashboard")`. Verify:
  - the button appears above the email field;
  - clicking it opens the dashboard;
  - following the home link again skips sign-in;
  - no request is sent and no `vtt.gm` key is written.
- [x] 3.2 Re-check the inert form still sends nothing. Verify in the Network tab that submitting sign-in and sign-up sends no request containing the email or password, and that the "accounts are coming" notice still shows.

## 4. Home page

- [x] 4.1 Replace the hero's create form with the "Running a game?" label, the hint "Create a room or reopen one you've run.", and a **Set up a room** link to `/gm-dashboard` (primary `cta` style). Remove `YourRooms` from `/`, and turn the closing "Create room" button into the same link, removing `focusCreate`/`roomNameRef`. Verify join is still above the run path and both are fully visible without scrolling at 1366×768 and 390×844, in light and dark.
- [x] 4.2 Remove the CSS the moved form and room band leave unused on the home page, and check the home page's banned-vocabulary and em-dash rules still hold. Verify with `grep` that no `.tsx` still references removed classes, and re-read the rendered hero copy.

## 5. Library and room links

- [x] 5.1 In `LibraryPage.tsx`, replace the mount-time `getGmToken()` with `loadGmToken()`. With no token, skip the assets request and show the empty state and built-in shelf. Call `getGmToken()` only when an upload is submitted, then refresh the list. Verify:
  - in a fresh private window, opening `/library` writes no `vtt.gm` key and sends no `/api/library` or `/api/gm/identify` request;
  - the first upload creates the identity and the asset appears.
- [x] 5.2 Confirm no other read path creates an identity. Verify `grep -rn "getGmToken" apps/web/src` shows only the create-room submit and the library upload.
- [x] 5.3 Point the library's "My rooms" link and the room toolbar's Home link at `/gm-dashboard`, and update the Home link's title. Verify from a room that Home opens the dashboard without a full reload and closes the room connection, and that players still see no Home link.

## 6. Hand-over and verify

- [x] 6.1 With the owner's agreement, update `device-identity-bridge`: mark its tasks 2.1 to 2.3 as moved to `gm-dashboard`, and raise the two spec notes from `design.md` (the dashboard wording in its cutover scenario, and its `asset-library` requirement name that doesn't match). Verify the bridge's `tasks.md` names this change. **Done** on 2026-09-25: the bridge's tasks 2.1 to 2.3 are marked done here, its proposal says so and orders it after this change, its cutover scenario now leads to the GM dashboard, and its `asset-library` delta targets "Library ownership and access".
- [x] 6.2 Walk the whole flow in a fresh private window:
  1. `/` → Set up a room → sign-in → Continue as guest → dashboard (empty, no identity);
  2. open the library (no identity) → back to the dashboard;
  3. create a room (identity created) → Home → the dashboard lists the room;
  4. reload `/` (no room list, no dashboard link in the header) → Set up a room goes straight to the dashboard.

  Verify each step.
- [x] 6.3 `npm run lint && npm run typecheck && npm test` clean.
