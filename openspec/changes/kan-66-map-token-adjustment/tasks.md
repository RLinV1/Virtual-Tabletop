# Tasks

## 1. Planning and setup

- [x] 1.1 Create the requested branch and CLI-scaffolded proposal/design/specs/tasks; verify strict validation for this change and preserve untracked skills.
- [x] 1.2 Restore dependencies using the committed lockfile and generate Prisma; verify server tests can collect without the missing image-size dependency.
- [x] 1.3 Add ADR 0023 covering contract, geometry, atomicity, undo guards, filtering, compatibility, KAN-67, and joint deployment; verify the artifact records Raymond Lin review as not requested/received and the unrelated undo-spec dependency.

## 2. Shared behavior

- [x] 2.1 Extend map command/event schemas and implement pure bounded adjustment for scale/keep/recenter with shared bounded placement candidates; verify geometry tests cover map ratios, first maps, offsets, free/aligned and fractional/multi-cell footprints, crowding, exhaustion, and oversize.
- [x] 2.2 Emit one complete MapSet from authoritative state and reduce recorded map/grid/positions with permanent fog attack-side concealment; verify contract/decision/reducer and legacy replay tests.
- [x] 2.3 Make complete new map actions reversible with full map/grid/changed-position guards and exact inverse values; verify conflicts, null restoration, unrelated edits, bounded history, append-only behavior, and reload survival.
- [x] 2.4 Filter composite map events/inverses through player snapshots and update activity/Undo descriptions; verify privacy/filter and description tests while retaining standalone grid behavior.

## 3. Integration and client verification

- [x] 3.1 Add GM/multiple-player integration coverage for Apply/undo, current positions, rejection without append, forged commands, hidden/fog data, resync/reconnect, and persisted-log reload; verify suites pass and raw messages contain no nested/prior positions or command IDs.
- [x] 3.2 Update preparation acceptance tests for one GM event and filtered player snapshots; verify uploads/library drafts remain private and rejected drafts remain usable through the existing error path.
- [ ] 3.3 Browser-check upload and library Apply, visible adjustment, automatic fitting, oversize rejection/draft retention, and activity-log Undo; record observable results.

Manual browser verification is assigned to the user at their request (2026-10-05). It has not been completed by the agent; see verification.md for the checklist and prepared local fixtures.

## 4. Delivery verification and review

- [x] 4.1 Run npm run lint, npm run typecheck, npm test including latency benchmark, npm run build, and CI /health smoke; record results and verify the lockfile and unrelated files remain unchanged.
- [x] 4.2 Record verification evidence and the separate existing undo-spec validation failure; verify this OpenSpec change still passes strict validation.
- [ ] 4.3 Obtain Raymond Lin's Real-Time Architecture review before release; verify actual approval is received. External review is currently not requested or received.

Web and server must be deployed together after review. This implementation task prepares the change for review; production deployment and specification archival are later steps.
