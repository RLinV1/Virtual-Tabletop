# Spec Delta

## MODIFIED Requirements

### Requirement: Library ownership and access
Every library asset SHALL belong to exactly one GM identity. All library endpoints SHALL be GM-only, and every one MUST authorize on the server. A GM MUST NOT be able to list, read metadata of, rename, re-grid or delete another GM's assets. Until accounts exist, that owner is the browser's GM device identity, with the lifetime and retention defined in the `gm-home` capability. Browsing the library never creates an owner (see "Browsing the library does not create an owner").

#### Scenario: Another GM's asset
- **WHEN** GM B requests rename, delete or usage for an asset owned by GM A
- **THEN** the server responds 404 and the asset is unchanged

#### Scenario: Player credential rejected
- **WHEN** a request to a library endpoint carries only a room guest credential
- **THEN** the server responds 401

## ADDED Requirements

### Requirement: Assets whose owner can no longer be proven
Clearing browser storage destroys the only proof of ownership of a device-owned asset. The product SHALL NOT offer a recovery, claim or transfer path for such assets while the device identity exists (DESIGN.md §13.1), and SHALL warn before the user relies on it.

#### Scenario: Storage cleared
- **WHEN** a browser's GM token is lost and the same browser opens the asset library
- **THEN** an empty library is shown, the previously uploaded assets are not reachable, and no recovery flow is offered

#### Scenario: The risk is disclosed up front
- **WHEN** the product promotes saving maps or token art without an account
- **THEN** it states that the library is tied to this browser
