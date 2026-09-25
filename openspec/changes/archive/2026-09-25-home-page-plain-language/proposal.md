# Proposal

## Why

The home page is written for people who already know how the app is built. It says things like "the server filters every snapshot", "the same parser and roller" and "this is the overlay, not a picture of one", and it shows `cellSize` as a readout. That tells a tabletop player how the software works, not what it will do for their game. The page also serves two readers, the GM starting a room and the player who was sent a link, but only the GM's path is in the first screen. The join form sits in a band below the hero, pushed further down whenever "Your rooms" renders, and on a phone it lands below the map. "You" switches between GM and player with nothing to say which. The README's first-time usability targets (80% of first-time players join unaided, and a first-time GM is set up in under 4 minutes) both start on this page.

## What Changes

- **The hero offers two labelled paths, Join above Create.** The text column holds the headline, a subhead, a "Joining a game?" block (invite link or code, then **Join**) and then a "Running a game?" block (room name, your name, then **Create room**). The map stays on the right. Create room remains the page's only primary-filled button.
- **The join band below the hero is removed.** "Your rooms" follows the hero directly.
- **The join path is visible without scrolling** at 1366×768 and at 390×844, and on narrow screens both forms come before the map.
- **Who "you" is, stated once.** In the hero, each block names its reader. Below the hero, the feature sections sit under a "Running your game" heading: there "you" is the GM and players are "your players". Lines that apply to everyone say so.
- **The page describes what the app can do, in player language rather than implementation terms.** Tabletop vocabulary stays (GM, token, turn order, `2d6+3`, 5 ft squares). Implementation vocabulary goes (server, filter, snapshot, parser, overlay, `cellSize`). Copy is rewritten for the hero subhead, grid, library note, visibility body and captions, dice body and field label, and the closing line. The final strings are in `design.md`.
- **Kept on purpose:** the "until accounts arrive" notes, and the promise that players "can't dig it out of their browser either". The second is the hidden-information guarantee, stated as a promise to the GM rather than as an explanation of the server.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `gm-home`: adds requirements that the join path is visible in the first screen alongside the create path, that every use of "you" makes clear whether it means the GM or a player, and that the page describes capabilities in user terms, not implementation terms. Existing requirements are unchanged. The turn-order caption and the "tied to this browser" statement are still met in the new wording.

## Impact

- **apps/web:** `src/pages/HomePage.tsx` (hero restructure, `JoinByInviteBand` becomes a hero block, copy) and `src/styles.css` (hero stacking, removal of `.invite-band` rules).
- **No changes** to `packages/shared`, the server, schemas or events. The page still imports the same dice functions and `inviteCodeFrom` keeps its behaviour.
- **Sequencing:** `gm-home` is not yet in `openspec/specs/`, because it is introduced by the in-flight `home-page-redesign` change (task 4.6 is still open). Archive `home-page-redesign` before this change so the ADDED requirements land on an existing spec.
- **Not in scope:** a three-step orientation band, a glossary, the font decision (`home-page-redesign` 4.6), and the `/join/<code>` page itself.
