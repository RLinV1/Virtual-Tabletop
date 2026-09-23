import { PrismaClient, type Prisma } from "@prisma/client";
import type { CommittedEvent, DomainEvent } from "@vtt/shared";
import type { RedisSeqSource } from "./redisSeq";
import { SeqConflictError, type CredentialRecord, type NewEvent, type RoomStore } from "./roomStore";

/** Postgres unique-violation code; Prisma surfaces it as P2002. */
const PRISMA_UNIQUE_VIOLATION = "P2002";

/**
 * Append-only event store on Postgres via Prisma (DESIGN.md §2, §5;
 * docs/adr/0001-event-model.md).
 *
 * The ordering guarantee lives in the schema, not in application code:
 * `@@id([roomId, seq])` makes a duplicate seq a constraint violation, and the whole
 * append runs inside one `$transaction` — so a batch of events either commits with
 * consecutive seqs or not at all (FR-SYNC-04). Rows are never updated or deleted;
 * undo is a new compensating event (FR-REC-03).
 */
export class PostgresRoomStore implements RoomStore {
  private constructor(
    private prisma: PrismaClient,
    private seqSource: RedisSeqSource | null,
  ) {}

  static async connect(connectionString: string, seqSource: RedisSeqSource | null = null) {
    const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });
    await prisma.$connect();
    return new PostgresRoomStore(prisma, seqSource);
  }

  async createRoom(roomId: string, inviteCode: string) {
    await this.prisma.room.create({ data: { id: roomId, inviteCode } });
  }

  async roomExists(roomId: string) {
    return (await this.prisma.room.count({ where: { id: roomId } })) === 1;
  }

  async findRoomByInvite(inviteCode: string) {
    const room = await this.prisma.room.findUnique({ where: { inviteCode }, select: { id: true } });
    return room?.id ?? null;
  }

  async saveCredential(tokenHash: string, record: CredentialRecord) {
    const data = { roomId: record.roomId, participantId: record.participantId };
    await this.prisma.credential.upsert({
      where: { tokenHash },
      create: { tokenHash, ...data },
      update: data,
    });
  }

  async findCredential(tokenHash: string) {
    const row = await this.prisma.credential.findUnique({ where: { tokenHash } });
    // FR-GM-20: a revoked credential resolves to nothing, as if it had never existed.
    if (!row || row.revokedAt) return null;
    return { roomId: row.roomId, participantId: row.participantId };
  }

  async append(roomId: string, expectedLastSeq: number, events: NewEvent[]): Promise<CommittedEvent[]> {
    if (events.length === 0) return [];

    // Redis hands out the range when it is available; the composite PK is what enforces it.
    const firstSeq = this.seqSource
      ? await this.seqSource.reserve(roomId, events.length)
      : expectedLastSeq + 1;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const { _max } = await tx.event.aggregate({
          where: { roomId },
          _max: { seq: true },
        });
        if ((_max.seq ?? 0) !== expectedLastSeq) throw new SeqConflictError(roomId, expectedLastSeq);

        const committed: CommittedEvent[] = [];
        for (const [i, e] of events.entries()) {
          const row = await tx.event.create({
            data: {
              roomId,
              seq: firstSeq + i,
              type: e.event.type,
              payload: e.event as unknown as Prisma.InputJsonValue,
              actorId: e.actorId,
            },
          });
          committed.push({
            seq: row.seq,
            at: row.createdAt.toISOString(),
            actorId: row.actorId,
            event: e.event,
          });
        }
        return committed;
      });
    } catch (err) {
      // A duplicate seq means another writer won the race; surface it as a seq conflict
      // so the caller reloads rather than retrying blindly.
      if (isUniqueViolation(err)) throw new SeqConflictError(roomId, expectedLastSeq);
      throw err;
    }
  }

  async loadEvents(roomId: string): Promise<CommittedEvent[]> {
    const rows = await this.prisma.event.findMany({
      where: { roomId },
      orderBy: { seq: "asc" },
    });

    const events = rows.map((r) => ({
      seq: r.seq,
      at: r.createdAt.toISOString(),
      actorId: r.actorId,
      event: r.payload as unknown as DomainEvent,
    }));

    // Keep Redis at or ahead of the log, so a Redis reset cannot reissue a used seq.
    if (this.seqSource && events.length > 0) {
      await this.seqSource.syncTo(roomId, events.at(-1)!.seq);
    }
    return events;
  }

  async close() {
    await this.prisma.$disconnect();
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === PRISMA_UNIQUE_VIOLATION;
}
