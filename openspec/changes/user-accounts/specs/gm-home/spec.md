# Spec Delta

## MODIFIED Requirements

### Requirement: The home page does not overstate what is saved
The home page SHALL describe saving rooms and library art as part of a free account. Wherever it mentions the library or saved rooms, it SHALL state that a free account is needed to host and that what is saved follows the account to any device. It SHALL state that players join without an account.

#### Scenario: The library is presented honestly
- **WHEN** the asset library is promoted on the home page
- **THEN** the page states that the library is kept in the GM's free account and is available from any device they sign in on

#### Scenario: Players are not asked for an account
- **WHEN** a visitor reads the home page's join path
- **THEN** nothing in it asks for or promotes an account

### Requirement: Both paths in the first screen
The home page SHALL present a path for joining an existing game and a path for running one, both visible without scrolling, with the join path placed before the run path. Each path SHALL be labelled with the reader it is for. The join path SHALL be a form. The run path SHALL be a link that enters the GM dashboard under its entry rule, not a room creation form. Beside the run path, the page SHALL carry the line "Free account required to host; players join without one." The page SHALL NOT offer a second join form elsewhere.

#### Scenario: Laptop viewport
- **WHEN** a visitor opens `/` in a 1366×768 viewport
- **THEN** the invite link field and its Join button are fully visible without scrolling, above the link for running a game

#### Scenario: Phone viewport
- **WHEN** a visitor opens `/` in a 390×844 viewport
- **THEN** the invite link field, its Join button and the link for running a game are fully visible without scrolling, and appear before the hero map

#### Scenario: Owned rooms do not push join down
- **WHEN** a signed-in GM who owns rooms opens `/`
- **THEN** the join path stays exactly where it is for a first-time visitor, since the home page lists no rooms

#### Scenario: Each path names its reader
- **WHEN** a visitor reads the hero
- **THEN** the join path is labelled for someone joining a game their GM invited them to, and the run path is labelled for someone running a game

#### Scenario: The run path enters the GM flow
- **WHEN** a visitor follows the link for running a game
- **THEN** a signed-in visitor reaches the GM dashboard, and a signed-out visitor reaches the sign-in page first, which returns them to the dashboard after they sign in or sign up

#### Scenario: The hosting rule is stated where it applies
- **WHEN** a visitor reads the run path
- **THEN** the line "Free account required to host; players join without one." appears beside it

#### Scenario: Join still accepts a link or a code
- **WHEN** a visitor submits a full invite link or a bare invite code in the hero's join field
- **THEN** they are taken to that invite's join page, and input that is neither shows an error beside the field

## REMOVED Requirements

### Requirement: GM device identity
**Reason**: A browser token is no longer how a GM is identified. Accounts (FR-GM-01) own new rooms, assets and creatures, and the device identity is kept only for what it already owns. Its old rule, that the first room or upload creates the identity, no longer holds.
**Migration**: Replaced by "Legacy GM device identity" below. Existing tokens keep working for what they own and can be moved into an account (`user-accounts`, "Move a browser's legacy rooms into an account").

### Requirement: Account UI placeholder
**Reason**: Accounts now exist, so the placeholder forms that sent nothing and the "accounts are coming" notice are replaced by working screens.
**Migration**: See "Account screens" below and the `user-accounts` capability. The `/signin` and `/signup` routes keep their paths.

## ADDED Requirements

### Requirement: Legacy GM device identity
The GM device identity is legacy. It is a GM token that browsers generated before accounts existed and kept in local storage, and the server stores only a one-way hash of it. The browser MUST NOT generate a new GM token, and the server MUST NOT register a new device identity. A device identity the server still knows SHALL keep listing, reading, editing and deleting the rooms, library assets and creatures it owns. It MUST NOT create a room, upload a library asset or create a creature. Its contents SHALL move into an account only through the explicit move defined in the `user-accounts` capability.

#### Scenario: No new device identities
- **WHEN** a browser with no GM token creates a room, uploads to the library, or opens any GM surface
- **THEN** no GM token is stored and no device identity is created on the server

#### Scenario: Legacy identity keeps what it has
- **WHEN** a browser holding a known GM token lists its rooms, renames one of its assets, or deletes one of its creatures
- **THEN** the request succeeds as before

#### Scenario: Legacy identity cannot create
- **WHEN** a request carries a known GM token and no session, and tries to create a room, upload a library asset or create a creature
- **THEN** the server responds 401 and nothing is created

#### Scenario: Server never holds the raw token
- **WHEN** the server holds a device identity
- **THEN** only a hash of the token is persisted, and the raw token appears in no stored record

#### Scenario: Missing or unknown token
- **WHEN** a request to a GM-only endpoint carries no session and either no GM token or a token the server does not recognise
- **THEN** the server responds 401 and returns no GM data


### Requirement: Account screens
The app SHALL provide a sign-in screen at `/signin` and a create-account screen at `/signup`, each linking to the other. Sign-up SHALL ask for email, password and display name, and SHALL state the password rule (8 to 128 characters) before the field rather than only as an error. Both screens SHALL accept a `next` parameter. They SHALL return to it after success only when it is a path on this site; otherwise they SHALL go to the GM dashboard. A signed-in visitor who opens either screen SHALL be sent to `next` or the dashboard. The GM dashboard and the asset library SHALL show an account menu with the account's display name and email, a change-password action and Sign out. Signing out SHALL return to the home page.

#### Scenario: Sign up and continue
- **WHEN** a visitor opens `/signup?next=/gm-dashboard`, creates an account, and the request succeeds
- **THEN** they land on the GM dashboard, signed in

#### Scenario: Off-site next is ignored
- **WHEN** a visitor signs in from `/signin?next=https://evil.example/` or `/signin?next=//evil.example`
- **THEN** they land on the GM dashboard, not the other site

#### Scenario: Error shown in place
- **WHEN** a sign-in is refused as incorrect, or refused as rate-limited
- **THEN** the screen shows "Email or password is incorrect." or a try-again-later message beside the form, and keeps the typed email

#### Scenario: Sign out
- **WHEN** a signed-in GM chooses Sign out from the account menu
- **THEN** the session ends, they land on the home page, and opening `/gm-dashboard` again leads to sign-in
