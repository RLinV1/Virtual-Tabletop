## Why

From inside a room, the GM has no way back to the home page, where their other rooms, the asset library and "Create room" live. They have to edit the address bar. Players don't need this: they arrive from an invite link and have nowhere else in the app to go, so they just close the tab (team feedback, 2026-09-24).

## What Changes

- **GM only:** add a "Home" control at the start of the board toolbar, with a house icon. It's a real link to `/`, so middle-click and "open in new tab" work, and it navigates in-app without a page reload.
- **Players get nothing new.** The link isn't rendered for them at all.
- Leaving the room stops the room connection. That already happens when the room page unmounts, so no new code is needed.

## Capabilities

### New Capabilities
- `room-navigation`: how a participant leaves the room page from inside it.

### Modified Capabilities
None.

## Impact

Web only: `pages/RoomPage.tsx` and `styles.css`. It's a UI affordance; nothing is sent to the server. Hiding it from players is a UI choice, not access control: the home page was never protected (invariant 7 unaffected).
