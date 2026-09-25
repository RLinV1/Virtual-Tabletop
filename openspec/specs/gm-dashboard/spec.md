# gm-dashboard Specification

## Purpose
Gives the GM one place to work outside a room: create a room, reopen the rooms this browser owns, and reach the asset library, behind a single entry rule that points toward accounts without requiring one.

## Requirements

### Requirement: GM dashboard
The app SHALL provide a GM dashboard at `/gm-dashboard`. It SHALL offer a form to create a room (room name and the GM's display name), list the rooms this browser's GM identity owns with each room's name, when it was last active and an Open action, link to the asset library, and show the account menu. It SHALL state that the rooms it lists are saved in this browser.

#### Scenario: Returning GM finds their rooms
- **WHEN** a browser whose GM identity owns rooms opens the dashboard
- **THEN** each room is listed with its name and last activity, newest activity first, and Open takes the GM into that room

#### Scenario: No rooms yet
- **WHEN** a recognised browser with no GM identity, or whose identity owns no rooms, opens the dashboard
- **THEN** an empty state invites the GM to create their first room, and no request for rooms is made when there is no GM identity

#### Scenario: Creating a room from the dashboard
- **WHEN** a GM submits a room name and their display name on the dashboard
- **THEN** the room is created, owned by this browser's GM identity (created now if there was none), and the GM is taken into it

#### Scenario: Room list cannot be loaded
- **WHEN** the rooms request fails
- **THEN** the dashboard still offers room creation and the library link, and shows that the room list could not be loaded

### Requirement: One entry rule for the dashboard
A browser SHALL be *recognised* when it holds a GM identity or has previously chosen to continue as a guest. Every way into the dashboard SHALL apply the same rule: a recognised browser SHALL reach the dashboard directly, and any other browser SHALL be taken to the sign-in page first, which then returns it to the dashboard. This applies to the home page's link, to other links into the dashboard, and to opening `/gm-dashboard` directly.

#### Scenario: First-time GM from the home page
- **WHEN** a browser with no GM identity and no guest choice follows the home page's "Set up a room" link
- **THEN** the sign-in page opens, and continuing as a guest from it opens the dashboard

#### Scenario: Direct visit behaves the same
- **WHEN** a browser with no GM identity and no guest choice opens `/gm-dashboard` directly
- **THEN** it is taken to the sign-in page, exactly as if it had followed the home page's link

#### Scenario: Recognised browser goes straight in
- **WHEN** a browser that holds a GM identity, or that chose to continue as a guest before, follows the home page's link or opens `/gm-dashboard`
- **THEN** the dashboard opens with no sign-in step

#### Scenario: Back does not loop
- **WHEN** a browser is taken from the dashboard URL to the sign-in page and the user presses Back
- **THEN** they return to the page they came from, not to a redirect that sends them to sign-in again

### Requirement: Continue as guest
Until accounts exist, the sign-in page SHALL offer "Continue as guest" above the sign-in form. It SHALL state that accounts are not available yet and that the GM's rooms and library are saved in this browser. Continuing as a guest SHALL remember the choice in this browser and open the dashboard. It MUST NOT create a GM identity or send any request.

#### Scenario: Guest choice is remembered
- **WHEN** a user continues as a guest and later follows the home page's link again
- **THEN** the dashboard opens with no sign-in step

#### Scenario: Continuing as a guest creates nothing
- **WHEN** a browser with no GM identity continues as a guest
- **THEN** no GM token is stored, no request is sent, and no GM identity exists until the GM creates a room or uploads to the library

#### Scenario: Storage unavailable
- **WHEN** browser storage cannot be written and the user continues as a guest
- **THEN** the dashboard opens, and the choice holds until the page is reloaded instead of sending the user back to sign-in

### Requirement: GM surfaces lead back to the dashboard
Links on GM surfaces that return the GM to their rooms SHALL open the dashboard. The asset library's link back to the GM's rooms SHALL open `/gm-dashboard`.

#### Scenario: From the library to the rooms
- **WHEN** a GM on the asset library follows its link back to their rooms
- **THEN** the dashboard opens without a full page reload
