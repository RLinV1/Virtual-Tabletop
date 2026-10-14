# Tasks

## 1. Create-room form

- [x] 1.1 In `CreateRoomCard` (`apps/web/src/pages/GmDashboardPage.tsx`), remove `placeholder="The Broken Span"` from Room name and `placeholder="Your name"` from Your name. Verify that `grep -n placeholder apps/web/src/pages/GmDashboardPage.tsx` finds nothing.
- [x] 1.2 Read `useAccount()` in `CreateRoomCard` and start `displayName` with the signed-in account's display name (`""` if not signed in), keeping `required` and `maxLength={40}`. Verify by test 2.1.

## 2. Tests

- [x] 2.1 Add `apps/web/test/createRoomForm.test.tsx` (jsdom, `describe("create-room form starting values (FR-GM-01)")`). Set `accountStore` to a signed-in account named "Tony", stub `fetch` for the dashboard's loads, and render `GmDashboardPage`. Check that Your name has the value "Tony", Room name is empty, and neither box has a `placeholder` attribute. Verify with `npm test --workspace=@vtt/web -- -t "create-room form"`.
- [x] 2.2 In the same file, change Your name to "DM Tony", fill in Room name and submit. Check that the `POST /api/rooms` body has `displayName: "DM Tony"`, and that no account-update request is sent. Verify with the same command.
- [x] 2.3 In the same file, render `JoinPage` with a signed-in account and check that its Your name box is empty (the player form is not pre-filled). Verify with the same command.

## 3. Wrap-up

- [x] 3.1 Run `npm run lint && npm run typecheck && npm test` and verify all three pass.
