# Spec Delta

## ADDED Requirements

### Requirement: Preserve shared UVTT wall metadata
Owned-library map geometry SHALL reuse the room wall shape without IDs, preserving optional UVTT portal metadata and geometry source through the shared editor, storage and room-copy commands. Validation SHALL reject unknown fields, IDs, invalid metadata and excessive geometry without replacing the saved board. Reordering object keys during validation SHALL NOT make an unchanged draft dirty. This SHALL NOT add UVTT file import to the library.

#### Scenario: Full wall edit round trip
- **WHEN** the GM saves library geometry containing UVTT portal metadata and copies it into a room
- **THEN** position, rotation, closed, freestanding and source retain their supplied values, and room IDs are assigned by the existing command pipeline

#### Scenario: Rejected metadata keeps the saved board
- **WHEN** the GM attempts to save invalid portal metadata
- **THEN** the request is rejected and the previous owned-library board remains unchanged
