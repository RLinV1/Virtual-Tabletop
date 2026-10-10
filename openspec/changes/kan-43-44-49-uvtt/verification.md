# Verification — KAN-43/44/49

Recorded 2026-10-10 on macOS 26.2 arm64. Implementation branch: `feat/kan-43-44-49-uvtt`. This is a local implementation, not a deployment or an approved architecture change.

## Prerequisites and review boundaries

The worktree starts at PR #94's `8c3c10af8d5e50d943a8607a30d38f683b39d28a`; its wall ADRs 0026/0027 are accepted. KAN-66 (`30ac348`) is reconciled in prerequisite commit `f0b3b29`, preserving its composite map/grid/token event and exact undo. Merge/rebase PR #94 before merging this feature. ADR 0028 remains Proposed and requires Raymond Lin's review.

The local commits separate these review areas:

1. OpenSpec proposal, design, scenarios and proposed ADR.
2. Pure UVTT parsing/conversion and shared portal, composite event, collision, filtering and undo contracts. These share the Wall schema; review the parser and event changes together.
3. Bounded server validation, private preparation/application, safe export, persistence and complete exporter fixtures. Import/export routes share authorization and asset resolution, while serializer and preparation modules remain separate.
4. Private editor, portal properties, retained errors, Apply/Undo and download UI.
5. Browser harness and this verification record.

## Automated results

| Check | Result |
|---|---|
| `openspec validate kan-43-44-49-uvtt --strict` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed, including browser TypeScript |
| `npm run build` | Passed; existing Vite large-chunk advisory remains |
| Shared tests | 36 files, 542 passed |
| Server tests, real Postgres/MinIO enabled | 47 files, 436 passed, 2 existing Redis-only tests skipped |
| Web tests | 54 files, 490 passed |
| Latency benchmark | 2 passed; GM 300/300 messages, p95 117.5 ms; player 300/300, p95 116.0 ms; limit 150 ms |
| Vision Python tests | 18 passed with Python 3.12.14, NumPy 2.5.4, OpenCV 4.14.0.94 and BullMQ 3.3.3 |
| Playwright | All six projects passed; portable upload-directory confirmation also passed in WebKit touch |
| Health smoke | Actual server `/health` and `/api/health` checks passed during browser startup/workflows |
| Final export coverage | All 8 export tests passed after adding the actual shipped `map-ice.webp` round trip |

Total TypeScript tests: **1470 passed**, including the benchmark. The two skipped tests require Redis and belong to pre-existing detection/deletion coverage; no UVTT service test was skipped in this run. The vision worker handler ran directly without Redis, as its existing test contract specifies. No vision source was changed. A temporary Python environment avoided this machine's broken Homebrew Python/Expat installation.

Reproduce the service coverage against a disposable migrated database and MinIO instance:

```sh
npm ci
npm run prisma:migrate --workspace=@vtt/server
# Set DATABASE_URL, UVTT_MINIO_ENDPOINT, UVTT_MINIO_ACCESS_KEY,
# and UVTT_MINIO_SECRET_KEY for isolated test services.
npm test
npm run lint
npm run typecheck
npm run build
openspec validate kan-43-44-49-uvtt --strict
npx playwright install chromium firefox webkit
npm run test:browser
# In services/vision, with requirements.txt installed in a virtual environment:
python -m unittest -v test_detector.py test_walls.py test_wall_worker.py
```

Postgres **17.11** used all twelve existing migrations. MinIO used the official source pinned to `RELEASE.2025-10-15T17-29-55Z`, compiled with Go 1.25.3; its local binary reports `DEVELOPMENT.GOGET`. The integration test uses a unique bucket, removes the local image copy to prove private S3 reads, restarts the app and database client, verifies event replay/checkpoint metadata/exact undo and player reconnect filtering, and deletes the room's log and objects. Memory/local-disk coverage runs alongside it.

The real Postgres run exposed Prisma JSON input rounding `15.000000000000002` to `15`. New appends now use parameterized JSON text cast to JSONB inside the existing transaction. Exact-double and simultaneous append-conflict tests pass. This extension is explicitly called out in ADR 0028; no old event or schema was rewritten.

