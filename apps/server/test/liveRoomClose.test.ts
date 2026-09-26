import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Command } from "@vtt/shared";
import { LiveRoom } from "../src/domain/liveRoom";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

/** Closing a room ahead of deleting it (KAN-72, ADR 0009), without the HTTP race around it. */
describe("LiveRoom.close (KAN-72)", () => {
  /** Parsed like the socket does, so the schema's defaults are filled in. */
  const createToken = (name: string) => Command.parse({ type: "token.create", name, position: { x: 0, y: 0 } });

  const gmRoom = async () => {
    const store = new MemoryRoomStore();
    const roomId = randomUUID();
    const gmId = randomUUID();
    await store.createRoom(roomId, randomUUID().slice(0, 10));
    const room = await LiveRoom.load(roomId, store);
    await room.appendSystem(gmId, [
      { type: "RoomCreated", name: "Crypt" },
      { type: "ParticipantJoined", participant: { id: gmId, role: "gm", displayName: "GM" } },
    ]);
    return { store, roomId, gmId, room };
  };

  it("refuses a command queued behind the close and commits nothing after it", async () => {
    const { store, roomId, gmId, room } = await gmRoom();
    const before = (await store.loadEvents(roomId)).length;

    const closing = room.close("deleted");
    const late = room.submit(gmId, createToken("Late"));
    await closing;

    expect(await late).toMatchObject({ ok: false, code: "not_found" });
    expect(room.closed).toBe(true);
    expect(await store.loadEvents(roomId)).toHaveLength(before);
  });

  it("lets a command already queued ahead of the close commit first", async () => {
    const { store, roomId, gmId, room } = await gmRoom();
    const before = (await store.loadEvents(roomId)).length;

    const early = room.submit(gmId, createToken("Early"));
    await room.close("deleted");

    expect(await early).toMatchObject({ ok: true });
    expect(await store.loadEvents(roomId)).toHaveLength(before + 1);
  });

  it("refuses a join queued behind the close", async () => {
    const { room } = await gmRoom();
    const closing = room.close("deleted");
    const join = room.join({ id: randomUUID(), role: "player", displayName: "Late" });
    await closing;
    expect(await join).toMatchObject({ ok: false, code: "not_found" });
  });
});
