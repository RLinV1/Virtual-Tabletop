# Spec Delta

## Purpose

Gives a person a persistent, trusted identity (FR-GM-01): an account they create with an email and password and sign in to from any browser. It owns everything they make: rooms they host, and their library of maps, token art, creatures and dice looks. Hosting requires an account. Playing never does, though a player may sign in to bring their own library, such as their dice, to any game.

## ADDED Requirements

### Requirement: Create an account
A visitor SHALL be able to create an account with an email address, a password and a display name. The server SHALL trim the email and compare it case-insensitively, so `Sam@Example.com ` and `sam@example.com` are the same account. The email SHALL be at most 254 characters and contain one `@` with text on both sides. The password SHALL be 8 to 128 characters, SHALL NOT equal the email, and SHALL have no other composition rule. The display name SHALL be 1 to 40 characters after trimming. A valid request SHALL create the account and sign the new account in. An email that already has an account SHALL be refused with HTTP 409, and no second account SHALL be created.

#### Scenario: New account is signed in
- **WHEN** a visitor signs up with `sam@example.com`, a 12-character password and the display name "Sam"
- **THEN** the account is created, the response sets a session cookie, and asking the server who is signed in returns Sam's account

#### Scenario: Email is case- and space-insensitive
- **WHEN** an account exists for `sam@example.com` and a visitor signs up with ` Sam@Example.COM`
- **THEN** the server responds 409 and still has exactly one account for that email

#### Scenario: Weak or oversized input
- **WHEN** a visitor signs up with a 7-character password, a 129-character password, a password equal to their email, or a blank display name
- **THEN** the server responds 400 naming the field, and no account is created

### Requirement: Sign in and sign out
A person with an account SHALL be able to sign in with their email and password, and SHALL be signed in when both match. A wrong password and an email with no account SHALL produce the same HTTP 401 response with the same message, "Email or password is incorrect.", so a response never reveals whether an email has an account. Signing out SHALL end the session on the server and clear the cookie. A session that has ended SHALL NOT authorize any request, even if its cookie value is sent again.

#### Scenario: Correct credentials
- **WHEN** Sam signs in with the right email and password
- **THEN** the response sets a session cookie and Sam is signed in

#### Scenario: Unknown email and wrong password look the same
- **WHEN** one sign-in uses an email with no account and another uses Sam's email with a wrong password
- **THEN** both responses are 401 with an identical body

#### Scenario: Signed-out cookie is dead
- **WHEN** Sam signs out and a client then replays the old session cookie value
- **THEN** the server treats the request as signed out

### Requirement: Session cookie
A sign-in SHALL be carried by a session cookie that the server sets. Its value SHALL be an opaque random token with at least 256 bits of entropy, and it SHALL carry no account data. The cookie SHALL be `HttpOnly`, `SameSite=Lax` and `Path=/`, and SHALL be `Secure` whenever the app is served over HTTPS. A session SHALL end after 30 days without a request, or 90 days after sign-in, whichever comes first. A request carrying an ended or unknown session SHALL be treated as signed out, and its response SHALL clear the cookie.

#### Scenario: Cookie flags
- **WHEN** a sign-in succeeds
- **THEN** the `Set-Cookie` header marks the cookie `HttpOnly`, `SameSite=Lax` and `Path=/`, and page scripts cannot read it

#### Scenario: Idle session ends
- **WHEN** a session has not been used for more than 30 days
- **THEN** the next request with it is treated as signed out and the cookie is cleared

#### Scenario: Active session still ends
- **WHEN** a session has been used every day but was created more than 90 days ago
- **THEN** the next request with it is treated as signed out

### Requirement: Credentials are never stored or shown in usable form
The server SHALL store a password only as the output of a salted, memory-hard one-way hash, and a session token only as its SHA-256. No response, log line or stored record SHALL contain a password or a raw session token. No response SHALL include a password hash.

#### Scenario: Stored records hold no secrets
- **WHEN** an account signs up and signs in
- **THEN** no stored row contains the password or the session cookie's value, and the server log contains neither

#### Scenario: Account responses hold no secrets
- **WHEN** a signed-in client asks who is signed in
- **THEN** the response contains the account's id, email and display name, and no password hash and no session data

### Requirement: Change password
A signed-in account SHALL be able to change its password by giving its current password and a new one that meets the sign-up rules. A wrong current password SHALL be refused with HTTP 403 and change nothing. A successful change SHALL end every other session of that account immediately and keep the session that made the change.

#### Scenario: Other sessions end
- **WHEN** Sam is signed in on a laptop and a phone and changes the password from the laptop
- **THEN** the laptop stays signed in, the phone's next request is treated as signed out, and the new password signs in

#### Scenario: Wrong current password
- **WHEN** Sam submits a password change with a wrong current password
- **THEN** the server responds 403, the old password still works, and no session ends

