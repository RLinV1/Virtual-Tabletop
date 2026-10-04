## Why

KAN-42 (FR-REC-03) has three acceptance criteria:

- **Every committed action writes to the event log.** Met. `LiveRoom.commit` appends before it reduces or broadcasts.
- **Undo and checkpoint restore both append events, and nothing is updated or deleted.** Met for undo (ADR 0013). Checkpoint restore does not exist yet; KAN-41 adds it, and its design already restores by appending events.
- **The `events` table is insert-only, enforced at the database level.** Not met. The rule lives only in comments (`schema.prisma` header, ADR 0001, invariant 5). Any `UPDATE events` or `DELETE FROM events`, whether from a bug, a careless migration or a manual `psql` session, succeeds today.

The rule has one approved exception. ADR 0009 lets room deletion erase a room's whole log in the same transaction that removes the room row. Enforcement has to keep that path working and block everything else.

## What Changes

- New Prisma migration `0007_events_insert_only` adding Postgres triggers on `events`:
  - `BEFORE UPDATE` (row level): always raises.
  - `BEFORE DELETE` (row level): raises unless the current transaction has set `vtt.room_delete` to the id of the row's room.
  - `BEFORE TRUNCATE` (statement level): always raises.
- `PostgresRoomStore.deleteRoom` runs `SELECT set_config('vtt.room_delete', <roomId>, true)` (transaction-local) inside its existing transaction before deleting events.
- Postgres store tests prove an update, a stray delete and a truncate are each rejected, and room deletion still works.
- Docs: ADR 0009 gains an "Enforcement" note. The `schema.prisma` header points to the trigger.
- `MemoryRoomStore` already exposes no update or delete path for events other than room deletion. A unit test pins that.

## Capabilities

### New Capabilities

- `event-log-integrity`: the event log can only grow, enforced by the database, with whole-room deletion as the single exception.

### Modified Capabilities

None.

## Impact

- `apps/server/prisma/migrations/0007_events_insert_only/migration.sql` (new).
- `apps/server/src/store/postgresRoomStore.ts`: one `set_config` call in `deleteRoom`.
- `apps/server/test/postgresStore.test.ts` and `roomDeletionStore.test.ts`: new cases (run when `DATABASE_URL` is set).
- `docs/adr/0009-room-deletion.md`, `apps/server/prisma/schema.prisma` comments.
- No change to `packages/shared`, so no schema ADR. Deploy runs `prisma migrate deploy` as today.
