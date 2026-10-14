# Spec Delta

## Purpose

Provides a GM-only private map editor for UVTT preview, grid and geometry correction, deliberate application and applied-map download.

## ADDED Requirements

### Requirement: Private UVTT editing
The Map step SHALL offer UVTT import and applied-map export. A prepared import SHALL show its image, grid, walls, portal metadata and warnings privately. The Walls step SHALL reuse the existing private draft adapter and wall editor to allow draft drawing, erasing, picking and endpoint/metadata correction before Apply. Switching between Map, Grid and Walls SHALL keep a UVTT preparation private; entering Fog SHALL require applying or discarding it first. Designation SHALL be explicit through existing door/window controls. Normal editor Save SHALL retain command map guards, metadata and atomic fog replacement. KAN-67 token choices and adjustment-count Undo SHALL be available for import. Grid correction SHALL NOT move image-anchored geometry. Cancel SHALL discard the preparation; changed geometry or grid SHALL require discard confirmation. Failures SHALL retain the draft and errors. Closing SHALL return focus to the editor opener or upload control; preview SHALL fit and work in narrow touch layouts.

#### Scenario: Draft geometry and cancellation
- **WHEN** the GM edits imported geometry while players move tokens and then discards
- **THEN** players never receive draft data, token activity continues and the applied scene remains unchanged

#### Scenario: Private step changes and rejected application
- **WHEN** the GM switches between Grid and Walls after editing imported geometry, then requests Fog and Apply is rejected
- **THEN** no step switch publishes draft data, the preparation and error remain available, and Fog opens only after a successful Apply or explicit discard
