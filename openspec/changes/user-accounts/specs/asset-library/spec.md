# Spec Delta

## MODIFIED Requirements

### Requirement: Library ownership and access
Every library asset SHALL belong to exactly one owner: the account that uploaded it, or a legacy GM device identity that uploaded it before accounts existed. All library endpoints SHALL be GM-only, and every one MUST authorize on the server. An owner MUST NOT be able to list, read metadata of, rename, re-grid or delete another owner's assets. Every signed-in account SHALL have a library, whether it hosts games or only plays in them, and SHALL see the same library from every device and in every room it is in. Placing a map, token art or a creature in a room SHALL remain something only that room's GM can do.

#### Scenario: Another GM's asset
- **WHEN** GM B requests rename, delete or usage for an asset owned by GM A
- **THEN** the server responds 404 and the asset is unchanged

#### Scenario: Player credential rejected
- **WHEN** a request to a library endpoint carries only a room guest credential
- **THEN** the server responds 401

#### Scenario: A player's library is not a way to place things
- **WHEN** signed-in Kim, a player in Sam's room, has maps in her library
- **THEN** Kim cannot place them in Sam's room; the server refuses as it refuses any player's map change

#### Scenario: Same library on another device
- **WHEN** Sam uploads a map on a laptop, then signs in on a phone and opens the library
- **THEN** the phone lists that map

## REMOVED Requirements

### Requirement: Browsing the library does not create an owner
**Reason**: Owners are no longer created by uploading. An account is created at sign-up, and the library is reachable only when signed in, so no request from the library can create an owner.
**Migration**: Replaced by "Uploading requires an account". The "no identity is minted on a read" property now holds for every GM surface (`gm-home`, "GM device identity").

## ADDED Requirements

### Requirement: Uploading requires an account
Uploading a library asset SHALL require a signed-in account, and the uploaded asset SHALL be owned by that account. An upload without a valid session SHALL be refused with HTTP 401, and nothing SHALL be stored, even when the request carries a legacy GM token.

#### Scenario: Signed-in upload
- **WHEN** signed-in Sam uploads a map named "Goblin Cave"
- **THEN** the asset is owned by Sam's account and listed in Sam's library

#### Scenario: Signed-out upload
- **WHEN** a request uploads to the library with no session, with or without a legacy GM token
- **THEN** the server responds 401, no object is stored and no asset is listed
