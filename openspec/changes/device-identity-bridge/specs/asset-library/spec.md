# Spec Delta

## Purpose

Applies the device-identity lifetime to library assets: what owns them, what happens when nobody can prove ownership, and that browsing never creates an owner.

## MODIFIED Requirements

### Requirement: Library assets are owned by a GM identity
Every library asset SHALL be owned by exactly one GM identity, and SHALL be readable, renameable and deletable only by that owner. Until accounts exist that owner is the browser's GM device identity, with the lifetime and retention defined in the `gm-home` capability.

Browsing the library MUST NOT create an owner. A browser with no GM identity SHALL see an empty library and an invitation to upload, and the identity SHALL be created by that first upload.

#### Scenario: Browsing without an identity
- **WHEN** a browser with no GM token opens the asset library
- **THEN** an empty state is shown, no server request for assets is made, and no identity is created

#### Scenario: First upload creates the owner
- **WHEN** a browser with no GM token uploads a map
- **THEN** a GM identity is created and the asset is owned by it

#### Scenario: Another identity cannot reach the asset
- **WHEN** a request presents a different GM token than the asset's owner
- **THEN** the server responds 404 and reveals nothing about the asset

## ADDED Requirements

### Requirement: Assets whose owner can no longer be proven
Clearing browser storage destroys the only proof of ownership of a device-owned asset. The product SHALL NOT offer a recovery, claim or transfer path for such assets while the device identity exists (DESIGN.md §13.1), and SHALL warn before the user relies on it.

#### Scenario: Storage cleared
- **WHEN** a browser's GM token is lost and the same browser opens the asset library
- **THEN** an empty library is shown, the previously uploaded assets are not reachable, and no recovery flow is offered

#### Scenario: The risk is disclosed up front
- **WHEN** the product promotes saving maps or token art without an account
- **THEN** it states that the library is tied to this browser
