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
    if (!(await this.store.roomExists(roomId))) return null;
    // Re-check after the await so concurrent callers share one load.
    let loading = this.rooms.get(roomId);
    if (!loading) {
      loading = LiveRoom.load(roomId, this.store);
      this.rooms.set(roomId, loading);
      loading.catch(() => this.rooms.delete(roomId));
    }
    return loading;
  }
}
