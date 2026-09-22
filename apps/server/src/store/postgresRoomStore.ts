import { Prisma, PrismaClient, type LibraryAsset } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AssetKind, CommittedEvent, DomainEvent, GmRoomSummary, GridSpec } from "@vtt/shared";
import type { LibraryAssetRecord, NewRoomOptions } from "./libraryStore";
import type { RedisSeqSource } from "./redisSeq";
import { SeqConflictError, type CredentialRecord, type NewEvent, type RoomStore } from "./roomStore";

/** Postgres unique-violation code; Prisma surfaces it as P2002. */
const PRISMA_UNIQUE_VIOLATION = "P2002";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Append-only event store on Postgres via Prisma (DESIGN.md §3, §4.1;
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

  async createRoom(roomId: string, inviteCode: string, options: NewRoomOptions = {}) {
    await this.prisma.room.create({
      data: { id: roomId, inviteCode, ownerGmId: options.ownerGmId ?? null, name: options.name ?? null },
    });
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

  async registerGm(tokenHash: string) {
    const row = await this.prisma.gmIdentity.upsert({
      where: { tokenHash },
      create: { id: randomUUID(), tokenHash },
      update: {},
      select: { id: true },
    });
    return row.id;
  }

  async findGm(tokenHash: string) {
    const row = await this.prisma.gmIdentity.findUnique({ where: { tokenHash }, select: { id: true } });
    return row?.id ?? null;
  }

  async listOwnedRooms(ownerGmId: string): Promise<GmRoomSummary[]> {
    const rooms = await this.prisma.room.findMany({
      where: { ownerGmId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        events: { select: { createdAt: true }, orderBy: { seq: "desc" }, take: 1 },
      },
    });
    return rooms
      .map((r) => ({
        id: r.id,
        name: r.name ?? "",
        lastActiveAt: (r.events[0]?.createdAt ?? r.createdAt).toISOString(),
      }))
      .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  }

  async createAsset(asset: LibraryAssetRecord) {
    await this.prisma.libraryAsset.create({
      data: {
        ...asset,
        grid: asset.grid ?? Prisma.DbNull,
        createdAt: new Date(asset.createdAt),
      },
    });
  }

  async listAssets(ownerGmId: string) {
    const rows = await this.prisma.libraryAsset.findMany({ where: { ownerGmId }, orderBy: { createdAt: "desc" } });
    return rows.map(toAssetRecord);
  }

  async findAsset(id: string, ownerGmId: string) {
    const row = await this.prisma.libraryAsset.findFirst({ where: { id, ownerGmId } });
    return row ? toAssetRecord(row) : null;
  }

  async updateAsset(id: string, ownerGmId: string, patch: { name?: string; grid?: GridSpec }) {
    const { count } = await this.prisma.libraryAsset.updateMany({
      where: { id, ownerGmId },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.grid && { grid: patch.grid as unknown as Prisma.InputJsonValue }),
      },
    });
    return count === 1 ? this.findAsset(id, ownerGmId) : null;
  }

  async deleteAsset(id: string, ownerGmId: string) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.libraryAsset.findFirst({ where: { id, ownerGmId } });
      if (!row) return null;
      await tx.assetRef.deleteMany({ where: { assetId: id } });
      await tx.libraryAsset.delete({ where: { id } });
      return toAssetRecord(row);
    });
  }

  async setAssetRefs(roomId: string, assetIds: string[]) {
    // Only ids with a library row: a room still showing a deleted asset must not write it
    // back into the index. The ids arrive in client commands, so they may not be uuids.
    const uuids = assetIds.filter((id) => UUID.test(id));
    await this.prisma.$transaction(async (tx) => {
      const existing = uuids.length
        ? await tx.libraryAsset.findMany({ where: { id: { in: uuids } }, select: { id: true } })
        : [];
      await tx.assetRef.deleteMany({ where: { roomId } });
      await tx.assetRef.createMany({ data: existing.map(({ id }) => ({ assetId: id, roomId })) });
    });
  }

  async assetUsage(assetId: string, ownerGmId: string) {
    const refs = await this.prisma.assetRef.findMany({
      where: { assetId, room: { ownerGmId } },
      select: { room: { select: { id: true, name: true } } },
    });
    return refs.map((r) => ({ id: r.room.id, name: r.room.name ?? "" }));
  }

  async close() {
    await this.prisma.$disconnect();
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === PRISMA_UNIQUE_VIOLATION;
}

function toAssetRecord(row: LibraryAsset): LibraryAssetRecord {
  return {
    id: row.id,
    ownerGmId: row.ownerGmId,
    kind: row.kind as AssetKind,
    objectKey: row.objectKey,
    url: row.url,
    name: row.name,
    width: row.width,
    height: row.height,
    grid: (row.grid as unknown as GridSpec | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
