import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { CommittedEvent, DomainEvent } from "@vtt/shared";
import type { RedisSeqSource } from "./redisSeq";
import { SeqConflictError, type CredentialRecord, type NewEvent, type RoomStore } from "./roomStore";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Append-only event store on Postgres (DESIGN.md §3, §4; docs/adr/0001-event-model.md).
 *
 * The ordering guarantee lives in the schema, not in application code:
 * `PRIMARY KEY (room_id, seq)` makes a duplicate seq a constraint violation, and the
 * whole append runs in one transaction — so a batch of events either commits with
 * consecutive seqs or not at all (FR-SYNC-04). Rows are never updated or deleted;
 * undo is a new compensating event (FR-REC-03).
 */
export class PostgresRoomStore implements RoomStore {
  private constructor(
    private pool: pg.Pool,
    private seqSource: RedisSeqSource | null,
  ) {}

  static async connect(connectionString: string, seqSource: RedisSeqSource | null = null) {
    const pool = new pg.Pool({ connectionString, max: 10 });
    const store = new PostgresRoomStore(pool, seqSource);
    await store.migrate();
    return store;
  }

  /** Applies db/001_init.sql. Idempotent: every statement is CREATE ... IF NOT EXISTS. */
  private async migrate() {
    const sql = await readFile(path.join(here, "..", "..", "db", "001_init.sql"), "utf8");
    await this.pool.query(sql);
  }

  async createRoom(roomId: string, inviteCode: string) {
    await this.pool.query("INSERT INTO rooms (id, invite_code) VALUES ($1, $2)", [roomId, inviteCode]);
  }

  async roomExists(roomId: string) {
    const { rowCount } = await this.pool.query("SELECT 1 FROM rooms WHERE id = $1", [roomId]);
    return rowCount === 1;
  }

  async findRoomByInvite(inviteCode: string) {
    const { rows } = await this.pool.query<{ id: string }>(
      "SELECT id FROM rooms WHERE invite_code = $1",
      [inviteCode],
    );
    return rows[0]?.id ?? null;
  }

  async saveCredential(tokenHash: string, record: CredentialRecord) {
    await this.pool.query(
      `INSERT INTO credentials (token_hash, room_id, participant_id) VALUES ($1, $2, $3)
       ON CONFLICT (token_hash) DO UPDATE SET room_id = EXCLUDED.room_id, participant_id = EXCLUDED.participant_id`,
      [tokenHash, record.roomId, record.participantId],
    );
  }

  async findCredential(tokenHash: string) {
    const { rows } = await this.pool.query<{ room_id: string; participant_id: string; revoked_at: Date | null }>(
      "SELECT room_id, participant_id, revoked_at FROM credentials WHERE token_hash = $1",
      [tokenHash],
    );
    const row = rows[0];
    // FR-GM-20: a revoked credential resolves to nothing, as if it had never existed.
    if (!row || row.revoked_at) return null;
    return { roomId: row.room_id, participantId: row.participant_id };
  }

  async append(roomId: string, expectedLastSeq: number, events: NewEvent[]): Promise<CommittedEvent[]> {
    if (events.length === 0) return [];

    // Redis hands out the range when it is available; the PK below is what enforces it.
    const firstSeq = this.seqSource
      ? await this.seqSource.reserve(roomId, events.length)
      : expectedLastSeq + 1;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query<{ last: string | null }>(
        "SELECT MAX(seq) AS last FROM events WHERE room_id = $1",
        [roomId],
      );
      const actualLastSeq = Number(rows[0]?.last ?? 0);
      if (actualLastSeq !== expectedLastSeq) throw new SeqConflictError(roomId, expectedLastSeq);

      const committed: CommittedEvent[] = [];
      for (const [i, e] of events.entries()) {
        const seq = firstSeq + i;
        const { rows: inserted } = await client.query<{ created_at: Date }>(
          `INSERT INTO events (room_id, seq, type, payload, actor_id)
           VALUES ($1, $2, $3, $4, $5) RETURNING created_at`,
          [roomId, seq, e.event.type, JSON.stringify(e.event), e.actorId],
        );
        committed.push({
          seq,
          at: inserted[0]!.created_at.toISOString(),
          actorId: e.actorId,
          event: e.event,
        });
      }

      await client.query("COMMIT");
      return committed;
    } catch (err) {
      await client.query("ROLLBACK");
      // A duplicate seq means another writer won the race; surface it as a seq conflict
      // so the caller reloads rather than retrying blindly.
      if (isUniqueViolation(err)) throw new SeqConflictError(roomId, expectedLastSeq);
      throw err;
    } finally {
      client.release();
    }
  }

  async loadEvents(roomId: string): Promise<CommittedEvent[]> {
    const { rows } = await this.pool.query<{
      seq: number;
      created_at: Date;
      actor_id: string | null;
      payload: DomainEvent;
    }>("SELECT seq, created_at, actor_id, payload FROM events WHERE room_id = $1 ORDER BY seq ASC", [
      roomId,
    ]);

    const events = rows.map((r) => ({
      seq: Number(r.seq),
      at: r.created_at.toISOString(),
      actorId: r.actor_id,
      event: r.payload,
    }));

    // Keep Redis at or ahead of the log, so a Redis reset cannot reissue a used seq.
    if (this.seqSource && events.length > 0) {
      await this.seqSource.syncTo(roomId, events.at(-1)!.seq);
    }
    return events;
  }

  async close() {
    await this.pool.end();
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "23505";
}
