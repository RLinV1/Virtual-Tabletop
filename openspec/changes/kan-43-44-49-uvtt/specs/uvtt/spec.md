# Spec Delta

## Purpose

Allows GMs to bring portable UVTT maps into a private editor and download the applied scene with validated image, grid and supported geometry.

## ADDED Requirements

### Requirement: Validate portable maps before preparation
The server SHALL accept uvtt, dd2vtt and df2vtt flat formats 0.2, 0.3 and 1.0 with valid UTF-8 JSON, resolution and strictly decoded single-frame PNG/WebP image. It SHALL reject malformed supported fields, nonfinite/zero geometry, image mismatches over one pixel, excess geometry and resource limits atomically. Limits SHALL be 40 MiB container, 25 MiB decoded image, 32 megapixels and 16384 pixels per edge. Missing optional arrays SHALL be empty. Errors and warnings SHALL contain at most twenty bounded paths/codes without input contents. Unsupported lighting/environment/extensions SHALL warn.

#### Scenario: Malformed image
- **WHEN** an uploaded file contains corrupt image bytes or invalid portal bounds
- **THEN** preparation fails with a bounded field diagnostic and the room is unchanged

#### Scenario: Complete exporter file
- **WHEN** a supported real exporter file has valid image and geometry
- **THEN** its image, grid phase, segments and portal metadata are available in private preparation

### Requirement: Convert geometry without losing grid phase
Import SHALL subtract map origin before scaling squares into pixels, preserving precision and portal rotation. Export SHALL invert this conversion using grid phase. Geometry crossing the crop SHALL be clipped with warnings. Solid collinear overlap across portals SHALL be removed. Polylines SHALL NOT close implicitly. The normalized wall count SHALL NOT exceed 1500 and SHALL NOT be truncated.

#### Scenario: Negative cropped origin and open portal
- **WHEN** a file has a negative nonzero origin and a portal overlapping solid LoS
- **THEN** grid phase is positive modulo, geometry aligns with the image, and the open portal gap is unobstructed

### Requirement: Authorized bounded preparations
POST /api/rooms/:roomId/uvtt/imports, PUT and DELETE /api/rooms/:roomId/uvtt/imports/:id SHALL require matching room credentials, an active GM and a live bound session before reading uploads. Preparations SHALL expire after thirty minutes and unapplied drafts SHALL be limited to two per GM/room, twenty per room owner and one hundred per process. Owners SHALL be resolved from stored room ownership, with a GM-participant fallback for legacy unowned rooms. Applied receipts SHALL retain expiry and retry behavior without consuming draft capacity. Capacity SHALL be checked before reading uploads and rechecked at creation. Edits SHALL validate grid and geometry and require the current revision. Rejected Apply SHALL retain the draft; duplicate successful Apply SHALL NOT append another import. Cross-room access SHALL be refused. Original JSON and embedded images SHALL NOT enter realtime messages.

#### Scenario: Player or expired session uploads
- **WHEN** a player or a GM with an expired bound session posts a preparation
- **THEN** the server refuses before reading the body and the room is unchanged

#### Scenario: Stale revision or restart
- **WHEN** Apply names an old revision or a preparation lost on restart
- **THEN** Apply is refused with guidance to refresh the revision or re-import

#### Scenario: Applied receipts and another owner's draft quota
- **WHEN** completed imports have retained receipts or another owner has reached its draft quota while process capacity remains
- **THEN** those entries do not prevent an eligible owner from preparing a draft, and duplicate successful Apply still returns its receipt

### Requirement: Export only the applied scene
GET /api/rooms/:roomId/uvtt/export SHALL require active GM authorization and download format 0.3 image, grid and supported geometry from one consistent applied snapshot. It SHALL resolve only owned room/library images and allowlisted built-ins. Arbitrary external URLs and fractional grid spacing SHALL fail with actionable guidance. PNG/WebP bytes SHALL be preserved; JPEG conversion SHALL preserve image dimensions. Export SHALL include native and imported portals, using current runtime open/closed state for designated portals. It SHALL warn that portal kind and locks are omitted; locked SHALL export as closed. Tokens, fog, credentials, filenames, room identifiers and history SHALL NOT be exported.

#### Scenario: Round trip
- **WHEN** the GM downloads and re-imports an applied scene with an integer grid and edited portals
- **THEN** decoded image content, dimensions, grid spacing/phase, segment geometry within 1e-6 pixels and position/rotation/freestanding metadata and open/closed movement are equivalent, using runtime state for a designated portal’s closed flag and ignoring generated IDs, grouping, kind and locks

#### Scenario: Fractional spacing
- **WHEN** a GM exports a scene with fractional grid cell size
- **THEN** export is refused with guidance to choose an integer size without silent rounding or resampling
