# Verification — KAN-43/44/49 reconciliation

Recorded 2026-10-13 on macOS arm64. Local implementation branch: `feat/kan-43-44-49-uvtt`. This records implementation and automated evidence, not deployment or architecture approval.

## Baseline and review boundaries

Remote heads were refreshed before integration and confirmed unchanged after verification:

- Main `ec9aa663034e60e50bf824d11287a28b63b2ae24`: merged wall PR #94, typed portals (#95), private editor drafts, atomic fog replacement (#98), and editor/board changes (#99).
- KAN-66/KAN-67 `b7a8ba1314dd6b7fe8b5030e2acd835792e57834` (#86): atomic map/grid/token application, exact Undo, token-policy choices and adjustment confirmation. #97 merged into this prerequisite branch; #86 remains open against main.
- The previous UVTT implementation is preserved at `55c616c` on `backup/uvtt-before-main-20261013`. Its five feature milestones remain in history. Integration first reconciles the prerequisite onto current main (`f33198d`), then brings those milestones forward with the contract/editor adjustments below.

The initial integration renumbered the prerequisite's ADR 0031 to 0034 and UVTT's ADR 0028 to 0035. After reconciling main 37441e4, these are ADRs 0036/0037 because main now uses 0034/0035 for shared token attacks and chat mentions. Both remain Proposed. Preserve accepted ADRs 0028/0029/0030/0032 and coordinate the still-Proposed editor-context ADR 0031 with Raymond Lin.

## Reconciled behavior

`Wall.portal` retains native door/window kind and open/closed/locked state. `Wall.uvttPortal` holds optional imported position, rotation, closed and freestanding fields; `source` retains ordinary/object LoS. Generic imports stay GM-only and honor their supplied movement flag. Explicit designation uses existing portal tools/commands/player controls. Runtime state governs designated portal collision and exported closed; source metadata is not silently changed by PortalChanged.

Players see only designated portals outside midpoint fog, projected to id/endpoints/kind/state. UVTT metadata/source, generic portals, solid walls, drafts, replaced values and undo history remain absent. Visible endpoint/metadata edits use filtered snapshots; full WallUpdated never reaches players.

Different-image replacement clears walls/fog, and UVTT import replaces geometry and clears prior-image fog, inside the same MapSet as map/grid/current token adjustments. Preparations and undo guard full map/grid/walls/fog values. Token motion alone remains allowed. First-map Undo safely restores map=null. Historical events without replacement fields retain recorded behavior; group, portal, checkpoint and fog-swap undo remain supported.

Both applied-map editing and imported previews use WallSetup/WallCanvas and draftConnection. Normal Save retains expectedMapUrl guards, detection result identities and fog.replace; it preserves metadata/source and full endpoint edits. UVTT Apply uses the leased server preparation rather than sequential draft Save. KAN-67 policy choices and adjustment-count Undo are reused. Imports skip redundant grid detection. Main's Grid HUD, Show filter, fog rendering, pan gestures and More menu remain.

Export includes native and imported portals with current open/closed state, warning in the UI and bounded response headers that UVTT omits kind and locking (locked exports as closed). Geometry, phase, image content and position/rotation/freestanding remain in the supported round trip; closed uses current runtime state for designated portals.

## Automated results

| Check | Result |
|---|---|
| Strict OpenSpec validation | UVTT and KAN-66 changes passed |
| Lint / typecheck | Passed, including browser TypeScript |
| Build | Passed; incumbent Vite large-chunk advisory remains |
| Shared tests | 40 files, 621 passed |
| Server tests, real Postgres/S3 enabled | 52 files, 463 passed, 2 existing Redis-only tests skipped |
| Web tests | 59 files, 538 passed |
| Latency benchmark | 2 passed; GM 300/300, p95 116.5 ms; player 300/300, p95 117.2 ms; limit 150 ms |
| Vision Python tests | 28 passed; Python 3.12, NumPy 2.5.4, OpenCV 4.14.0.94, BullMQ 3.3.3 |
| Playwright | Six Chromium/Firefox/WebKit desktop/narrow/touch projects passed |
| Health | Actual API/server health checks passed during browser workflows |

Total: **1624 TypeScript tests passed**, including the benchmark; two incumbent Redis-only tests were skipped. No UVTT/Postgres/S3 test was skipped. Python worker handlers ran directly, including BullMQ's callback signature; this does not claim a live Redis worker run. After the full suite, targeted UI/undo checks, typecheck, lint and build also passed for the final small control/line-ending adjustments.

### Persistence and raw-message evidence

The Postgres test instance uses all twelve existing migrations. The real S3 service is [SeaweedFS 4.48](https://github.com/seaweedfs/seaweedfs/releases/tag/4.48), official darwin-arm64 binary, commit `530be3e37337488ecc34d58441e0bc476e121c93`; archive SHA-256 `faa194e72a346755dc4404288b0561eb3c260351702901d8363024d5099bdd7d` was verified before execution. Services use isolated loopback ports and disposable data. Temporary S3 volume capacity was increased for repeated unique test buckets, and readiness was checked before the final suite.

`uvttPersistence.test.ts` verifies generic portal editing/exact first-map Undo, explicit native window designation, checkpoint restoration, log replay, database/client/server restart, filtered player reconnects, private S3 reads after removing the local image copy, current-state export and room/object deletion. Native state and imported metadata survive together. Memory/local-disk tests run alongside it. New appends preserve exact JS doubles through parameterized JSON text cast to JSONB; exact-double and concurrent conflict tests pass without rewriting history.

`uvttImport.test.ts` uses two GM connections and two players with different ownership/fog views. Raw traffic is checked before Apply, after composite Apply/Undo, visible portal changes, fog concealment, resync/reconnect and reload. Player portal toggles use the existing commands; geometry updates resync safely. A later portal/fog edit blocks stale Apply or guarded import Undo. One import appends one MapSet, failed append retains the draft, repeat Apply is idempotent, and token adjustment uses current queued positions.

Parser/image/export tests retain complete originals and synthetic PNG/WebP, crop/origin, object LoS, optional/malformed/oversized/animated/corrupt data, queues/timeouts, clipping, JPEG conversion, owned uploads/library/built-ins, arbitrary-URL refusal and fractional-grid rejection. Round trips compare decoded pixels/dimensions, spacing/phase and segment coordinates within 1e-6 pixels. Endpoint overlap normalization and exact compensation remain covered.

### Browser evidence

Playwright 1.64.0; Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2:

| Engine | Viewport / input |
|---|---|
| Chromium | 1440×1000 desktop; 390×844 mobile/touch |
| Firefox | 1440×1000 desktop; 390×844 narrow |
| WebKit | 1440×1000 desktop; 390×844 mobile/touch |

Workflows exercise the current empty-map upload path, private preview, independently checked grid/portal coordinates, fitting, generic portal edits and overlap normalization, dirty cancellation/Keep editing, focus return, retained errors, Apply, applied-map download/re-import and activity-log Undo through main's More menu. The final workflow also designates a locked window through the normal private editor Save, checks retained metadata, exports its current closed state, and undoes designation before the guarded map Undo. No browser page errors occurred. Desktop and WebKit-touch screenshots were inspected for clipping/overflow. Firefox does not emulate touch; touch runs use Chromium and WebKit. WebKit checks are not a shipping Safari/physical iOS run.

Screenshots/traces are generated under ignored `test-results/`; tests attach engine versions. Native metadata stripping and player control/fog behavior are additionally verified by multi-client raw-message tests.

## Reproduction

```sh
npm ci
# Use disposable migrated Postgres and ready S3-compatible services.
DATABASE_URL=postgresql://uvtt@127.0.0.1:54329/uvtt \
  npm run prisma:migrate --workspace=@vtt/server
DATABASE_URL=postgresql://uvtt@127.0.0.1:54329/uvtt \
  UVTT_S3_ENDPOINT=http://127.0.0.1:18333 \
  UVTT_S3_ACCESS_KEY=uvtt-test UVTT_S3_SECRET_KEY=uvtt-test-password npm test
npm run lint
npm run typecheck
npm run build
openspec validate kan-43-44-49-uvtt --strict
openspec validate kan-66-map-token-adjustment --strict
npx playwright install chromium firefox webkit
npm run test:browser
# In services/vision, with requirements.txt installed in a virtual environment:
python -m unittest -v test_detector.py test_walls.py test_wall_worker.py
```

Application storage now uses S3AssetStore/S3_* and SeaweedFS in compose. UVTT_S3_* above configures the isolated opt-in integration test. Previous MinIO evidence belongs to the pre-reconciliation implementation, not the current compose backend.

## External gates

- Merge the reconciled KAN-66/KAN-67 prerequisite (#86) and obtain Raymond Lin's review of ADRs 0036/0037, including composite fog/geometry, portal projections and Postgres precision. Coordinate ADR 0031's outstanding review. No approval is asserted here.
- Independently qualify fixture provenance/artwork redistribution, expected geometry and exporter application versions; see `apps/server/test/fixtures/uvtt/README.md`. Acquire a clean complete Arkenforge export: the original author-linked tavern has consecutive duplicate object-LoS points and correctly remains a rejection fixture. Dungeondraft passes; synthetic files supplement it.
- Run representative exports in Foundry, Roll20 and Fantasy Grounds and record versions. Source inspection does not establish application compatibility; UVTT closed semantics vary across consumers.

Deploy web/server together after review and qualification. No new database migration or event-history rewrite is introduced. Rollback needs a reader for the persisted contract. Dynamic LoS and persistent scenes remain separate work.

The preserved 2026-10-10 baseline at 55c616c passed 1470 TypeScript tests, 18 Python tests and six browser workflows, including Postgres/MinIO; those earlier totals are not substituted for the fresh results above.

## Main merge verification (2026-10-14)

Merged main `37441e4b42c1885a4ed93d4a35771e0ffcf7f3df` into the feature branch from `9e0c6fb`; the original head is preserved at `backup/uvtt-before-main-20261014`. The untracked user Dungeondraft export is unchanged (SHA-256 `31f1dbff6106c990891fca2f7d64d20fac813a66299a3870b9e6782115f59afe`).

Resolved the GM panel, styles, shared exports/imports, and undo conflicts. Shared attacks and chat mentions retain main's behavior. UVTT preparations stay private across Map/Grid/Walls; Fog uses the new Apply/Discard prompt. Failed Apply retains the prompt and draft; successful Apply finishes the requested step. Editor closing returns focus to its opener. Main's keyed live wall/fog editors and fixed-map encounter features remain. Regression coverage includes private geometry step changes, rejected/retried Apply through the prompt, focus return, and map undo preserving later shared attack edits.

Renumbered our ADRs to 0036 (map-token adjustment) and 0037 (UVTT); main owns 0034/0035 for shared token attacks/chat mentions. References and the design index are updated. Architecture approvals and the external gates above remain outstanding; #86 is still open.

Fresh checks on Node **22.23.2**, matching CI's Node 22 major:

- Prisma client regenerated for main's existing `0013_temporary_rooms` migration; UVTT introduces no additional migration.
- Lint, typecheck, build and strict OpenSpec validation for KAN-43/44/49, KAN-66 and KAN-67 passed.
- Full `npm test`: **1,772 passed** (675 shared, 442 server, 653 web, 2 latency tests); **38 service-dependent tests skipped**. Postgres/S3/Redis persistence and browser/consumer checks were not rerun for this merge; their earlier evidence remains separately recorded above.
- Latency: 300/300 messages for both clients, p95 117.4 ms (GM) and 118.1 ms (player), below 150 ms.
- Isolated in-memory/local-disk server on a temporary loopback port returned HTTP 200 and `{ "ok": true }`; server and temporary directory were cleaned up.
- No unresolved index entries or conflict markers; the resolution diff against main passes `git diff --check`.

The host default Node 26.9.0 initially failed four unchanged main tests because its experimental global `localStorage` interferes with jsdom. All pass with Node 22; no test or application workaround was added. To reproduce using the installed runtime without changing the user's default:

```bash
fnm exec --using 22.23.2 -- npm run lint
fnm exec --using 22.23.2 -- npm run typecheck
fnm exec --using 22.23.2 -- npm test
fnm exec --using 22.23.2 -- npm run build
```
