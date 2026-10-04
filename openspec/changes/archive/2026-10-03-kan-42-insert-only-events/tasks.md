## 1. Migration

- [x] 1.1 Add `apps/server/prisma/migrations/0007_events_insert_only/migration.sql` with the guard function and the `BEFORE UPDATE`, `BEFORE DELETE` (row) and `BEFORE TRUNCATE` (statement) triggers on `events`; verify `npx prisma migrate deploy` applies it cleanly against `docker compose up -d postgres`
- [x] 1.2 Verify by hand in `psql` that `UPDATE events SET type = type`, `DELETE FROM events` and `TRUNCATE events` each fail with the FR-REC-03 message

## 2. Store

- [x] 2.1 In `PostgresRoomStore.deleteRoom`, run `tx.$executeRaw\`SELECT set_config('vtt.room_delete', ${roomId}, true)\`` as the first statement of the transaction; verify the existing `roomDeletionStore.test.ts` passes against Postgres

## 3. Tests

- [x] 3.1 Add to `postgresStore.test.ts` (`describe("event log is insert-only (KAN-42, FR-REC-03)")`): a raw UPDATE, a raw DELETE and a TRUNCATE on `events` each reject, and the rows are unchanged afterwards; verify with `DATABASE_URL=... npm test --workspace=@vtt/server -- -t "insert-only"`
- [x] 3.2 Add (in `postgresStore.test.ts`, next to 3.1): deleting room A leaves room B's events intact, and a transaction that sets `vtt.room_delete` to A but deletes B's events rolls back; verify against Postgres
- [x] 3.3 Add a `MemoryRoomStore` unit test that, after appends and an undo, `loadEvents` returns every earlier event unchanged; verify with `npm test --workspace=@vtt/server`

## 4. Docs and close out

- [x] 4.1 Add an "Enforcement" paragraph to `docs/adr/0009-room-deletion.md` and point the `schema.prisma` header comment to the trigger; verify the links resolve
- [x] 4.2 Run `npm run lint && npm run typecheck && npm test` without and with `DATABASE_URL`; verify all pass

> Verification: on 2026-10-03 migrations 0001–0007 applied cleanly to Postgres 17 (`docker compose up -d postgres`, `prisma migrate deploy`); `TRUNCATE events` is rejected by the trigger; with `DATABASE_URL` set the whole suite passes (server: 297 passed, 1 skipped for Redis), including the insert-only and cross-room cases. Earlier the same SQL was also checked on PGlite. CI still does not start Postgres, so these cases skip there.
