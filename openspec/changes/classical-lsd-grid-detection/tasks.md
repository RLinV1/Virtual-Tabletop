# Tasks

## 1. Contract and detector

- [x] 1.1 Record ADR and remove confidence from shared contracts/UI; verify schema tests and typecheck.
- [x] 1.2 Port reviewed preprocessing, LSD and fitter, pin runtime; verify geometry and image-boundary Python tests.
- [x] 1.3 Implement disposable-child supervisor, busy admission and deadlines; verify process timeout/admission tests.

## 2. Persistence and scheduling

- [x] 2.1 Add source/configuration identity and terminal-error migration to both stores; verify cache, CAS, invalidation, recovery and deletion tests including Postgres restart.
- [x] 2.2 Update both upload paths with source identity and decoded dimensions; verify tokens, EXIF, oversized images and authorization integration tests.
- [x] 2.3 Bound local/BullMQ execution and retries, handle busy without attempt consumption; verify duplicate-job, overflow and stale-completion tests.

## 3. Editor behavior

- [x] 3.1 Add per-session manual-interaction latch and once-only automatic prefilling; verify delayed first-anchor/typing, saved-grid, discard, save, switch and dismissal browser workflows.
- [x] 3.2 Resolve library cache on selection, require setup before unconfigured placement, stop absent/denied polling; verify library placement and unchanged invocation counts in browser/server checks.

## 4. Verification and performance

- [x] 4.1 Capture unoptimized application baseline, replay saved segments to 1e-6 px and run all 27 pipelines; document any period/phase differences.
- [x] 4.2 Measure three shuffled passes before/after optimizations, preserving parity; report components, processing, queue waiting, browser availability, throughput and process memory separately; render review overlays outside timing.
- [x] 4.3 Verify configurable 2 GiB Compose ceiling and one active wall job alongside grid work; record container memory and full-stack acceptance evidence when Docker is available.

  Docker acceptance passed on 2026-10-26 in an isolated Compose project. All 27 maps retained geometry within 1e-6 px, with one active grid job and one active wall job. The enforced grid limit was 2 GiB; grid/wall cgroup peaks were 644,042,752 / 1,368,784,896 bytes with zero OOM events. A real database restart reused all 27 map results and one no_grid result with zero new detector invocations. Full-stack uploads, S3 artwork preservation, Python/npm suites and all 18 browser cases passed. See `docs/QA-classical-grid.md` and `docs/classical-grid-evidence.json`.
- [x] 4.4 Run lint, typecheck, complete tests, Python wall/grid suites, build and relevant Playwright checks; deliver branch and verification report without supplied maps, merge or deployment.
