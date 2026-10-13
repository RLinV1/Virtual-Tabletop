# Tasks

## 1. KAN-44 parser foundation

- [x] 1.1 Deliver proposal/design/specs/ADR 0035 and pass strict OpenSpec validation.
- [ ] 1.2 Qualify complete Dungeondraft/Arkenforge files with provenance, checksum and independent expected geometry; verify real-file tests.
- [x] 1.3 Implement pure schemas/conversion/clipping/portal overlap and verify malformed, phase and geometry tests.
- [x] 1.4 Add bounded worker/full image validation and verify resource, corrupt image and queue tests.

## 2. Shared geometry contract

- [x] 2.1 Add portal/source, GM wall update and open/closed collision; verify authorization and full-value undo tests.
- [x] 2.2 Reconcile composite MapSet with KAN-66 and add geometry guards/filtering; verify atomic scene, legacy replay, checkpoint and inverse tests.
- [ ] 2.3 Obtain Raymond Lin's ADR 0035 review and integrate prerequisite #86; merged PR #94 is recorded; record approval evidence.

## 3. KAN-43 room import

- [x] 3.1 Add authorized bounded preparation/revision/discard APIs and queue lease/receipt application; verify session/cross-room/expiry/stale/retry/append failure tests.
- [x] 3.2 Add private editor import, draft walls/portal editing and retained errors; verify UI tests.
- [x] 3.3 Verify two GM/two player raw messages, token adjustment, undo, resync/reconnect and persisted-log recovery.

## 4. KAN-49 export

- [x] 4.1 Add filtered queue snapshot export and safe room/library/built-in resolution; verify JPEG, external URL and fractional-grid rejection.
- [x] 4.2 Add download UI and import/export/import tests including edited portals, grid offsets and decoded pixels.

## 5. Release verification

- [x] 5.1 Run strict validation, lint, typecheck, complete tests including latency benchmark, build and health smoke; record results.
- [x] 5.2 Exercise Postgres and S3 integration and record persistence/asset evidence.
- [x] 5.3 Record Chromium, Firefox and WebKit desktop/narrow/touch browser checks for preview, alignment, editing, cancel/errors/focus/fitting/Undo/download.
- [ ] 5.4 Record Foundry, Roll20 and Fantasy Grounds consumer versions and representative export compatibility.

See [verification.md](verification.md) for results, commands and the remaining release gates.

## 6. Reconcile merged walls, portals and editor (2026-10-13)

- [x] 6.1 Preserve pre-integration branch; reconcile main ec9aa66 with latest KAN-66/KAN-67 b7a8ba1; renumber prerequisite ADR to 0034 and UVTT ADR to 0035.
- [x] 6.2 Preserve typed portals with separate GM-only UVTT metadata, shared blocking and player projections; verify native/generic import/export, portal toggles and exact undo.
- [x] 6.3 Record walls/fog replacement in one MapSet with full conflict guards and null-map inverse; verify legacy replay, concurrent fog/portal changes, groups and checkpoints.
- [x] 6.4 Reuse current private editor adapter, detection identities and context guards; preserve metadata through normal Save and KAN-67 choices through import; verify UI and browser workflows.
- [x] 6.5 Verify Postgres/current S3 backend, lint/typecheck/full tests/latency/build/OpenSpec/health; record fresh evidence and remaining external gates.
