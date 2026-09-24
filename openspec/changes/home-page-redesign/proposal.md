# Proposal

## Why

`/` was two different pages behind a `localStorage` flag. `HomePage` branched on whether the browser held a GM token and rendered either a landing page or a GM dashboard. Because `LibraryPage` mints a GM identity in a mount effect, **opening the asset library silently replaced the home page for the rest of the session**: a visitor who clicked "Open the asset library" and pressed Back did not return to the page they left. Two pages at one URL is also why the same work was built twice earlier in this milestone.

The landing half also did not do its job (KAN-56). It was a bare create-room form flanked by two more boxes, with no image anywhere, a 28-word subhead, and every card title rendered as an uppercase eyebrow because the global `h2` rule made it one. DESIGN.md §11.5 asks the home page to explain the product and show the differentiator; it explained nothing and showed nothing.

## What Changes

- **One page at `/`.** The branch is removed. Rooms you own are a band on that page, rendered only when there is something to show, so a first-time visitor and a returning GM see the same page and the returning GM sees one extra section.
- **The product is demonstrated, not described.** Three sections run real code rather than showing pictures of it: a live grid-size slider over a real map, a GM/player toggle that adds and removes a hidden token, and a dice box that imports `parseDiceExpression` and `rollDice` from `@vtt/shared` and shows every die. No screenshots and no mocked interface built out of `div`s.
- **The asset library is presented as a feature** rather than a footer link: a shelf of three maps with their real dimensions and default grid, and a plain statement that the library is tied to this browser.
- **Light and dark grounds**, following `prefers-color-scheme` with a manual toggle, scoped to the home page so the table stays dark. The ground is lit rather than ruled, and each map casts a bloom built from its own pixels.
- **One secondary control family.** Every bordered action on the page (the header pair, the theme toggle, Open, Join, Roll) shares one skin; only room creation is the primary fill.
- **Accessibility work that the old page failed:** every interactive boundary clears 3:1 and every label 4.5:1 in both grounds, all motion sits behind `prefers-reduced-motion`, and the control that used the global `.secondary` class had a 1.5:1 border.

## Capabilities

### Modified Capabilities
- `gm-home`: the landing and dashboard requirements collapse into one home page whose content varies by what the browser owns, not which page it renders.

## Impact

- **apps/web:** `pages/HomePage.tsx` (rewritten; `Dashboard`, `CreateRoomCard` and `JoinByInviteCard` removed as duplicates), new `theme.ts`, `styles.css`, `main.tsx` (self-hosted fonts), `index.html` (title and description), `public/img/` (three maps).
- **packages/shared:** one string. The dice parser's error message contained an em-dash and the landing surfaces it verbatim.
- **Dependencies added:** `@fontsource/geist-sans`, `@fontsource/geist-mono`, `@phosphor-icons/react`.
- **Not in scope:** `/library`'s own page, GM identity ownership (see the `device-identity-bridge` change), and the recovery chapter DESIGN.md §11.5 asks for, which needs an activity-log screenshot that does not exist yet.

## Divergence the team should rule on

`main` gained a design system in KAN-65: rust `#b9582f`, Alegreya Sans, 4px radius. This home page is blue `#5b8def`, Geist, 6px. The blue was chosen deliberately and is kept here, scoped to `.home-page` so the room and library keep the team's palette untouched. One accent token reverts it. **This is the one decision in this change that is a matter of taste rather than correctness, and it should be settled before merge.**
