# Tasks

## 1. Library entry rule

- [x] 1.1 In `pages/LibraryPage.tsx`, apply the dashboard's entry rule, the same way `GmDashboardPage` does. Read `isRecognised()` once on first render; when it is false, call `navigate("/signin", { replace: true })` in an effect and render nothing. Hooks must run in the same order either way, so the check sits above an early return that comes after all hooks, or the page body moves into an inner component. Verify in a fresh private window that opening `/library` lands on `/signin`, and that Back returns to the previous page.
- [x] 1.2 Verify the recognised paths: after "Continue as guest", `/library` opens (empty library, with no identity created and no `/api/library` request), and the dashboard's **Asset library** link opens it without a sign-in step.

## 2. Home page

- [x] 2.1 In `pages/HomePage.tsx`, remove the **Open the asset library** link from the library section, and replace its note with: "You'll find it on your GM dashboard. No sign-in needed: it's saved in this browser until accounts arrive, so it won't follow you to another computer or phone yet." Verify there is no `href="/library"` left in `HomePage.tsx`, and that the note still reads well on its own at 1366 and 390 wide, adjusting the section's bottom-row CSS only if it now looks unbalanced.
- [x] 2.2 Re-run the home page copy checks: no implementation terms, and no em-dashes. Verify with the same greps used before.

## 3. Verify

- [x] 3.1 `npm run lint && npm run typecheck && npm test` clean.
