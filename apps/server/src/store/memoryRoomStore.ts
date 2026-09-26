import { randomUUID } from "node:crypto";
import type { CommittedEvent, GmRoomSummary, GridSpec } from "@vtt/shared";
import type { LibraryAssetRecord, NewRoomOptions } from "./libraryStore";
import { SeqConflictError, type CredentialRecord, type NewEvent, type RoomStore } from "./roomStore";

/** Dev/test store. Loses everything on restart. */
export class MemoryRoomStore implements RoomStore {
  private events = new Map<string, CommittedEvent[]>();
  private invites = new Map<string, string>();
  private credentials = new Map<string, CredentialRecord & { revokedAt?: string }>();
  private rooms = new Map<string, { ownerGmId: string | null; name: string; createdAt: string }>();
  private gms = new Map<string, string>();
  private assets = new Map<string, LibraryAssetRecord>();
  /** roomId -> asset ids its current state references. */
  private refs = new Map<string, Set<string>>();
  /** roomId -> object keys uploaded from inside it (ADR 0009). */
  private uploads = new Map<string, Set<string>>();

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

  /** The room's current invite code, found by scanning the invite map. */
  async getInviteCode(roomId: string) {
    for (const [code, id] of this.invites) if (id === roomId) return code;
    return null;
  }

  async setInviteCode(roomId: string, generate: () => string) {
    if (!this.events.has(roomId)) throw new Error(`No room ${roomId}`);
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = generate();
      if (this.invites.has(code)) continue;
      for (const [old, id] of this.invites) if (id === roomId) this.invites.delete(old);
      this.invites.set(code, roomId);
      return code;
    }
    throw new Error("Could not generate a unique invite code");
  }

  /** Stores a credential; re-saving a revoked token keeps it revoked, like the Postgres upsert. */
  async saveCredential(tokenHash: string, record: CredentialRecord) {
    // Like the Postgres upsert, re-saving a token keeps its revoked mark: a removed token stays removed.
    const revokedAt = this.credentials.get(tokenHash)?.revokedAt;
    this.credentials.set(tokenHash, revokedAt ? { ...record, revokedAt } : record);
  }

  /** The credential for a token hash, or null when it is unknown or revoked. */
  async findCredential(tokenHash: string) {
    const row = this.credentials.get(tokenHash);
    // FR-GM-20: a revoked credential resolves to nothing, as in the Postgres store.
    if (!row || row.revokedAt) return null;
    return { roomId: row.roomId, participantId: row.participantId };
  }

  /** The credential for a token hash only when it has been revoked. */
  async findRevokedCredential(tokenHash: string) {
    const row = this.credentials.get(tokenHash);
    return row?.revokedAt ? { roomId: row.roomId, participantId: row.participantId } : null;
  }

  /** Marks every live credential of this participant in this room revoked. */
  async revokeCredentials(roomId: string, participantId: string) {
    const at = new Date().toISOString();
    for (const row of this.credentials.values()) {
      if (row.roomId === roomId && row.participantId === participantId && !row.revokedAt) row.revokedAt = at;
    }
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

  async findRoomOwner(roomId: string) {
    return this.rooms.get(roomId)?.ownerGmId;
  }

  async recordRoomUpload(roomId: string, objectKey: string) {
    if (!this.events.has(roomId)) throw new Error(`No room ${roomId}`);
    const keys = this.uploads.get(roomId) ?? new Set<string>();
    keys.add(objectKey);
    this.uploads.set(roomId, keys);
  }

  /** Drops every map entry for the room. Nothing here can fail halfway, so it is atomic. */
  async deleteRoom(roomId: string) {
    if (!this.events.has(roomId)) return null;
    const uploadKeys = [...(this.uploads.get(roomId) ?? [])];
    this.events.delete(roomId);
    this.rooms.delete(roomId);
    this.refs.delete(roomId);
    this.uploads.delete(roomId);
    for (const [code, id] of this.invites) if (id === roomId) this.invites.delete(code);
    for (const [hash, row] of this.credentials) if (row.roomId === roomId) this.credentials.delete(hash);
    return { uploadKeys };
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
