# Library UVTT import verification — 2026-10-18

Checkout: `uvtt-import-export`, branch `feat/kan-43-44-49-uvtt`. Reconciled main `cc9b15b` first, retaining wall-confidence review, area tools, grid fallback and token management. Main's new ADR 0040 occupies the previous map-token number; that proposed ADR is now 0042. UVTT remains ADR 0041; this extension is ADR 0043. Architecture approvals remain external gates.

## Automated evidence

Node 22.23.2:

- Lint, typecheck and build pass. The existing large-chunk build warning remains.
- Strict OpenSpec validation passes for `library-uvtt-import`, `kan-43-44-49-uvtt`, `kan-66-map-token-adjustment` and `kan-67-token-policy-ui`.
- Full `npm test` with disposable Postgres: **2,094 passed** (718 shared, 536 server, 838 web, 2 latency). **3 skipped**: two Redis-only checks and the existing combined Postgres/S3 test, since S3 was unavailable. No Python source changed or Python suite rerun.
- Latency: both benchmark clients received 300/300 messages; p95 GM 116.7 ms, player 116.5 ms (150 ms ceiling).
- Postgres/storage contracts: 49 passed, including memory/Postgres variants and exact UVTT precision. These are included in the full-suite count. The precision regression first reproduced rounding of portal rotation `1.2000000000000002` to `1.2`, then passed after parameterized JSON text writes.
- Postgres/local-disk HTTP smoke: `/health` 200, complete Dungeondraft import, fresh app/store reconnect, exact portal precision, one-event library placement, byte-preserving export and exact first-map undo all pass. Existing migrations were applied to a disposable database; its cluster was stopped afterward. The user's development server/database were not restarted or modified.

Coverage includes PNG/WebP, all three extensions, fractional origin/phase, portal edits, object LoS, real Dungeondraft geometry, bounded warnings, authorization/session/origin rejection, rate limits, failed asset insertion and raw/image cleanup, room library opt-in/opt-out, cancel/room-deletion retention, two GMs/two players, raw-message filtering, one scene sequence, current token adjustment, failed append/retry, complete undo, template edit independence, log reload, and export/library re-import at 1e-6 board-pixel tolerance. Component tests cover picker acceptance, editor opening, metadata edit/save, error/retry, image-only token art, the room checkbox and single-reference placement.

The user-owned `assets/dungeondraft.dd2vtt` remains unmodified and untracked; SHA-256 `31f1dbff6106c990891fca2f7d64d20fac813a66299a3870b9e6782115f59afe` is unchanged. Tests use the existing checked-in compressed fixture.

## Manual browser checklist

Keep using this checkout's `npm run dev`, then refresh the site. This follow-up adds no dependency or database migration.

1. **Library upload:** Asset Library → Maps → Upload map. Select `dungeondraft.dd2vtt`. Expect the editor to open with an imported/saved message and any warnings. This fixture is 1280 × 1280 pixels with 64-pixel cells (20 × 20 cells).
2. **Review/edit:** Open Walls, check alignment and the three generic portals. Use Select on a purple portal, change its closed flag or rotation, then Save geometry → Save changes. Close/reopen and verify persistence. Optionally save a fractional grid offset and reopen to check it. Closing the editor keeps a successfully imported map.
3. **Reuse/undo:** In a GM room, Change Map → From library → select the map → Apply map. Verify image/grid/walls together and one activity-log Undo restoring the previous map/grid/walls/fog/token positions. Try with existing tokens. A second player window should see publication only after Apply, without GM-only wall overlays.
4. **Independent copies:** Place into two rooms, then edit the library template. Applied rooms must keep their copies. Reapply the template and verify the new geometry without duplicate walls.
5. **Room checkbox:** Import directly in a room with Also save uploads to my library selected. The complete initial map must remain in the library even after canceling the room preview. Repeat with it cleared: no new library map. Later room draft edits do not silently update the library.
6. **Export/re-import:** Apply a map, Export applied map (UVTT), then upload that download through the library. Compare image, spacing/phase and portal metadata. Fractional cell sizes should still produce export guidance.
7. **Failure/regression:** Upload a deliberately malformed copy; expect a clear error, no new card and successful retry with the original. Check ordinary image map uploads and image-only token-art uploads.
8. **Interaction:** Check keyboard navigation, focus after closing the editor, warnings, narrow layout and touch controls in the browsers/devices you use.

These are handoff checks, not fresh live-browser evidence. S3/Redis, native browser/touch acceptance and external Foundry/Roll20/Fantasy Grounds compatibility remain separately scoped. The base UVTT verification record retains historical evidence and fixture qualification limits.

## Mainline sync and review audit — 2026-10-18

Integrated main `dc57557` (PR #120 and its implementation commit) without conflicts. Its only tree change is `.dockerignore` excluding `services/vision/training/` from the Docker build context; UVTT application behavior is unchanged.

Fresh Node 22.23.2 lint, typecheck, build and all four strict OpenSpec checks pass. Full `npm test` passes **2,042 tests** (718 shared, 484 server, 838 web, 2 latency), with **40 service-dependent checks skipped** because Postgres/S3/Redis were not running for this sync. The earlier real-Postgres evidence above is for the same application code and remains separately scoped. The benchmark delivered 300/300 to both clients; p95 GM 116.7 ms and player 116.9 ms. The user-owned DD2VTT checksum is unchanged.

All four GitHub review threads are resolved and outdated; their fixes remain present and covered: preparation preflight before multipart work, unapplied-only owner/process draft quotas, pending/disabled Undo with error reset, and omission of cleared optional portal fields. No new actionable findings were posted. CodeRabbit's detailed review covers commit `93b346d`, not the library extension, and Copilot skipped the latest feature commit because of quota. A successful status is not a fresh detailed review of the full current diff. The older bot docstring-coverage note is not an enforced failing CI check and does not justify unrelated documentation churn in this sync.

No human architecture approval is recorded on the PR, and ADRs 0041/0042/0043 remain Proposed. CLAUDE.md line 44 requires the Real-Time Architecture owner's review of shared-schema changes. That review and the user's browser acceptance remain prerequisites to recommending merge; this audit does not merge the PR or request reviews on the user's behalf.
