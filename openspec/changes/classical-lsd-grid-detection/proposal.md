# Classical LSD grid detection

## Why

The reviewed native-resolution classical LSD detector produces editable grid estimates, but the application still uses a different detector and advertises uncalibrated confidence percentages. Integrating the reviewed behavior with bounded execution and per-upload persistence makes those estimates available during private map setup.

## What Changes

- Port the reviewed preprocessing, LSD settings, filtering and fractional fitter without experiment imports; keep best-candidate behavior even when diagnostic gates fail.
- Analyze new raster map uploads asynchronously up to a separate default 16 MP analysis ceiling. Tokens, UVTT grids and shipped calibrations stay authoritative.
- Persist source identity, configuration fingerprint, attempts, candidates and completed no-grid outcomes per upload; hide obsolete metadata without backfilling maps.
- Limit grid execution to one analysis, with disposable processes, deadlines, bounded retries and a bounded local pending buffer.
- Prefill untouched unconfigured editor drafts once; retain explicit Use suggestion and explicit saves. Open private setup before placing unconfigured library maps.
- **BREAKING**: Remove candidate confidence from the private shared HTTP contract and UI.

## Capabilities

### New Capabilities

- `grid-detection`: Private upload analysis, durable cache validity, bounded execution and guarded draft adoption. This capability exists in a prior unarchived change but has no main spec yet; this change records the agreed replacement behavior.

### Modified Capabilities

- `asset-library`: Unconfigured library selections require private setup before placement.

## Impact

Python vision service and shared wall dependencies; Node upload routes, memory/Postgres stores, Prisma migration and dispatchers; shared private schemas; React grid editors and library selection; Compose resource settings and local verification tooling. ADR 0044 requires architecture-owner review before merge. Local implementation only: no merge, deployment or committed supplied maps.
