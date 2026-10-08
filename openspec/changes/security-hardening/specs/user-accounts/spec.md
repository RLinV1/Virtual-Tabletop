## ADDED Requirements

### Requirement: Password change resists guessing
The server SHALL count failed current-password checks on password change for each account. After 10 failures within 15 minutes, further password-change requests for that account SHALL be refused with HTTP 429 and a `Retry-After` header until the window passes, even with the right current password. A refused request SHALL NOT check the password and SHALL NOT change it. A successful password change SHALL clear the count. For password change and for sign-in alike, each attempt SHALL be counted before its password is checked, so requests that arrive at the same moment cannot check more passwords than the limit allows.

#### Scenario: Guessing the current password is stopped
- **WHEN** someone signed in as Sam submits 10 password changes with wrong current passwords within 15 minutes, and an 11th with the right one
- **THEN** the 11th is refused with 429 and a `Retry-After` header, and Sam's password is unchanged

#### Scenario: A burst is limited too
- **WHEN** 12 password-change requests with wrong current passwords for one account, or 12 sign-ins with wrong passwords for one email, arrive at the same moment
- **THEN** at most 10 passwords are checked, and the rest are refused with 429

#### Scenario: Window passes
- **WHEN** the 15-minute window after those failures has passed
- **THEN** a password change with the right current password succeeds
