# Spec Delta

## MODIFIED Requirements

### Requirement: GM device identity
Until accounts exist (FR-GM-01), a GM SHALL be identified by a GM token that the browser generates and keeps in local storage. The server MUST store only a one-way hash of the token. The token SHALL be created the first time the browser performs a GM **write**, which is creating a room or uploading a library asset. Opening a GM surface (the dashboard or the asset library) or continuing as a guest MUST NOT create an identity. It SHALL own every room created and every library asset uploaded from that browser.

#### Scenario: First GM action creates the identity
- **WHEN** a browser with no GM token creates a room
- **THEN** a GM token is generated and stored in the browser, and the new room is owned by that GM identity

#### Scenario: Reading does not create an identity
- **WHEN** a browser with no GM token opens the asset library or the GM dashboard
- **THEN** no GM token is stored and no GM identity is created on the server

#### Scenario: Server never holds the raw token
- **WHEN** the server records a GM identity
- **THEN** only a hash of the token is persisted, and the raw token appears in no stored record

#### Scenario: Missing or unknown token
- **WHEN** a request to a GM-only endpoint carries no GM token, or a token the server does not recognise
- **THEN** the server responds 401 and returns no GM data

### Requirement: Account UI placeholder
The app SHALL provide sign-in (`/signin`) and create-account (`/signup`) screens, and an account menu in the GM dashboard header and the asset library header. These SHALL be laid out as FR-GM-01 will need them: email, password, and display name on sign-up. Until accounts are implemented, the sign-in screen SHALL offer "Continue as guest" above its form, and submitting either form SHALL NOT send credentials anywhere. The screen SHALL instead state that accounts are not available yet and that the GM's rooms and library are saved on this device.

#### Scenario: Submitting sign-in before accounts exist
- **WHEN** a user fills in the sign-in form and submits
- **THEN** no network request carrying the email or password is made, and a notice explains that accounts are coming and that work is saved on this device

#### Scenario: Guest option comes first
- **WHEN** a user opens the sign-in screen
- **THEN** "Continue as guest" and its note that work is saved in this browser appear above the email and password fields

#### Scenario: Account menu without an account
- **WHEN** a GM with a device identity opens the account menu
- **THEN** it shows that they are using this device's identity and offers sign-in and create-account links

### Requirement: One home page
`/` SHALL render one page for every visitor. It SHALL NOT render a structurally different page depending on whether a GM identity exists, and it SHALL NOT list the rooms a GM owns; those are on the GM dashboard. Navigating away from `/` and returning, by link or by browser history, SHALL return the visitor to the same page they left.

#### Scenario: Back returns to the page you left
- **WHEN** a visitor opens `/`, follows the link into the GM flow, and presses the browser Back button
- **THEN** they are returned to the same home page

#### Scenario: A returning GM sees the same page
- **WHEN** a browser that owns rooms opens `/`
- **THEN** the same page is shown as for a first-time visitor, with no list of rooms

#### Scenario: Rooms section stays away when empty
- **WHEN** a browser owns no rooms, or the room list cannot be loaded
- **THEN** no rooms section is rendered and no error is shown on the home page, as for every other visitor

### Requirement: Both paths in the first screen
The home page SHALL present a path for joining an existing game and a path for running one, both visible without scrolling, with the join path placed before the run path. Each path SHALL be labelled with the reader it is for. The join path SHALL be a form. The run path SHALL be a link that enters the GM dashboard under its entry rule, not a room creation form. The page SHALL NOT offer a second join form elsewhere.

#### Scenario: Laptop viewport
- **WHEN** a visitor opens `/` in a 1366×768 viewport
- **THEN** the invite link field and its Join button are fully visible without scrolling, above the link for running a game

#### Scenario: Phone viewport
- **WHEN** a visitor opens `/` in a 390×844 viewport
- **THEN** the invite link field, its Join button and the link for running a game are fully visible without scrolling, and appear before the hero map

#### Scenario: Owned rooms do not push join down
- **WHEN** a browser that owns rooms opens `/`
- **THEN** the join path stays exactly where it is for a first-time visitor, since the home page lists no rooms

#### Scenario: Each path names its reader
- **WHEN** a visitor reads the hero
- **THEN** the join path is labelled for someone joining a game their GM invited them to, and the run path is labelled for someone running a game

#### Scenario: The run path enters the GM flow
- **WHEN** a visitor follows the link for running a game
- **THEN** they reach the GM dashboard, or the sign-in page first if the browser is not recognised

#### Scenario: Join still accepts a link or a code
- **WHEN** a visitor submits a full invite link or a bare invite code in the hero's join field
- **THEN** they are taken to that invite's join page, and input that is neither shows an error beside the field
