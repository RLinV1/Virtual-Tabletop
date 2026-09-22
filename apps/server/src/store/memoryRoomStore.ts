import { randomUUID } from "node:crypto";
import type { CommittedEvent, GmRoomSummary, GridSpec } from "@vtt/shared";
import type { LibraryAssetRecord, NewRoomOptions } from "./libraryStore";
import { SeqConflictError, type CredentialRecord, type NewEvent, type RoomStore } from "./roomStore";

/** Dev/test store. Loses everything on restart. */
export class MemoryRoomStore implements RoomStore {
  private events = new Map<string, CommittedEvent[]>();
  private invites = new Map<string, string>();
  private credentials = new Map<string, CredentialRecord>();
  private rooms = new Map<string, { ownerGmId: string | null; name: string; createdAt: string }>();
  private gms = new Map<string, string>();
  private assets = new Map<string, LibraryAssetRecord>();
  /** roomId -> asset ids its current state references. */
  private refs = new Map<string, Set<string>>();

  async createRoom(roomId: string, inviteCode: string, options: NewRoomOptions = {}) {
    if (this.events.has(roomId)) throw new Error(`Room ${roomId} already exists`);
    this.events.set(roomId, []);
    this.invites.set(inviteCode, roomId);
    this.rooms.set(roomId, {
      ownerGmId: options.ownerGmId ?? null,
      name: options.name ?? "",
      createdAt: new Date().toISOString(),
    });
  }

  async roomExists(roomId: string) {
    return this.events.has(roomId);
  }

  async findRoomByInvite(inviteCode: string) {
    return this.invites.get(inviteCode) ?? null;
  }

  async saveCredential(tokenHash: string, record: CredentialRecord) {
    this.credentials.set(tokenHash, record);
  }

  async findCredential(tokenHash: string) {
    return this.credentials.get(tokenHash) ?? null;
  }

  async append(roomId: string, expectedLastSeq: number, events: NewEvent[]) {
    const log = this.events.get(roomId);
    if (!log) throw new Error(`No room ${roomId}`);
    if (log.length !== expectedLastSeq) throw new SeqConflictError(roomId, expectedLastSeq);
    const at = new Date().toISOString();
    const committed = events.map((e, i) => ({
      seq: expectedLastSeq + i + 1,
      at,
      actorId: e.actorId,
      event: structuredClone(e.event),
    }));
    log.push(...committed);
    return committed;
  }

  async loadEvents(roomId: string) {
    return [...(this.events.get(roomId) ?? [])];
  }

  async registerGm(tokenHash: string) {
    const existing = this.gms.get(tokenHash);
    if (existing) return existing;
    const id = randomUUID();
    this.gms.set(tokenHash, id);
    return id;
  }

  async findGm(tokenHash: string) {
    return this.gms.get(tokenHash) ?? null;
  }

  async listOwnedRooms(ownerGmId: string): Promise<GmRoomSummary[]> {
    return [...this.rooms.entries()]
      .filter(([, room]) => room.ownerGmId === ownerGmId)
      .map(([id, room]) => ({
        id,
        name: room.name,
        lastActiveAt: this.events.get(id)?.at(-1)?.at ?? room.createdAt,
      }))
      .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  }

  async createAsset(asset: LibraryAssetRecord) {
    this.assets.set(asset.id, structuredClone(asset));
  }

  async listAssets(ownerGmId: string) {
    return [...this.assets.values()]
      .filter((a) => a.ownerGmId === ownerGmId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((a) => structuredClone(a));
  }

  async findAsset(id: string, ownerGmId: string) {
    const asset = this.assets.get(id);
    return asset && asset.ownerGmId === ownerGmId ? structuredClone(asset) : null;
  }

  async updateAsset(id: string, ownerGmId: string, patch: { name?: string; grid?: GridSpec }) {
    const asset = this.assets.get(id);
    if (!asset || asset.ownerGmId !== ownerGmId) return null;
    const next = { ...asset, ...(patch.name !== undefined && { name: patch.name }), ...(patch.grid && { grid: patch.grid }) };
    this.assets.set(id, next);
    return structuredClone(next);
  }

  async deleteAsset(id: string, ownerGmId: string) {
    const asset = this.assets.get(id);
    if (!asset || asset.ownerGmId !== ownerGmId) return null;
    this.assets.delete(id);
    for (const ids of this.refs.values()) ids.delete(id);
    return asset;
  }

  async setAssetRefs(roomId: string, assetIds: string[]) {
    // Ids with no library row (deleted, or never real) are dropped, so a room that still
    // shows a deleted asset cannot write it back into the index.
    this.refs.set(roomId, new Set(assetIds.filter((id) => this.assets.has(id))));
  }

  async assetUsage(assetId: string, ownerGmId: string) {
    const usage: { id: string; name: string }[] = [];
    for (const [roomId, ids] of this.refs) {
      const room = this.rooms.get(roomId);
      if (ids.has(assetId) && room?.ownerGmId === ownerGmId) usage.push({ id: roomId, name: room.name });
    }
    return usage;
  }
}
