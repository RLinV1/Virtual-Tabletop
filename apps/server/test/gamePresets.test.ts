import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CreateRoomResponse, MyRoomsResponse } from "@vtt/shared";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await server.close(); });

/** Creates a room as a fresh account, with or without a preset. */
async function createRoom(preset?: string) {
  const account = await server.signUp();
  const guestToken = server.newGuestToken();
  const res = await account.request("POST", "/api/rooms", { roomName: "Keep", displayName: "Mara", guestToken, ...(preset && { preset }) });
  return { res, account, guestToken };
}

describe("Game presets across the wire (KAN-63)", () => {
  it("saves a Free Mode room's preset and grid units, and keeps them after a restart", async () => {
    const { res, account, guestToken } = await createRoom("free");
    expect(res.status).toBe(200);
    const room = (await res.json()) as CreateRoomResponse;
    const gm = await server.connect({ roomId: room.roomId, guestToken });
    clients.push(gm);
    expect(gm.state.preset).toBe("free");
    expect(gm.state.scene.grid).toMatchObject({ unitsPerCell: 1, unitLabel: "sq" });

    const mine = await account.json<MyRoomsResponse>("GET", "/api/me/rooms");
    expect(mine.hosting.find((r) => r.id === room.roomId)?.preset).toBe("free");

    // A second server on the same data: the room reloads from its log.
    const again = await startServer(server.store);
    try {
      const fresh = await again.connect({ roomId: room.roomId, guestToken });
      expect(fresh.state.preset).toBe("free");
      fresh.close();
    } finally {
      await again.close();
    }
  });

  it("makes a room without a preset Dungeons & Dragons, with today's grid and no extra events", async () => {
    const { res, guestToken } = await createRoom();
    const room = (await res.json()) as CreateRoomResponse;
    const gm = await server.connect({ roomId: room.roomId, guestToken });
    clients.push(gm);
    expect(gm.state.preset).toBe("dnd5e");
    expect(gm.state.scene.grid).toMatchObject({ unitsPerCell: 5, unitLabel: "ft" });
    expect((await server.store.loadEvents(room.roomId)).map((e) => e.event.type)).toEqual(["RoomCreated", "ParticipantJoined"]);
  });

  it("rejects an unknown preset and creates nothing", async () => {
    const { res, account } = await createRoom("chess");
    expect(res.status).toBe(400);
    expect((await account.json<MyRoomsResponse>("GET", "/api/me/rooms")).hosting).toEqual([]);
  });

  it("rejects a forged attack roll and condition in a Free Mode room", async () => {
    const { res, guestToken } = await createRoom("free");
    const room = (await res.json()) as CreateRoomResponse;
    const gm = await server.connect({ roomId: room.roomId, guestToken });
    clients.push(gm);
    await gm.command({ type: "token.create", name: "A", position: { x: 35, y: 35 } });
    await gm.command({ type: "token.create", name: "B", position: { x: 175, y: 35 } });
    const [a, b] = Object.values(gm.state.tokens).map((t) => t.id);
    const seq = gm.seq;
    expect(await gm.command({ type: "dice.roll", expression: "1d20", attack: { actorTokenId: a!, targetTokenId: b! } }))
      .toMatchObject({ type: "rejected", code: "invalid" });
    expect(await gm.command({ type: "token.setConditions", tokenId: a!, conditions: ["poisoned"] }))
      .toMatchObject({ type: "rejected", code: "invalid" });
    expect(gm.seq).toBe(seq);
  });
});
