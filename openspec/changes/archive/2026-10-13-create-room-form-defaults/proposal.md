# Proposal

## Why

The dashboard's Create a room form has two confusing example values. The Room name box shows "The Broken Span", which looks like a value already filled in, and it is also the name of a built-in map, so a GM can think a map has been chosen. The Your name box shows "Your name", which only repeats its label. The GM is always signed in on this page (FR-GM-01), so the form can fill in their name instead of showing an example.

## What Changes

- Room name starts empty and has no placeholder text.
- Your name has no placeholder text and starts with the signed-in account's display name.
- The GM can edit or clear the pre-filled name. Room creation sends whatever is in the box when the form is submitted, so an edited name is used for this room only and the account name does not change.
- The player's Your name box on the join page (`/join/:code`) is not changed. It is not pre-filled, even when the player is signed in.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `gm-dashboard`: adds a requirement for the create-room form's starting values (no example text; GM name pre-filled from the account and editable).

## Impact

- `apps/web/src/pages/GmDashboardPage.tsx` (`CreateRoomCard`) only.
- New web test in `apps/web/test`.
- No change to `packages/shared` schemas, the server, the `POST /api/rooms` payload or `JoinPage`. No ADR needed.
