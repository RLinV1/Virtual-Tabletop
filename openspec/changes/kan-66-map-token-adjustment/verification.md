# KAN-66 verification

Implementation branch: `feat/kan-66-map-token-adjustment`. Verified on 2026-10-05.

## Automated checks

| Check | Result |
| --- | --- |
| `npm ci --cache /private/tmp/vtt-kan66-npm-cache` | Passed; restored the declared `image-size` dependency. Committed lockfile unchanged. |
| `npm run prisma:generate --workspace=@vtt/server` | Passed. |
| `npm run lint` | Passed. |
| `npm run typecheck` | Passed. |
| `npm test` | Passed: shared 451, server 285, web 437, latency benchmark 2; 1,175 passed total. The existing database-backed suites skipped 22 tests because their database environment was not configured. |
| Latency benchmark | 300/300 samples per client; GM p95 117.1 ms, Bob p95 117.8 ms, both below the 150 ms target. |
| `npm run build` | Passed. Existing Zod annotation and web chunk-size warnings remain. |
| CI server health smoke | `npm start` booted with memory storage/local assets and `/health` returned `{"ok":true}`. Used `PORT=3102` because another process occupied CI's default port 3001. Stopped only the smoke process afterward. |
| `openspec validate kan-66-map-token-adjustment --strict --json` | Passed. |
| `git diff --check` and lockfile comparison | Passed; no lockfile or unrelated tracked-file changes. Existing untracked skill files preserved. |

The health smoke cleared database, Redis, and MinIO configuration, disabled MinIO autodetection, and used `/private/tmp/vtt-kan66-smoke` for uploads, matching CI's standalone server path without using external infrastructure. Integration tests required local socket access outside the shell sandbox.

## Behavior covered

- Pure geometry: independent axis scaling, keep, first-map preservation for every policy, footprint bounds, negative/outside and extreme coordinates, fractional/multi-cell sizes, grid offsets, aligned/free intent, no fitting lattice position, deterministic recentering, crowding/search exhaustion, and whole-command oversize rejection.
- Contract and reduction: default/invalid policies, exactly one complete map event, explicit replaced values and empty changes, recorded-value atomic reduction, legacy event parsing/replay/non-undoability, unchanged fog/templates, and permanent attack-side concealment.
- Undo: exact map/grid/coordinate restoration, null first-map restoration, full grid/map/position/deletion guards, unrelated edits and unadjusted tokens, bounded history, append-only compensation, and replay-derived history.
- Socket integration: a GM and two players converge with viewer-specific filtered snapshots; hidden/fog token data, prior coordinates, nested changes, history, and command IDs stay protected in raw application/undo/resync/reconnect/reload messages. Forged player commands and rejected maps append nothing. Apply uses moves committed during preparation.
- Preparation: uploads remain private before Apply; Apply emits one GM event and one filtered player snapshot. Existing web preparation tests cover upload/library starting grids and the combined command. Code inspection confirms preparation stays local and only successful `onSetMap` discards the draft; rejected commands report into the open grid form and clear the busy state for correction/retry. Visual error retention remains on the manual checklist.

## Manual web checks: user-owned, pending

The user requested that the agent stop browser testing and let them perform these checks. The agent reached the synthetic room and Manage controls, but did not complete upload or library Apply, visible adjustment, automatic fitting, rejection/draft retention, or Activity log Undo. The initial Safari canvas appeared blank in the automation view; rendering was not investigated further before the handoff. Task 3.3 remains unchecked.

Prepared disposable local QA environment: web `http://localhost:5174`, server `http://127.0.0.1:3101`, room `4fd80200-5f03-4217-9bc4-4b6a6b4afc0a` named **KAN-66 map QA**. The browser is signed into the synthetic QA account. Fixture images are in `/private/tmp/vtt-kan66-qa`; temporary credentials remain only in its local seed file. This environment is separate from any existing server on port 3001 and uses memory storage, so it is lost when restarted.

Manual checklist:

1. Upload `Upload-replacement.png` (500 × 400), keep the 50 px grid, and Apply. Confirm the view fits, all footprints fit, and the Activity log shows one complete map action with three adjusted tokens. Hero should move from (701, 601) to (350.5, 300.5), Ogre from (850, 650) to (450, 350), and the hidden giant from (425, 425) to (225, 225).
2. Undo that action in the Activity log. Confirm the original 1000 × 800 map, grid, and exact coordinates return together.
3. Choose **Library replacement** from the library, Apply, inspect visible adjustment and fitting, then Undo.
4. Choose **Too small** (100 × 100) with its saved 50 px grid. Apply should name the hidden giant's 150 px footprint, leave the room unchanged, and keep the preparation draft open. Reduce the draft cell size to 25 px and retry, then Undo the successful action.

## Review and specification dependency

Raymond Lin's Real-Time Architecture review has **not been requested or received**. Task 4.3 remains unchecked. [ADR 0023](../../../docs/adr/0023-map-token-adjustment.md) records the contract change and requires web/server deployment together after review. No production deployment, specification sync, or archival was performed.

Separately, `openspec validate undo-reversible-actions --strict --json` still fails because `room-activity-log/spec.md` modifies **Readable attributed actions** while omitting the existing **Attack roll** scenario. That completed, unrelated change was preserved. Reconcile its missing scenario before later specification consolidation or archival; this KAN-66 change passes its own strict validation.
