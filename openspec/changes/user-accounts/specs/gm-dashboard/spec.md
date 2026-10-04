# Spec Delta

## MODIFIED Requirements

### Requirement: GM dashboard
The app SHALL provide a GM dashboard at `/gm-dashboard` for a signed-in account. It SHALL offer a form to create a room, taking a room name and the GM's display name for that room. It SHALL list the account's rooms in two groups: **Hosting**, the rooms the account owns, and **Playing**, the rooms where the account holds an active player seat (see `room-membership`). Each room SHALL show its name, when it was last active and an Open action. A group with no rooms SHALL be left out, except that Hosting SHALL always offer room creation. It SHALL link to the asset library and show the account menu. It SHALL state that the rooms it lists are saved to the account and can be opened on any device the person signs in on.

#### Scenario: Returning GM finds their rooms
- **WHEN** a signed-in account that owns rooms opens the dashboard
- **THEN** each room is listed with its name and last activity, newest activity first, and Open takes the GM into that room

#### Scenario: Rooms the account plays in
- **WHEN** signed-in Kim, who owns no rooms and plays in Sam's "Goblin Cave", opens the dashboard
- **THEN** "Goblin Cave" is listed under Playing, and Open takes Kim back into her player seat, on this device or any other

#### Scenario: No rooms yet
- **WHEN** a signed-in account that owns no rooms opens the dashboard
- **THEN** an empty state invites the GM to create their first room

#### Scenario: Creating a room from the dashboard
- **WHEN** a signed-in GM submits a room name and their display name on the dashboard
- **THEN** the room is created and owned by the account, and the GM is taken into it

#### Scenario: Creating a room without an account
- **WHEN** a request to create a room carries no valid session
- **THEN** the server responds 401 and no room is created

#### Scenario: Room list cannot be loaded
- **WHEN** the rooms request fails
- **THEN** the dashboard still offers room creation and the library link, and shows that the room list could not be loaded

### Requirement: One entry rule for the dashboard
Every way into a GM surface, meaning the GM dashboard and the asset library, SHALL apply the same rule. A signed-in browser SHALL reach the surface directly. Any other browser SHALL be taken to the sign-in page with the surface as its `next` destination, and SHALL reach that surface once signed in or signed up. This applies to the home page's link, to other links into those surfaces, and to opening `/gm-dashboard` or `/library` directly. While the browser is still checking whether it is signed in, the surface SHALL show neither its content nor the sign-in page. The home page SHALL NOT link to the asset library; the GM dashboard is its way in. The asset library is the signed-in person's own library, whether they host games or only play in them.

There is one exception: `/library?tab=dice` SHALL open the Dice tab on its own for a signed-out browser, with no sign-in step and none of the other tabs. It SHALL show the looks kept in that browser, and offer a quiet sign-in link that keeps looks on every device (see `dice-looks`). Every player has dice, and dice looks involve no GM data. No other part of the library SHALL open this way.

#### Scenario: First-time GM from the home page
- **WHEN** a signed-out browser follows the home page's "Set up a room" link
- **THEN** the sign-in page opens, and signing in or creating an account from it opens the dashboard

#### Scenario: Direct visit behaves the same
- **WHEN** a signed-out browser opens `/gm-dashboard` directly
- **THEN** it is taken to the sign-in page, exactly as if it had followed the home page's link

#### Scenario: Recognised browser goes straight in
- **WHEN** a signed-in browser follows the home page's link or opens `/gm-dashboard`
- **THEN** the dashboard opens with no sign-in step

#### Scenario: Back does not loop
- **WHEN** a browser is taken from the dashboard URL to the sign-in page and the user presses Back
- **THEN** they return to the page they came from, not to a redirect that sends them to sign-in again

#### Scenario: Direct visit to the library
- **WHEN** a signed-out browser opens `/library` directly
- **THEN** it is taken to the sign-in page, signing in returns it to the library, and pressing Back before signing in returns it to the page it came from

#### Scenario: Recognised browser opens the library
- **WHEN** a signed-in browser opens `/library`, directly or from the dashboard's library link
- **THEN** the library opens with no sign-in step

#### Scenario: Session ended elsewhere
- **WHEN** a GM's session ends while the dashboard is open, and the dashboard's next request is refused as signed out
- **THEN** the GM is taken to the sign-in page with the dashboard as `next`

#### Scenario: A player opens their dice looks
- **WHEN** a signed-out browser opens `/library?tab=dice`, for example from a room's Edit looks link
- **THEN** the Dice tab opens on its own, showing the looks kept in this browser, with no sign-in step and none of the other tabs

#### Scenario: A signed-in player opens their library
- **WHEN** signed-in Kim, who has never hosted, follows a room's Edit looks link
- **THEN** her library opens on the Dice tab, showing her account's looks

#### Scenario: No library link on the home page
- **WHEN** a visitor reads the home page
- **THEN** no link or button opens the asset library, and the library section says it is found on the GM dashboard

## REMOVED Requirements

### Requirement: Continue as guest
**Reason**: Hosting requires an account (DESIGN.md §13.1, FR-GM-01). A guest host owned rooms through a browser token that was lost when site data was cleared, and could not move to another device.
**Migration**: The sign-in page no longer offers "Continue as guest", and the stored guest choice (`vtt.gmGuest`) is ignored and removed. A browser with a legacy GM token is offered the move into an account on the dashboard (see "Bring this browser's rooms into the account"). Players are unaffected: joining by invite never asked for an account.

## ADDED Requirements

### Requirement: Bring this browser's rooms into the account
When a signed-in GM opens the dashboard in a browser that still holds a legacy GM token the server knows, the dashboard SHALL offer to move that token's rooms, library assets and creatures into the account. The offer SHALL say how many of each it will move, and SHALL be a separate action the GM chooses. It SHALL NOT happen on sign-in by itself. After a successful move, the browser SHALL delete the token from storage, the offer SHALL disappear, and the moved rooms SHALL be listed under the account. When the server does not recognise the token, the browser SHALL delete it and make no offer. The GM SHALL be able to dismiss the offer for the current visit.

#### Scenario: Legacy GM moves their rooms
- **WHEN** a browser whose token owns 2 rooms and 3 assets signs in and the GM accepts the offer
- **THEN** the dashboard lists both rooms under the account, the library shows the 3 assets, and the browser no longer stores the GM token

#### Scenario: Nothing to bring
- **WHEN** a browser holds a GM token the server no longer recognises and the GM signs in
- **THEN** no offer is shown and the token is removed from the browser

#### Scenario: Not now
- **WHEN** the GM dismisses the offer
- **THEN** the offer is hidden for this visit, nothing moves, and it is offered again on the next visit
