# Spec Delta

## Purpose

Gives a GM a home in the app: a landing page for newcomers, a dashboard that finds their rooms again, and the account screens that FR-GM-01 will later bring to life.

## ADDED Requirements

### Requirement: GM device identity
Until accounts exist (FR-GM-01), a GM SHALL be identified by a GM token that the browser generates and keeps in local storage. The server MUST store only a one-way hash of the token. The token SHALL be created the first time the browser creates a room or opens the asset library. It SHALL own every room created and every library asset uploaded from that browser.

#### Scenario: First GM action creates the identity
- **WHEN** a browser with no GM token creates a room
- **THEN** a GM token is generated and stored in the browser, and the new room is owned by that GM identity

#### Scenario: Server never holds the raw token
- **WHEN** the server records a GM identity
- **THEN** only a hash of the token is persisted, and the raw token appears in no stored record

#### Scenario: Missing or unknown token
- **WHEN** a request to a GM-only endpoint carries no GM token, or a token the server does not recognise
- **THEN** the server responds 401 and returns no GM data

### Requirement: Landing page
A browser with no GM token SHALL see a landing page at `/`. It SHALL explain the product in one short section and offer: create a room, open the asset library, join with an invite link or code, sign in, and create an account.

#### Scenario: Newcomer visits home
- **WHEN** a browser with no GM token opens `/`
- **THEN** the landing page is shown with the create-room, library, join-by-invite, sign-in and create-account entry points

#### Scenario: Join by pasted invite
- **WHEN** a visitor pastes an invite link or bare invite code into the join field and submits
- **THEN** they are taken to that invite's join page

### Requirement: GM dashboard
A browser with a GM token SHALL see a dashboard at `/`. It SHALL list the rooms that GM identity owns, newest activity first, each showing the room name and when it was last active and offering an Open action. The dashboard SHALL also offer create-room and a link to the asset library.

#### Scenario: Returning GM sees their rooms
- **WHEN** a GM who has created two rooms opens `/`
- **THEN** both rooms are listed by name with their last-active time and an Open action

#### Scenario: Rooms of other GMs are not listed
- **WHEN** GM A opens the dashboard
- **THEN** no room owned by another GM identity appears, and the dashboard response contains no data about such rooms

#### Scenario: Open a room
- **WHEN** the GM chooses Open on a listed room
- **THEN** the browser navigates to that room as its GM

### Requirement: Account UI placeholder
The app SHALL provide sign-in (`/signin`) and create-account (`/signup`) screens, and an account menu in the dashboard header. These SHALL be laid out as FR-GM-01 will need them: email, password, and display name on sign-up. Until accounts are implemented, submitting either form SHALL NOT send credentials anywhere. The screen SHALL instead state that accounts are not available yet and that the GM's rooms and library are saved on this device.

#### Scenario: Submitting sign-in before accounts exist
- **WHEN** a user fills in the sign-in form and submits
- **THEN** no network request carrying the email or password is made, and a notice explains that accounts are coming and that work is saved on this device

#### Scenario: Account menu without an account
- **WHEN** a GM with a device identity opens the account menu
- **THEN** it shows that they are using this device's identity and offers sign-in and create-account links
