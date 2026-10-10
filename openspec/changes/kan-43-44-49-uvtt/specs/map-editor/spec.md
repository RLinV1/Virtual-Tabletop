# Spec Delta

## Purpose

Provides a GM-only private map editor for UVTT preview, grid and geometry correction, deliberate application and applied-map download.

## ADDED Requirements

### Requirement: Private UVTT editing
The Map step SHALL offer UVTT import and applied-map export. A prepared import SHALL show its image, grid, walls, portal metadata and warnings privately. The Walls step SHALL allow draft drawing, erasing, picking and endpoint/metadata correction before Apply. Grid correction SHALL NOT move image-anchored geometry. Cancel SHALL discard the preparation; changed geometry or grid SHALL require discard confirmation. Failures SHALL retain the draft and errors. Closing SHALL return focus to Edit map; preview SHALL fit and work in narrow touch layouts.

#### Scenario: Draft geometry and cancellation
- **WHEN** the GM edits imported geometry while players move tokens and then discards
- **THEN** players never receive draft data, token activity continues and the applied scene remains unchanged
