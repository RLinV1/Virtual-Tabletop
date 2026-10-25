# Grid detection

## Purpose

Provide private, editable grid estimates for newly uploaded raster maps while keeping saved grids authoritative and analysis resource use bounded.

## ADDED Requirements

### Requirement: Reviewed native-resolution estimate
The system SHALL analyze PNG, JPEG and WebP map uploads using full-resolution EXIF-oriented 8-bit grayscale and the reviewed classical LSD/fitter behavior. It SHALL preserve fractional cell size and canonical offsets. The highest-ranked usable best candidate SHALL be returned regardless of diagnostic acceptance gates. With no usable best candidate it SHALL return no_grid. Candidates SHALL contain no confidence probability. The original artwork SHALL be preserved.

#### Scenario: Borderline best candidate
- **WHEN** the reviewed fitter has a usable best candidate whose diagnostic gates fail
- **THEN** that candidate is available as an editable estimate with neutral check-before-saving wording

### Requirement: Per-upload versioned private cache
Candidates and completed no_grid outcomes SHALL persist separately from saved grids and SHALL be reused for polling, reopening, selection and placement of that upload. Jobs, claims, completions and reads SHALL validate source identity, configuration fingerprint and attempt. Equal bytes in separate uploads SHALL start separate analyses. Legacy or obsolete results SHALL be unavailable and SHALL NOT be backfilled or recovered. Only authorized owners/GMs SHALL read results; players SHALL receive no analysis metadata.

#### Scenario: Reopen after restart
- **WHEN** an owner reopens a map with a valid persisted candidate or no_grid result after restart
- **THEN** the same outcome is returned with no detector invocation

#### Scenario: Obsolete or stale work
- **WHEN** a result has an old fingerprint, mismatched source, deleted upload or superseded attempt
- **THEN** it cannot be read or complete current analysis and does not trigger editor-open analysis

### Requirement: Bounded asynchronous analysis
Both raster map upload paths SHALL return while analysis runs asynchronously and SHALL exclude tokens. The default analysis ceiling SHALL be 16 MP, independent of existing upload limits. Oversized and invalid images SHALL produce terminal errors, never no_grid. Excess admitted work SHALL be deferred; only transient failures SHALL consume up to three attempts. One fresh process SHALL perform each map analysis and SHALL be terminated and reaped after its default 30-second deadline. HTTP timeout SHALL default to 40 seconds and stale claims to 90 seconds. The grid container SHALL default to a configurable 2 GiB ceiling.

#### Scenario: Busy or oversized input
- **WHEN** the supervisor is busy or a map exceeds the analysis ceiling
- **THEN** busy work waits without consuming a failure attempt, and oversized work ends in error while manual setup remains available

### Requirement: Guarded automatic draft prefilling
An unconfigured map's untouched draft SHALL automatically adopt a valid cached estimate at most once per editor session. Manual interaction SHALL be tracked separately from equality, including the first anchor, keyboard alignment, field edits and discard. Automatic adoption SHALL preserve units and style. Saved grids, save attempts, dismissal, map replacement and access loss SHALL prevent automatic replacement. Use suggestion SHALL remain available for explicit adoption after interaction. Saving SHALL remain explicit. Polling SHALL stop when analysis is absent or access is denied.

#### Scenario: Delayed result after manual alignment
- **WHEN** a candidate arrives after the first anchor or typing begins
- **THEN** the draft stays unchanged and Use suggestion permits explicit adoption

#### Scenario: Untouched unconfigured map
- **WHEN** a valid estimate arrives before manual interaction in an unconfigured editor
- **THEN** geometry is prefilled once without saving or changing units and style
