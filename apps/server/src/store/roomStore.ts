import type { CommittedEvent, DomainEvent } from "@vtt/shared";
import type { LibraryStore, NewRoomOptions } from "./libraryStore";

export interface NewEvent {
  actorId: string | null;
  event: DomainEvent;
}

export interface CredentialRecord {
  roomId: string;
  participantId: string;
}

/** Thrown when another writer appended first. The room's in-memory seq is stale. */
export class SeqConflictError extends Error {
  constructor(roomId: string, expected: number) {
    super(`Seq conflict in room ${roomId}: expected last seq ${expected}`);
  }
}

/**
 * Persistence boundary. The in-memory implementation is for dev/tests; a Postgres
 * implementation (see db/001_init.sql) must satisfy the same contract:
 *  - `append` is atomic: all events commit with consecutive seqs, or none do.
 *  - `append` fails with SeqConflictError if the room's last seq != expectedLastSeq.
 *  - events are never updated or deleted, except that `deleteRoom` erases a whole room's
 *    log together with the room (ADR 0009).
 */
export interface RoomStore extends LibraryStore {
  createRoom(roomId: string, inviteCode: string, options?: NewRoomOptions): Promise<void>;
  roomExists(roomId: string): Promise<boolean>;
  findRoomByInvite(inviteCode: string): Promise<string | null>;
  /** The room's current invite code (FR-GM-20). Access config on the room row, not game state. */
  getInviteCode(roomId: string): Promise<string | null>;
  /**
   * Replaces the room's invite code; the old one stops resolving at once. `generate` is called
   * again if a code collides with another room's (at most 3 tries).
   */
  setInviteCode(roomId: string, generate: () => string): Promise<string>;

  saveCredential(tokenHash: string, record: CredentialRecord): Promise<void>;
  findCredential(tokenHash: string): Promise<CredentialRecord | null>;
  /**
   * Marks every credential of this participant revoked (FR-GM-20, ADR 0006). Room state is the
   * authority; this row is a second lock, written after the commit and re-applied when the room
   * loads. Idempotent.
   */
  revokeCredentials(roomId: string, participantId: string): Promise<void>;
  /** A credential that was revoked, so the handshake can say `revoked` rather than `unauthorized`. */
  findRevokedCredential(tokenHash: string): Promise<CredentialRecord | null>;

  append(roomId: string, expectedLastSeq: number, events: NewEvent[]): Promise<CommittedEvent[]>;
  loadEvents(roomId: string): Promise<CommittedEvent[]>;

  /** The GM identity that owns the room: null for an unowned room, undefined for no room. */
  findRoomOwner(roomId: string): Promise<string | null | undefined>;
  /** Records an image uploaded from inside the room, so deleting the room removes it (ADR 0009). */
  recordRoomUpload(roomId: string, objectKey: string): Promise<void>;
  /**
   * Erases the room and everything scoped to it in one atomic step (ADR 0009): events,
   * snapshots, checkpoints, credentials (revoked ones too), the invite code, asset refs and
   * upload records. Returns the upload keys for the caller to remove from the AssetStore once
   * this has committed, or null when there was no such room.
   */
  deleteRoom(roomId: string): Promise<{ uploadKeys: string[] } | null>;
}
