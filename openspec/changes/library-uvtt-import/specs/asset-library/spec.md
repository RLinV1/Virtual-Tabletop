# Spec Delta

## ADDED Requirements

### Requirement: Import a complete reusable UVTT map
The library SHALL accept UVTT, DD2VTT and DF2VTT maps for signed-in accounts, reusing room import's bounded validation pipeline. Successful imports SHALL save image, exact grid, complete wall geometry, portal metadata and source together as one owned library asset, without requiring a room. Library import SHALL inherit default distance units and styling. Unsupported optional data SHALL yield bounded warnings. Token-art uploads SHALL remain image-only.

#### Scenario: Import and review
- **WHEN** a signed-in user selects a valid UVTT map in the library
- **THEN** the complete map is saved, its editor opens with the imported grid and geometry, warnings remain visible, and closing the editor keeps the saved map

#### Scenario: Reject an invalid file
- **WHEN** supported UVTT data or image validation fails
- **THEN** the library retains its existing assets, reports a bounded actionable error, removes temporary files, and allows the user to retry

#### Scenario: Failed asset persistence
- **WHEN** writing the complete imported map fails
- **THEN** no partial map row is created and its newly stored image is removed

### Requirement: Authorize library imports and preserve ownership
The server SHALL check account authorization, same-origin protection and attempt limits before receiving the file, recheck session liveness after validation, and protect imported geometry through existing owner-scoped endpoints. Imports SHALL use existing upload, image, geometry, worker and diagnostic limits.

#### Scenario: Unauthorized or ended session
- **WHEN** a signed-out user uploads a file, or a session ends during validation
- **THEN** no library map is created

#### Scenario: Foreign map
- **WHEN** another account requests imported geometry or attempts to apply that map as an owned library asset
- **THEN** the server rejects access without disclosing geometry
