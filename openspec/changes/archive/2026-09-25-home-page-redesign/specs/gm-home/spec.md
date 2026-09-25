# Spec Delta

## ADDED Requirements

### Requirement: One home page
`/` SHALL render one page for every visitor. Its content MAY vary by what the browser owns, but it SHALL NOT render a structurally different page depending on whether a GM identity exists. Navigating away from `/` and returning, by link or by browser history, SHALL return the visitor to the same page they left.

#### Scenario: Back returns to the page you left
- **WHEN** a visitor with no GM identity opens `/`, follows the asset library link, and presses the browser Back button
- **THEN** they are returned to the same home page, even though opening the library created a GM identity

#### Scenario: A returning GM sees the same page
- **WHEN** a browser that owns rooms opens `/`
- **THEN** the same page is shown, with one additional section listing those rooms

#### Scenario: Rooms section stays away when empty
- **WHEN** a browser owns no rooms, or the room list cannot be loaded
- **THEN** no rooms section is rendered and no error is shown on the home page

### Requirement: The home page demonstrates the product
The home page SHALL show what the product does using the product's own behaviour, not depictions of it. It SHALL NOT contain an interface built to look like a screenshot. It SHALL include at least one real battle map image. Tokens shown on its maps SHALL be drawn the way the board draws a token, including the token's art when it has some.

#### Scenario: Grid alignment is operable
- **WHEN** a visitor drags the cell-size control
- **THEN** a real grid overlay resizes over a real map image, and the current cell size is shown

#### Scenario: Visibility is shown from both sides
- **WHEN** a visitor switches between the GM view and the player view
- **THEN** a token marked hidden is present in one and absent from the other, and the caption states that its place in the turn order is withheld too

#### Scenario: Dice run the real engine
- **WHEN** a visitor submits a dice expression
- **THEN** it is parsed and rolled by the same shared functions the table uses, every die is shown alongside the total, and an invalid expression shows the parser's own message

#### Scenario: Tokens are drawn as the board draws them
- **WHEN** a map on the home page shows a token that has character art
- **THEN** the art fills the token's disc, clipped to its circle, with its ring, hit-point bar and name kept; if the art fails to load, the token shows its coloured disc and initial instead

### Requirement: Both grounds, on the home page only
The home page SHALL support a light and a dark ground, following the system preference by default and offering a manual override that persists. The setting SHALL apply to the home page only, leaving the table's ground unchanged.

#### Scenario: System preference is followed
- **WHEN** a visitor whose system prefers light opens `/` without having chosen a ground
- **THEN** the light ground is used

#### Scenario: The table is unaffected
- **WHEN** a visitor who has chosen the light ground opens a room
- **THEN** the room renders on its own dark ground

#### Scenario: Storage unavailable
- **WHEN** local storage cannot be read or written
- **THEN** the home page renders on the system-preferred ground and the override silently does not persist

### Requirement: Contrast and motion on the home page
Every text label on the home page SHALL meet WCAG AA contrast against its own background, and every interactive control's visual boundary SHALL meet 3:1, in both grounds. All animation SHALL be disabled under `prefers-reduced-motion: reduce`, and no scroll position listener SHALL be used to drive it.

#### Scenario: Both grounds pass
- **WHEN** contrast is measured for body text, control labels and control borders in each ground
- **THEN** text pairs are at least 4.5:1 and control boundaries at least 3:1

#### Scenario: Reduced motion
- **WHEN** a visitor prefers reduced motion
- **THEN** entry, reveal, dice-throw and hover transitions do not run, and the page renders in its settled state

### Requirement: The home page does not overstate what is saved
Where the home page offers to save a room or an asset without an account, it SHALL state that what is saved is tied to that browser.

#### Scenario: The library is presented honestly
- **WHEN** the asset library is promoted on the home page
- **THEN** the page states that no sign-in is needed and that the library does not follow the user to another device

## REMOVED Requirements

### Requirement: Landing page
**Reason**: `/` no longer branches on whether the browser holds a GM token. The separate landing page is replaced by one home page for every visitor.
**Migration**: See "One home page" and "The home page demonstrates the product". The landing page's actions (create a room, open the asset library, join with an invite link or code, sign in, create an account) remain on that page.

### Requirement: GM dashboard
**Reason**: A GM token no longer swaps `/` for a dashboard. That swap made opening the asset library silently replace the home page for the rest of the session.
**Migration**: See "One home page". Owned rooms appear as a "Your rooms" section on the same page, with name, last activity and Open, and only when the browser owns rooms.