## Privacy, failure and round-trip evidence

`uvttImport.test.ts` uses two GM connections and two players with different token ownership/fog views. It inspects raw traffic before Apply, after Apply/Undo, during resync/reconnect and after log reload. Draft IDs, geometry, previous values, nested token changes and undo history remain absent from player messages. Import commits one MapSet; sequences remain ordered. Token motion during preparation is adjusted from its current queued position.

Tests cover inactive/player/cross-room credentials before body parsing, expired sessions, private draft scope, stale baselines/revisions, bounded queues/timeouts, cancellation, expired/restarted preparations, failed append retention, repeated Apply receipts, 1 MiB draft edits and the unchanged 64 KiB global/socket limits. Malformed JSON/UTF-8/base64, corrupt/animated/disguised images, byte/pixel/edge limits, unsupported versions, zero segments and excessive geometry reject with bounded diagnostics.

Round trips compare decoded pixels and dimensions, grid spacing/phase and segment/portal coordinates within 1e-6 board pixels. Coverage includes negative/cropped origins, object LoS, open/closed/freestanding and edited portals, missing optional arrays, clipping, exact PNG/WebP bytes, JPEG conversion, owned upload/library records and actual shipped built-in images. Arbitrary external URLs and fractional cell sizes are refused with guidance.

Raw supported geometry has an additional 10000-point/item processing bound before normalization; excess data is rejected rather than truncated. The final wall count remains 1500. Moving a portal trims collinear solids at its new bounds but does not invent solid geometry at the former opening. Both decisions are documented for architecture review.

## Browser evidence

Playwright **1.64.0**, Chromium **156.0.8078.4**, Firefox **157.0**, WebKit **27.2**:

| Engine | Viewports / input | Result |
|---|---|---|
| Chromium | 1440×1000 desktop; 390×844 mobile/touch | Passed |
| Firefox | 1440×1000 desktop; 390×844 narrow | Passed |
| WebKit | 1440×1000 desktop; 390×844 mobile/touch | Passed |

Each workflow exercises private preview, independently checked grid/portal coordinates, fitting, portal editing and overlap normalization, dirty cancellation/Keep editing, opener focus return, retained validation errors, Apply, downloaded JSON/re-import and activity-log Undo back to no map. Touch projects use taps for opening, canvas selection and cancellation controls. No browser page errors occurred. Desktop and narrow/touch screenshots were inspected for clipping and overflow. Firefox's Playwright backend does not emulate touch; touch was checked in Chromium and WebKit. WebKit engine checks do not establish a run in a shipping Safari application or on a physical iOS device.

Screenshots/traces are generated under ignored `test-results/`; each browser test attaches its engine version. The bounded UI design check retained the existing map editor style. Its ten mechanical CSS warnings all point to incumbent CSS; new UI files had no findings. No unrelated visual redesign was made.

## External release gates

- Merge/rebase PR #94 and obtain Raymond Lin's ADR 0028 approval, including the composite contract, portal semantics and Postgres precision fix.
- Independently review fixture provenance/artwork redistribution, expected geometry and exporter application versions. Full originals and decompressed SHA-256 values are documented in `apps/server/test/fixtures/uvtt/README.md`.
- Acquire a clean complete Arkenforge export. The public author-linked tavern sample contains consecutive duplicate object-LoS points. Strict nonzero-segment validation correctly rejects it; it is a real rejection fixture, not evidence of successful Arkenforge interoperability. The original Dungeondraft test export passes. Synthetic PNG/WebP/crop/portal cases supplement these originals.
- Run representative exports in Foundry, Roll20 and Fantasy Grounds and record exact consumer versions. Their runtime compatibility has not been exercised here. Do not treat importer-source analysis as an application test.

Deploy web and server together after these gates. No additional migration is required. Once new events are persisted, rollback needs a reader that understands them; never rewrite history for an older reducer. Full doors/windows, locks, player portal controls, dynamic visibility and persistent multiple scenes remain separate tickets.
