# Tasks

- [x] 1.1 Add `SHIPPED_MAPS` to `packages/shared/src/shippedMaps.ts`; derive web built-in maps from it.
- [x] 2.1 Migration 0014, Prisma column, `seedShippedMaps` in memory and Postgres stores.
- [x] 2.2 Seed on `GET /api/library` (accounts); skip file delete for `shipped:` keys.
- [x] 2.3 Resolve a shipped map URL in `boardFromRoom`.
- [x] 3.1 Stop listing built-in maps in the library page and picker for signed-in accounts.
- [x] 4.1 Tests: seed once, deleted not re-seeded, delete keeps shipped file, encounter save with URL-only room, web listing.
- [x] 4.2 Write `docs/adr/0036-seeded-shipped-maps.md`.
- [x] 6.1 Library map editor shell with Grid step; save-to-library on room upload.
- [x] 6.2 Library board: shared schema, migration 0015, stores, `GET/PUT /api/library/:id/board`, ADR 0037.
- [x] 6.3 Library editor Walls and Fog steps; copy the board into the room on place; hide detection unless the service is up.
- [x] 6.4 Encounter template Preview (`GET /api/library/encounters/:id/preview`).
- [x] 5.1 Run `npm run lint && npm run typecheck && npm test`; verify in the browser.
