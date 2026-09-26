import type { SessionEndReason } from "@vtt/shared";
import type { RoomStore } from "../store/roomStore";
import { LiveRoom } from "./liveRoom";

/**
 * Loads each room at most once per process. Single-process only: running more than one
 * server instance requires routing each room to one instance (see ADR 0001).
 */
export class RoomRegistry {
  private rooms = new Map<string, Promise<LiveRoom>>();

  constructor(private store: RoomStore) {}

  async get(roomId: string): Promise<LiveRoom | null> {
    const existing = this.rooms.get(roomId);
    if (existing) return existing;
    let exists: boolean;
    try {
      exists = await this.store.roomExists(roomId);
    } catch (err) {
      // Before the load starts, so the handler below never sees it: name the room here too.
      console.error(`[vtt] room ${roomId} failed to load:`, err);
      throw err;
    }
    if (!exists) return null;
    // Re-check after the await so concurrent callers share one load.
    let loading = this.rooms.get(roomId);
    if (!loading) {
      loading = LiveRoom.load(roomId, this.store);
      this.rooms.set(roomId, loading);
      // A failed load is logged and forgotten, so the next caller tries again (room-load-isolation).
      loading.catch((err: unknown) => {
        console.error(`[vtt] room ${roomId} failed to load:`, err);
        this.rooms.delete(roomId);
      });
    }
    return loading;
  }

  /**
   * Ends a loaded room for everyone ahead of deleting it (ADR 0009). The closed room stays
   * registered until `evict`, so a handshake in between finds it closed instead of reloading it.
   */
  async close(roomId: string, reason: SessionEndReason) {
    const room = await this.rooms.get(roomId)?.catch(() => null);
    await room?.close(reason);
  }

  /** Forgets a room, so the next `get` reads the store again. */
  evict(roomId: string) {
    this.rooms.delete(roomId);
  }
}
