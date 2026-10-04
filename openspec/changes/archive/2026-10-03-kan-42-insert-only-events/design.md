## Context

`events` is a Prisma-managed Postgres table with primary key `(room_id, seq)` and a non-cascading foreign key to `rooms`. The application only ever inserts, through `PostgresRoomStore.append`. The one delete is `deleteRoom` (ADR 0009). It removes children in one `$transaction`, events included, then the room row. Nothing in the database stops other writes today.

## Goals / Non-Goals

**Goals:**
- An accidental UPDATE, DELETE or TRUNCATE on `events` fails loudly at the database.
- Room deletion keeps working with no change to its ordering or atomicity.

**Non-Goals:**
- Defending against a malicious operator with full database rights. The owner of a table can always drop a trigger. This is a guard against mistakes, not an access-control boundary.
- Enforcement in `MemoryRoomStore` beyond what its API already allows. It is a dev/test store.
- `snapshots` and `checkpoints`. They are derived or user-managed, not the log.

## Decisions

### 1. Triggers, not revoked privileges
Row-level `BEFORE UPDATE` and `BEFORE DELETE` triggers plus a statement-level `BEFORE TRUNCATE` trigger, each calling a small `plpgsql` function that raises `insufficient_privilege` with a message naming FR-REC-03.

*Alternative:* run the app as a role with only `INSERT, SELECT` on `events`, and route room deletion through a `SECURITY DEFINER` function. That is stronger, but it needs two database roles, changes the Docker and deploy setup, and Prisma migrations would have to run as the owner role. Too much setup for a course project. The trigger meets the acceptance criterion "enforced at the database level".

### 2. Room deletion opts in per room, per transaction
`deleteRoom` calls `set_config('vtt.room_delete', roomId, true)` as the first statement in its transaction. The third argument makes the setting transaction-local, so it disappears at commit or rollback and cannot leak to a pooled connection. The delete trigger allows a row only when `OLD.room_id::text = current_setting('vtt.room_delete', true)`. A missing setting reads as NULL and fails the check.

Scoping the opt-in to one room id means a bug in the deletion transaction cannot remove another room's history.

*Alternative:* a boolean flag. Simpler, but it would let the deletion transaction delete any room's events.

### 3. Prisma `deleteMany` stays
Prisma's `tx.event.deleteMany({ where: { roomId } })` issues a plain `DELETE` that fires the row trigger per row. No raw SQL is needed beyond the `set_config` call (`tx.$executeRaw`).

## Risks / Trade-offs

- [Per-row trigger cost on large room deletions] → Room deletion is rare and already one transaction. The trigger is a single string comparison per row.
- [A future migration legitimately needs to rewrite events, e.g. a backfill] → It must drop and recreate the trigger inside the same migration, which makes the rewrite deliberate and visible in review. Note this in the `schema.prisma` header.
- [Tests need Postgres] → The new cases live in the existing `describe.skipIf(!store)` suites, so a checkout without `DATABASE_URL` stays green. CI with Postgres runs them.

## Migration Plan

1. Deploy runs `prisma migrate deploy`, which creates the function and triggers. Existing rows are unaffected.
2. Rollback: a follow-up migration that drops the three triggers and the function. No data changes either way.
