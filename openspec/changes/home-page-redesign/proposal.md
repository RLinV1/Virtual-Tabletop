# Proposal

## Why

`/` was two different pages behind a `localStorage` flag. `HomePage` branched on whether the browser held a GM token and rendered either a landing page or a GM dashboard. Because `LibraryPage` mints a GM identity in a mount effect, **opening the asset library silently replaced the home page for the rest of the session**: a visitor who clicked "Open the asset library" and pressed Back did not return to the page they left. Two pages at one URL is also why the same work was built twice earlier in this milestone.

The landing half also did not do its job (KAN-56). It was a bare create-room form flanked by two more boxes, with no image anywhere, a 28-word subhead, and every card title rendered as an uppercase eyebrow because the global `h2` rule made it one. DESIGN.md §11.5 asks the home page to explain the product and show the differentiator; it explained nothing and showed nothing.

## What Changes

- **One page at `/`.** The branch is removed. Rooms you own are a band on that page, rendered only when there is something to show, so a first-time visitor and a returning GM see the same page and the returning GM sees one extra section.
- **The product is demonstrated, not described.** Three sections run real code rather than showing pictures of it: a live grid-size slider over a real map, a GM/player toggle that adds and removes a hidden token, and a dice box that imports `parseDiceExpression` and `rollDice` from `@vtt/shared` and shows every die. No screenshots and no mocked interface built out of `div`s.
- **Map tokens carry character art.** The dragon map's tokens (Brenna, Toma, Ash) and the forest temple's (Brenna, Toma) show a face-cropped portrait, clipped to the disc as the board draws a token with an image. Each map has its own cast. If the art fails to load, the token falls back to its coloured disc and initial.
- **The asset library is presented as a feature** rather than a footer link: a shelf of three maps with their real dimensions and default grid, and a plain statement that the library is tied to this browser.
- **Light and dark grounds**, following `prefers-color-scheme` with a manual toggle, scoped to the home page so the table stays dark. The ground is lit rather than ruled, and each map casts a bloom built from its own pixels.
- **One secondary control family.** Every bordered action on the page (the header pair, the theme toggle, Open, Join, Roll) shares one skin; only room creation is the primary fill.
- **Accessibility work that the old page failed:** every interactive boundary clears 3:1 and every label 4.5:1 in both grounds, all motion sits behind `prefers-reduced-motion`, and the control that used the global `.secondary` class had a 1.5:1 border.

## Capabilities

### Modified Capabilities
- `gm-home`: the landing and dashboard requirements collapse into one home page whose content varies by what the browser owns, not which page it renders.

## Impact

- **apps/web:** `pages/HomePage.tsx` (rewritten; `Dashboard`, `CreateRoomCard` and `JoinByInviteCard` removed as duplicates), new `theme.ts`, `styles.css`, `main.tsx` (self-hosted fonts), `index.html` (title and description), `public/img/` (three maps, and five 192px token portraits under `img/tokens/`).
- **packages/shared:** one string. The dice parser's error message contained an em-dash and the landing surfaces it verbatim.
- **Dependencies added:** `@fontsource/geist-sans`, `@fontsource/geist-mono`, `@phosphor-icons/react`.
- **Not in scope:** `/library`'s own page, GM identity ownership (see the `device-identity-bridge` change), and the recovery chapter DESIGN.md §11.5 asks for, which needs an activity-log screenshot that does not exist yet.

## Relationship to KAN-65's design system

KAN-65 gave the app a slate-and-rust system. This page **adopts it**: `--accent`, `--panel`, `--border`, `--text`, `--muted`, `--field` and the status colours are all inherited, and links follow KAN-65's own treatment of text colour with a rust underline, because rust as link text is only 4.02:1 against the ground.

Three things that system does not provide are still defined here, scoped to `.home-page`:

- **A control border.** `--border-strong` is **1.66:1** against `--bg`, well under the 3:1 WCAG 1.4.11 asks of a control's visual boundary. This page uses `#646a78` (3.46:1) on the dark ground. **That is a defect in the shared tokens and deserves its own fix**, since every bordered control in the app has the same problem. (Since fixed in PR #21, `fix/control-border-contrast`: `--border-strong` is now `#6a7280`, 3.81:1 on `--bg`.)
- **A light palette.** KAN-65 is dark-only: its stylesheet contains no `prefers-color-scheme` or `data-theme` rules. The light side of slate-and-rust is therefore **new design work** introduced here (`#eceef1` ground, `#9c4726` rust for text, `#5b6270` muted), not adoption, and the team should review it as such.
- **The lit ground**, the per-map bloom and the grain, which are specific to this page.

Typography still differs: this page uses Geist, the app uses Alegreya Sans. That is a smaller, separate flip and is deliberately left open.
