# Tasks

## 1. Hero: two paths

- [x] 1.1 Turn `JoinByInviteBand` into a `JoinBlock` rendered in the hero's text column above `CreateRoomForm`, reusing `useJoinByInvite` and `inviteCodeFrom` unchanged, with the "Joining a game?" label, hint and a one-row input + Join (`ui-button`). Verify that a full invite link and a bare code both navigate to `/join/<code>`, and that junk input shows the error beside the field.
- [x] 1.2 Add the "Running a game?" label to `CreateRoomForm`, change the second field's label to "Your name", and wire `aria-labelledby` on both forms to their labels. Verify with the accessibility tree in devtools that each form is announced by its label.
- [x] 1.3 Remove the standalone join band from `Landing` and delete the `.invite-band` rules (including its entries in the hairline and narrow-screen rules). Verify `grep -n invite-band apps/web/src` returns nothing, and that "Your rooms" follows the hero directly.
- [x] 1.4 Fit the hero to the first screen: compact padding under `max-height: 820px` and matching label sizes, and fix the map's vertical alignment if it crops. Verify at 1366×768 and 390×844, in light and dark, with and without owned rooms, that the Join button's bottom edge is inside the viewport and that both forms precede the map on the phone.

## 2. Who "you" is

- [x] 2.1 Add a "Running your game" `h2` between `YourRooms` and the four chapters. Verify the heading outline in devtools reads hero `h1`, (Your rooms), Running your game, then the chapter titles.
- [x] 2.2 Read every visible "you/your" on the page against the spec's "you" requirement. Verify none below the hero means a player, and that the dice line names everyone at the table.

## 3. Copy

- [x] 3.1 Replace the hero subhead, grid body, slider label and readout, library note, visibility body, both captions, dice body and field label, and the closing line with the strings in `design.md`. Verify each one on the rendered page, and that the page still contains no em-dashes.
- [x] 3.2 Check visible text for implementation vocabulary (server, client, filter, snapshot, update stream, parser, overlay, cellSize) in GM view, player view, after a valid roll and after an invalid roll such as `0d6`. Verify none appears. Alt text is exempt.
- [x] 3.3 Re-check the existing `gm-home` scenarios that depend on wording: the player-view caption still says the turn-order slot is withheld, and the library note still says no sign-in and no other devices. Verify by reading both on the rendered page.

## 4. Verify

- [x] 4.1 Re-measure contrast for the new labels and hint text in both grounds (4.5:1 text, 3:1 control boundaries), and confirm any new motion sits behind `prefers-reduced-motion`.
- [x] 4.2 Click the closing "Create room" button and verify it scrolls to and focuses the room-name field in its new position.
- [x] 4.3 `npm run lint && npm run typecheck && npm test` clean.
