import Redis from "ioredis";

/**
 * Per-room sequence numbers from Redis `INCR` (DESIGN.md §2, FR-SYNC-04).
 *
 * `INCR` is atomic, so two server instances appending to the same room can never
 * be handed the same `seq`. It is an optimisation, not the guarantee: the
 * authoritative constraint is `PRIMARY KEY (room_id, seq)` in Postgres, which
 * rejects a duplicate even if Redis is reset or unavailable.
 */
export class RedisSeqSource {
  private constructor(private redis: Redis) {}

  static async connect(url: string): Promise<RedisSeqSource> {
    const redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
    await redis.connect();
    return new RedisSeqSource(redis);
  }

  /** Reserve `count` consecutive seqs, returning the first. */
  async reserve(roomId: string, count: number): Promise<number> {
    const last = await this.redis.incrby(`room:${roomId}:seq`, count);
    return last - count + 1;
  }

  /**
   * Align the counter with the log after loading a room, so a Redis restart or a
   * room written while Redis was down cannot hand out a seq that already exists.
   */
  async syncTo(roomId: string, lastSeq: number): Promise<void> {
    const key = `room:${roomId}:seq`;
    const current = Number((await this.redis.get(key)) ?? 0);
    if (current < lastSeq) await this.redis.set(key, lastSeq);
  }

  /** Drops a deleted room's counter (ADR 0009). */
  async forget(roomId: string): Promise<void> {
    await this.redis.del(`room:${roomId}:seq`);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
