# Design

## Context

`CreateRoomCard` in `apps/web/src/pages/GmDashboardPage.tsx` keeps `roomName` and `displayName` as local state that starts as `""`, with placeholders "The Broken Span" and "Your name". The page is wrapped in `RequireAccount`, which renders its children only when `useAccount()` reports `status: "signedIn"`. So when the card mounts, `account.displayName` is always available. It is already trimmed and limited to 1–40 characters (`AccountDisplayName`), the same limit as the room's GM name (`CreateRoomRequest.displayName`, `maxLength={40}`). See proposal.md for why.

## Goals / Non-Goals

**Goals:**
- Fill in the GM's name once, from the account that is already loaded, with no extra request.

**Non-Goals:**
- Keeping the box in sync if the account's display name changes while the form is open.
- Any change to the server, `packages/shared` or the join page.

## Decisions

- **Fill the name in once, when the card mounts.** Read `useAccount()` in `CreateRoomCard` and use the display name as the starting value in `useState`. This is the simplest way to keep the GM's edits safe. An effect that copies the account name into the box whenever it changes could overwrite something the GM typed. The signed-out branch falls back to `""`. It cannot happen under `RequireAccount`, but it keeps the type narrowing honest without a cast.
- **Add a requirement to the spec rather than modify an existing one.** The `GM dashboard` requirement is already being changed by the in-flight `user-accounts` and `delete-room` changes. A MODIFIED delta replaces the whole requirement block, so a fourth copy would conflict with them when archived. Starting values are a separate concern, so this change adds its own requirement.
- **Keep the box required with `maxLength={40}`.** A cleared name is caught by the browser's form check as before, and the server's blank-name check (`routes.ts`) stays as the real safeguard.

## Risks / Trade-offs

- [The account is renamed or switched in another tab while the dashboard is open] → The box keeps the old name until the page is reloaded. This doesn't matter much: the box is editable and its value is only the starting name for this room.
- [A test needs a signed-in account] → Set `accountStore` directly in the test (`setState({ status: "signedIn", account })`) instead of mocking `api.auth.me`.
