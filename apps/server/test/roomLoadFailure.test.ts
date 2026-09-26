import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewEvent } from "../src/store/roomStore";
import { hashToken } from "../src/domain/credentials";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer, type TestClient } from "./helpers";

const servers: Awaited<ReturnType<typeof startServer>>[] = [];
const clients: TestClient[] = [];

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await Promise.all(servers.splice(0).map((s) => s.close()));
  vi.restoreAllMocks();
});

/**
 * A room written by code newer than this server: its log holds an event the reducer rejects.
 * Created on one server, then poisoned and reopened on a second one, so nothing is cached.
 */
async function poisonedRoom() {
  const store = new MemoryRoomStore();
  const first = await startServer(store);
  const gm = await first.createRoom();
  await first.close();

  const seq = (await store.loadEvents(gm.roomId)).length;
  const unknown = { actorId: gm.participantId, event: { type: "NotARealEvent" } } as unknown as NewEvent;
  await store.append(gm.roomId, seq, [unknown]);

  const server = await startServer(store);
  servers.push(server);
  return { server, store, gm };
}

describe("room load isolation (room-load-isolation)", () => {
  it("refuses only the socket for a room that fails to load and keeps serving", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, gm } = await poisonedRoom();

    await expect(server.connect(gm)).rejects.toThrow("not_found");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(gm.roomId), expect.anything());

    const health = await fetch(`${server.base}/health`);
    expect(health.status).toBe(200);

    const other = await server.createRoom("Other GM");
    const client = await server.connect(other);
    clients.push(client);
    expect(client.state.roomId).toBe(other.roomId);
  });

  it("answers 500 to a REST request for that room and saves no credential", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, store, gm } = await poisonedRoom();

    const joined = await server.tryJoin(gm.inviteCode, "Sam");
    expect(joined.status).toBe(500);
    expect(joined.body).toEqual({ error: "Internal error" });
    expect(await store.findCredential(hashToken(joined.guestToken))).toBeNull();

    expect((await fetch(`${server.base}/health`)).status).toBe(200);
  });

  it("tries the load again on the next attempt instead of remembering the failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { server, store, gm } = await poisonedRoom();
    const loads = vi.spyOn(store, "loadEvents");

    await expect(server.connect(gm)).rejects.toThrow("not_found");
    await expect(server.connect(gm)).rejects.toThrow("not_found");
    expect(loads.mock.calls.filter(([roomId]) => roomId === gm.roomId)).toHaveLength(2);
  });
});
