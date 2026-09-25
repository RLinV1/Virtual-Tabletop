# Spec Delta

## MODIFIED Requirements

### Requirement: GM device identity
Until accounts exist (FR-GM-01), a GM SHALL be identified by a GM token that the browser generates and keeps in local storage. The server MUST store only a one-way hash of the token. The token SHALL be created the first time the browser performs a GM **write**, which is creating a room or uploading a library asset. Opening a GM surface (the dashboard or the asset library) or continuing as a guest MUST NOT create an identity. It SHALL own every room created and every library asset uploaded from that browser.

The identity is a time-boxed bridge. It SHALL NOT be presented to the user as an account, and the product SHALL NOT add ownership transfer, claiming or merging of device-owned rows while it exists (DESIGN.md §13.1).

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

#### Scenario: The bound is stated, not implied
- **WHEN** a surface offers to save a room or an asset without an account
- **THEN** it states that what is saved is tied to this browser and does not follow the user to another browser or device

## ADDED Requirements

### Requirement: Unclaimed identities expire
A GM identity that owns no rooms and no library assets SHALL be deleted after 30 days without use. An identity that owns at least one room or asset SHALL be retained until accounts replace it.

#### Scenario: Casual visitor leaves nothing behind
- **WHEN** a GM identity has owned no rooms and no assets for 30 days
- **THEN** the identity is deleted and any request presenting its token is treated as unknown

#### Scenario: An identity with content is kept
- **WHEN** a GM identity owns at least one room or asset and has been idle for 30 days
- **THEN** the identity is retained

### Requirement: Hosting is account-gated once accounts exist
When FR-GM-01 accounts land, creating a room SHALL require an authenticated account, and `rooms.owner_user_id` SHALL be non-null (DESIGN.md §13.1). Joining a room by invite SHALL continue to require no account. The GM device identity SHALL be removed at that point.

#### Scenario: Signed-out host after cutover
- **WHEN** a signed-out visitor starts room creation after accounts exist
- **THEN** they are taken to sign-in or sign-up, and authenticating takes them to the GM dashboard, where the create-room form is the first thing offered; "Continue as guest" is no longer shown

#### Scenario: Players are never gated
- **WHEN** a visitor follows an invite link after accounts exist
- **THEN** they join with a display name and no account is required or promoted
