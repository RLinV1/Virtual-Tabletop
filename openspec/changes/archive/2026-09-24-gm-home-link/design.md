## Decisions

- **Placement.** First item in the board toolbar, before the participants button. The toolbar stays on screen when the sidebar is collapsed and on phones, while the panel header doesn't always.
- **Element.** The existing in-app `Link` (an `<a>`) styled as `.tool-button`, with Phosphor's `House` icon and a visible "Home" label, not an icon alone. `title` reads "Back to the home page".
- **Role check.** Rendered when `you.role === "gm"`, the same way the toolbar already shows Activity log to the GM only.
- **Tour.** No new guide step; the toolbar steps are about the board.

## Verification

- Browser: as the GM, the Home link is first in the toolbar and goes to `/` without a reload, and "Your rooms" lists the room. As a player (joined by invite), no Home link is rendered.
- `npm run lint && npm run typecheck && npm test`.
