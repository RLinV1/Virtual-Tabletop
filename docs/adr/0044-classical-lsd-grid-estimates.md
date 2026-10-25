# ADR 0044: Versioned private classical LSD grid estimates

## Status

Proposed — Real-Time Architecture owner review is required before merge.

## Context

ADR 0028 introduced private upload analysis with a confidence number. The reviewed native classical LSD experiment supplies a ranked geometry estimate, including possible suggestions on gridless artwork; it supplies no calibrated confidence. Results must survive restart and must not overwrite manual alignment or saved grids.

## Decision

Remove confidence from `GridDetectionCandidate`; retain fractional positive cell size (at most 2000 pixels) and canonical offsets. Keep all analysis behind existing authorized REST endpoints, outside RoomState/events/player payloads. Label it as an estimate to check. Untouched unconfigured editor sessions may prefill once; explicit saves remain the only persistence/room commit path.

Version analysis by source SHA-256 plus a detector/preprocessing/fitter fingerprint. Store it on each upload, separately from the saved grid. Queue payloads and atomic claims/completions include source, version and attempt; legacy or obsolete metadata is invisible and never backfilled. Separate uploads of identical bytes analyze independently. The original library asset is the cache authority when selected in a room.

Bound analysis to one globally active BullMQ job, or one local active job with bounded pending work. A lightweight HTTP supervisor admits one analysis, invokes a fresh child, and terminates/reaps it at the deadline. Busy work defers without spending an execution attempt. Only transient errors retry, up to three executions. Oversized images are terminal errors with manual fallback. Default analysis/processing/HTTP/stale/memory limits are 16 MP / 30 s / 40 s / 90 s / 2 GiB, separately from upload limits.

## Consequences

No existing room event schema or saved grid changes. Nullable additive migration leaves historical uploads alone. Python grid/wall dependencies are pinned together and require wall regressions. Local detector parity and resource measurements do not establish calibrated accuracy or hosted performance. Merge requires architecture-owner review and local Compose acceptance; no deployment is authorized by this ADR.
