# Spec Delta

## Purpose

Keeps a person's room seats on their account, so a GM or player can sign in on any device and carry on as the same participant, while guests who never sign in keep today's browser-held seats.

## ADDED Requirements

### Requirement: Seats taken while signed in belong to the account
Creating a room while signed in SHALL keep the room's GM seat on the account. Joining a room by invite while signed in SHALL keep the new player seat on the account. An account SHALL hold at most one seat per room. A signed-in join for a room where the account already holds an active seat SHALL be refused with HTTP 409 and the code `already_member`, and no participant SHALL be added. If the account's seat in that room was ended because the person left, a new join SHALL be accepted and SHALL replace the ended seat on the account. If the seat was ended because the GM removed the person, a signed-in join SHALL be refused with HTTP 403. Which seats belong to an account SHALL NOT be visible to any participant.

#### Scenario: Signed-in join keeps the seat
- **WHEN** signed-in Kim joins "Goblin Cave" by invite as "Kim"
- **THEN** her player seat is kept on her account, and "Goblin Cave" is listed under Playing on her dashboard

#### Scenario: No second seat for the same person
- **WHEN** Kim, who already plays in "Goblin Cave", opens its invite link while signed in on another device
- **THEN** the invite page offers "Resume as Kim" instead of the join form, and joining anyway is refused with `already_member`

#### Scenario: Back after leaving
- **WHEN** Kim left "Goblin Cave" and later follows its invite link while signed in
- **THEN** she joins as a new participant, and that new seat replaces the ended one on her account

#### Scenario: Removed stays removed
- **WHEN** the GM removed Kim from "Goblin Cave" and she follows a valid invite link while signed in
- **THEN** the join is refused with 403 and no participant is added

### Requirement: Resume a seat on any device
A signed-in account SHALL be able to open any room where it holds an active seat, from any browser. When the browser has no credential for that seat, the server SHALL issue a new one for the **same participant**, so the person keeps their name, tokens, rolls and history. The browser SHALL generate the credential, and the server SHALL store only its hash. Issuing it SHALL NOT append a room event and SHALL NOT disconnect the person's other devices. The room's owner SHALL always be able to resume its GM seat, including a room moved in from a legacy device identity that has no seat on the account yet. A request without a session SHALL get HTTP 401. A room where the account holds no seat and that it does not own SHALL get HTTP 404, the same answer as for a missing or deleted room. A seat that has ended SHALL be refused with HTTP 403 and the reason, `left` or `revoked`.

#### Scenario: GM switches device
- **WHEN** Sam created "Goblin Cave" on a laptop, signs in on a phone, and chooses Open on it
- **THEN** the phone joins the room as the same GM participant and sees the current state, while the laptop stays connected

#### Scenario: Player switches device
- **WHEN** Kim plays in "Goblin Cave" from her laptop, signs in on her tablet, and opens it from Playing
- **THEN** the tablet is in the room as the same participant "Kim", with her tokens, and the laptop stays connected

#### Scenario: No event for a new device
- **WHEN** a person resumes their seat on a second device
- **THEN** the room's event sequence number does not change, and no participant is added

#### Scenario: Not your room
- **WHEN** signed-in Alex asks to resume a seat in a room where he holds none and that he does not own
- **THEN** the server responds 404, issues no credential, and the response does not reveal that the room exists

#### Scenario: Ended seat
- **WHEN** Kim left "Goblin Cave" and asks to resume it from another device
- **THEN** the server responds 403 with the reason `left`, and no credential is issued

### Requirement: Keep a guest seat on the account
A person who joined a room as a guest and then signs in SHALL be offered, inside that room, to keep their seat on the account. Keeping it SHALL require two proofs in one request: the seat's credential, held by this browser, and the session. It SHALL keep the same participant and SHALL change nothing in the room. It SHALL link only the seat in the current room, and SHALL NOT pick up seats this browser holds in other rooms. It SHALL be refused, with nothing changed, when:
- the account already holds a different active seat in that room (the GM can reassign tokens instead);
- the seat already belongs to another account;
- the seat has ended.

#### Scenario: Signed in from the Dice tab mid-game
- **WHEN** guest "Kim" in "Goblin Cave" signs in from the library's Dice tab, returns to the room, and accepts "Keep this seat on your account"
- **THEN** her seat is kept on her account as the same participant, and "Goblin Cave" appears under Playing

#### Scenario: Account already has a seat here
- **WHEN** an account that already plays in "Goblin Cave" as "Kim" tries to keep a second guest seat "Kimberly" from the same room
- **THEN** the request is refused, neither seat changes, and the room explains that the GM can move Kimberly's tokens to Kim

#### Scenario: Only this room
- **WHEN** a browser holds guest seats in two rooms and the person keeps the seat in one of them
- **THEN** the seat in the other room stays a guest seat

### Requirement: A device's seats end with its sign-in
A seat credential that a browser created or received while signed in, or that it kept on the account, SHALL work only while the session that was active at that moment lasts. When that session ends (sign-out, expiry, a password change elsewhere, or an operator reset), those credentials SHALL stop working, and their open connections SHALL be closed with a session-ended message that tells the person to sign in again. The seat itself SHALL stay on the account, so signing in again SHALL resume it. Credentials of guests who never signed in SHALL be unaffected.

#### Scenario: Sign out on a shared computer
- **WHEN** Kim signs out on a library computer while "Goblin Cave" is open there
- **THEN** that computer's connection to the room is closed, reopening the room there does not reconnect as Kim, and Kim's laptop stays connected

#### Scenario: Back after signing in again
- **WHEN** Kim signs in again on the same computer and opens "Goblin Cave"
- **THEN** she is back in the room as the same participant

#### Scenario: Guests are unaffected
- **WHEN** a guest who never signed in reloads the room
- **THEN** their seat reconnects exactly as before