### Requirement: Account endpoints resist guessing
The server SHALL rate-limit attempts to sign in and sign up. For one email, after 10 failed sign-ins within 15 minutes, further sign-ins for that email SHALL be refused with HTTP 429 until the window passes, even with the right password. From one IP address, sign-ins SHALL be limited to 30 per 15 minutes and sign-ups to 10 per hour. A refused attempt SHALL include a `Retry-After` header and SHALL NOT check the password. A successful sign-in SHALL clear the failure count for that email.

#### Scenario: Password guessing is stopped
- **WHEN** 10 sign-ins for Sam's email fail within 15 minutes and an 11th arrives with the right password
- **THEN** the 11th is refused with 429 and a `Retry-After` header, and Sam is not signed in

#### Scenario: Window passes
- **WHEN** the 15-minute window after those failures has passed
- **THEN** a sign-in with the right password succeeds

### Requirement: Cookie-authorized writes come from the app
A request that changes state and is authorized by the session cookie SHALL be refused with HTTP 403, and SHALL change nothing, when its `Origin` header names an origin other than the app's own. Account requests with a JSON body SHALL be refused with HTTP 415 unless their content type is `application/json`.

#### Scenario: Cross-site form post
- **WHEN** a page on another site makes Sam's browser post to the room-creation endpoint with Sam's session cookie
- **THEN** the server responds 403 and no room is created

#### Scenario: The app's own requests pass
- **WHEN** the app, served from its own origin, creates a room for signed-in Sam
- **THEN** the request is accepted

### Requirement: Move a browser's legacy rooms into an account
A signed-in account SHALL be able to move everything a legacy GM device identity owns into the account: its rooms, library assets and creatures. The request SHALL prove both identities: the session cookie and the device token. The move SHALL be all-or-nothing. After it, every moved item SHALL be owned by the account, the device identity SHALL be deleted, and the device token SHALL be unknown to the server. The move SHALL happen only when the person asks for it, and SHALL NOT be triggered by signing in. A request without a session SHALL be refused with HTTP 401. A device token the server does not know SHALL be refused with HTTP 404, and nothing SHALL move.

#### Scenario: Rooms and library follow the account
- **WHEN** a browser whose device token owns 2 rooms, 3 assets and 1 creature signs in as Sam and asks to move them
- **THEN** Sam's account owns all six items, the response reports those counts, and requests with the old device token get 401

#### Scenario: Token works only once
- **WHEN** the same device token is sent with a second move request, from this account or another
- **THEN** the server responds 404 and nothing changes

#### Scenario: Signing in alone moves nothing
- **WHEN** a browser holding a device token signs in and makes no move request
- **THEN** the device identity still owns its rooms and assets

#### Scenario: Partial failure moves nothing
- **WHEN** a move fails partway through
- **THEN** every item is still owned by the device identity and the device token still works

### Requirement: Account data stays out of rooms
An account's email and account id SHALL NOT appear in any room snapshot, room event, ephemeral relay or room REST response sent to any participant. A participant's name in a room SHALL remain the display name given for that room.

#### Scenario: Players never see the GM's email
- **WHEN** signed-in Sam creates a room and a player joins it
- **THEN** nothing the player receives contains Sam's email or account id

#### Scenario: The GM never sees a player's email
- **WHEN** signed-in player Kim joins Sam's room by invite
- **THEN** nothing Sam receives contains Kim's email or account id

### Requirement: An account is a person, not a role
An account SHALL NOT be tied to a role. The same account SHALL be able to host one room and play in another. Hosting a room SHALL require an account. Joining a room by invite SHALL NOT require one. The join path SHALL NOT ask for, or promote, an account before the visitor is in the game. A signed-in visitor who joins by invite SHALL get an ordinary player seat, with the same rights as a guest's, and the seat SHALL also be kept on their account (see `room-membership`).

#### Scenario: Guest player
- **WHEN** a signed-out visitor follows an invite link
- **THEN** they join with only a display name, and no account prompt appears before they are in the room

#### Scenario: Signed-in player
- **WHEN** signed-in Kim follows Sam's invite link
- **THEN** Kim joins as a player with the display name she enters, stays signed in, and nothing any other participant receives shows that her seat belongs to an account

#### Scenario: Host in one room, player in another
- **WHEN** Kim hosts "Crypt" and also plays in Sam's "Goblin Cave"
- **THEN** Kim is the GM in "Crypt" and a player in "Goblin Cave", with one account

### Requirement: Operator password reset
Until self-service reset exists, an operator with server access SHALL be able to give an account, named by email, a new random temporary password. The reset SHALL end every session of that account. It SHALL print the temporary password once and store only its hash. The reset SHALL NOT be reachable over HTTP.

#### Scenario: Locked-out GM is recovered
- **WHEN** an operator resets Sam's password
- **THEN** all of Sam's sessions end, the old password no longer signs in, and the printed temporary password does

#### Scenario: No web route
- **WHEN** any HTTP request tries to reset a password without the current one
- **THEN** no route exists that performs it
