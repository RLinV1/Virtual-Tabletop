import type { CommittedEvent } from "@vtt/shared";
import { SeqConflictError, type CredentialRecord, type NewEvent, type RoomStore } from "./roomStore";

/** Dev/test store. Loses everything on restart. */
export class MemoryRoomStore implements RoomStore {
  private events = new Map<string, CommittedEvent[]>();
  private invites = new Map<string, string>();
  private credentials = new Map<string, CredentialRecord>();

  async createRoom(roomId: string, inviteCode: string) {
    if (this.events.has(roomId)) throw new Error(`Room ${roomId} already exists`);
    this.events.set(roomId, []);
    this.invites.set(inviteCode, roomId);
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
}
