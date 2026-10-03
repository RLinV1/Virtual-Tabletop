## 1. Migration

- [x] 1.1 Add `apps/server/prisma/migrations/0006_events_insert_only/migration.sql` with the guard function and the `BEFORE UPDATE`, `BEFORE DELETE` (row) and `BEFORE TRUNCATE` (statement) triggers on `events`; verify `npx prisma migrate deploy` applies it cleanly against `docker compose up -d postgres`
- [x] 1.2 Verify by hand in `psql` that `UPDATE events SET type = type`, `DELETE FROM events` and `TRUNCATE events` each fail with the FR-REC-03 message

## 2. Store

- [x] 2.1 In `PostgresRoomStore.deleteRoom`, run `tx.$executeRaw\`SELECT set_config('vtt.room_delete', ${roomId}, true)\`` as the first statement of the transaction; verify the existing `roomDeletionStore.test.ts` passes against Postgres

## 3. Tests

- [x] 3.1 Add to `postgresStore.test.ts` (`describe("event log is insert-only (KAN-42, FR-REC-03)")`): a raw UPDATE, a raw DELETE and a TRUNCATE on `events` each reject, and the rows are unchanged afterwards; verify with `DATABASE_URL=... npm test --workspace=@vtt/server -- -t "insert-only"`
- [x] 3.2 Add (in `postgresStore.test.ts`, next to 3.1): deleting room A leaves room B's events intact, and a transaction that sets `vtt.room_delete` to A but deletes B's events rolls back; verify against Postgres
- [x] 3.3 Add a `MemoryRoomStore` unit test that, after appends and an undo, `loadEvents` returns every earlier event unchanged; verify with `npm test --workspace=@vtt/server`

## 4. Docs and close out

- [x] 4.1 Add an "Enforcement" paragraph to `docs/adr/0009-room-deletion.md` and point the `schema.prisma` header comment to the trigger; verify the links resolve
- [ ] 4.2 Run `npm run lint && npm run typecheck && npm test` without and with `DATABASE_URL`; verify all pass

> Verification note: Docker was not available on the dev machine, so 1.1, 1.2, 2.1 and 3.1–3.2 were verified by applying migrations 0001–0006 to PGlite (Postgres in WebAssembly) and running the same UPDATE / DELETE / TRUNCATE / cross-room / room-deletion statements. The Postgres test cases are in the suite and run whenever `DATABASE_URL` is set; CI does not start Postgres today. 4.2 stays open until the suite has run once with `DATABASE_URL` against a real Postgres.
