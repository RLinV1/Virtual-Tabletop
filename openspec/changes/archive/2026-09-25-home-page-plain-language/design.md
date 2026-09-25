# Design

## Context

See proposal.md, Why. The relevant current state:

- `HomePage.tsx` renders the hero (`.landing-hero`, a two-column grid of text column and `.hero-art`), then `YourRooms`, then `JoinByInviteBand`, then four chapters and a closing section.
- Below 860px `.landing-hero` collapses to one column in DOM order, so the text column, and anything placed in it, already comes before the map on a phone.
- The hero's vertical budget is tight: padding up to 4.5rem top and bottom, an `h1` up to 3.3rem across two lines, a subhead, and a two-column form. Adding the join block has to come out of that budget to meet the 1366×768 requirement.
- `inviteCodeFrom` is exported from `HomePage.tsx` and `useJoinByInvite` holds the join logic. Both are reused as they are.
- The `gm-home` requirements from `home-page-redesign` still apply: the turn-order caption, the browser-bound library statement, contrast in both grounds, and motion behind `prefers-reduced-motion`.

## Goals / Non-Goals

**Goals:**
- Both paths in the first screen, join first, each labelled with its reader.
- Every "you" attributable to the GM or to a player.
- User-level copy throughout, with the implementation vocabulary listed in the spec removed.

**Non-Goals:**
- Changing what the demos do. The grid slider, the GM/player toggle and the dice box keep their behaviour. Only their words change.
- Explaining tabletop vocabulary to people who have never played.
- Restyling beyond what the hero restructure needs.

## Decisions

### Hero structure: two stacked blocks in the text column

```
headline
subhead
JOINING A GAME?   Paste the link your GM sent you. No account needed.
  [ invite link or code          ] [Join]
----------------------------------------------- (hairline)
RUNNING A GAME?
  [Room name      ] [Your name     ]
  [            Create room ->          ]
```

`JoinByInviteBand` becomes `JoinBlock`, rendered inside the hero's text column above `CreateRoomForm`, and the standalone band and its `.invite-band` CSS are deleted. The join field's label sits above the row, and the input and button share one row (`flex`, input growing, `align-items: stretch` so both have the same height on touch screens), matching the old band's control family (`ui-button`), so Join stays secondary and Create room stays the only filled CTA.

*Alternatives:* a GM/player toggle that swaps forms (rejected: one path always costs a click, and players must discover the toggle), and a one-line join strip under Create (rejected: join reads as a footnote).

### Block labels as eyebrows, not headings

"Joining a game?" and "Running a game?" are short uppercase eyebrow labels. They reuse the chapter eyebrow treatment if one exists, and otherwise get a small `.path-label` class. They are not `h2`s: the page's `h2`s are the section titles, and two more headings in the hero would flatten the outline. Each form gets an `aria-labelledby` pointing at its label, so screen readers announce "Joining a game?, form".

### Fitting 1366×768

To keep join fully visible, trim the hero's top padding at heights up to 820px with `@media (max-height: 820px)`, and drop the create form's field labels to the same compact size the join label uses. The headline and map sizes stay as they are. Verify by measuring the Join button's bottom edge against the viewport in both grounds, with and without owned rooms. If that is not enough, the next thing to shrink is the `h1` clamp ceiling, not the map.

### "Running your game" heading

A single section heading, "Running your game", goes above the four chapters, after `YourRooms`. It uses the existing `h2` scale, and the chapter titles stay as they are. That one heading sets "you = GM" for everything under it, so individual sentences don't need "as the GM" qualifiers.

### Copy

| Where | Final text |
|---|---|
| Hero subhead | Set up a map, drop in tokens, and send your players a link. They join from any browser, no account needed. |
| Join label / hint | Joining a game? / Paste the link your GM sent you. No account needed. |
| Join field label / placeholder | Invite link or code / (unchanged) |
| Create label | Running a game? |
| Create fields | Room name / Your name (the "(GM)" suffix is dropped because the block label covers it) |
| Grid body | Got a map with a grid already drawn on it? Match ours to it in seconds, so movement and distances line up with the squares your players see. Try it: drag the slider. |
| Grid slider label | Square size |
| Grid readout | **70** px squares · 1 square = **5** ft (the slider label already says "Square size") |
| Library body | (unchanged) |
| Library note | No sign-in needed. Your library is saved in this browser until accounts arrive, so it won't follow you to another computer or phone yet. |
| Your rooms note | Saved in this browser until accounts arrive. (unchanged) |
| Visibility title | (unchanged) Your players see what you decide they see. |
| Visibility body | Keep the ambush a surprise. Hide a monster and your players can't see it, can't find it in the turn order, and can't dig it out of their browser either. |
| Caption, GM view | The dashed token is hidden. Only you can see it. |
| Caption, player view | Your players see no token and no gap in the turn order. Nothing gives it away. |
| Dice body | Type a roll like 2d6+3. Everyone at the table sees every die land, not just the total. |
| Dice field label | What to roll (not "Roll": the submit button is already called Roll, and a field and button with the same name read as one control to a screen reader) |
| Closing | Ready to run a game? Start a room and send your players the link. |

The player-view caption still says the token's place in the turn order is withheld ("no gap in the turn order"), and the library note still states no sign-in and no other devices. Both existing `gm-home` scenarios are therefore met. The home-page-redesign rule of no em-dashes in rendered text still applies to all strings above.

Code comments that describe the implementation, such as "It mirrors what the server filters actually do", stay. The requirement covers visible text only.

### Closing CTA

`focusCreate` keeps scrolling to and focusing the room-name field. The field now sits lower in the hero, but `scrollIntoView({ block: "center" })` still centres it, so no change is needed. Verify manually.

## Risks / Trade-offs

- [Hero gets taller, pushing the map's visual weight down on laptops] → The map column is vertically centred against a taller text column, so check at 1366×768 that the map isn't cropped oddly, and fall back to `align-items: start` if it is.
- [Join above Create means the GM, the page's primary customer, reads past a form that isn't for them] → The join block is one row and labelled clearly, and Create keeps the only filled button.
- [Vocabulary drift: a future edit re-adds "server" or "overlay"] → The spec lists the banned terms. A cheap guard is a unit test that renders `HomePage` to static markup and greps its text. The web package has no DOM test setup, so that is optional; the manual check in tasks is the minimum.
- [The "until accounts arrive" wording goes stale when accounts ship] → It is a single string in two places and is noted here for whoever implements accounts.
