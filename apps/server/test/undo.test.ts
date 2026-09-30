import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LiveRoom } from "../src/domain/liveRoom";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer, type TestClient } from "./helpers";

let store: MemoryRoomStore;
let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  store = new MemoryRoomStore();
  server = await startServer(store);
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

/** The newest undoable action in the GM client's copy of the history. */
const lastUndoable = (gm: TestClient) => [...gm.state.undo].reverse().find((e) => e.undoable)!.commandId;

async function connect(creds: Parameters<typeof server.connect>[0]) {
  const c = await server.connect(creds);
  clients.push(c);
  return c;
}

/** GM and two players; Alice owns Rogue, and the GM has a hidden Orc. */
async function setup() {
  const gmCreds = await server.createRoom();
  const gm = await connect(gmCreds);
  const alice = await connect(await server.join(gmCreds.inviteCode, "Alice"));
  const bob = await connect(await server.join(gmCreds.inviteCode, "Bob"));
  await gm.command({ type: "token.create", name: "Rogue", position: { x: 100, y: 100 }, ownerIds: [alice.participantId] });
  await gm.command({ type: "token.create", name: "Orc", position: { x: 0, y: 0 }, hidden: true });
  const tokenId = (name: string) => Object.values(gm.state.tokens).find((t) => t.name === name)!.id;
  await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
  return { gm, alice, bob, gmCreds, rogue: tokenId("Rogue"), orc: tokenId("Orc") };
}

describe("undo across the wire (FR-REC-02, FR-REC-03)", () => {
  it("GM undoes a player's move and every client sees the corrected state", async () => {
    const { gm, alice, bob, rogue } = await setup();
    expect(await alice.command({ type: "token.move", tokenId: rogue, to: { x: 300, y: 100 } })).toMatchObject({ type: "ack" });
    await gm.waitForSeq(alice.seq);
    expect(gm.state.undo).toHaveLength(1);

    expect(await gm.command({ type: "history.undo", commandId: lastUndoable(gm) })).toMatchObject({ type: "ack" });
    for (const c of [gm, alice, bob]) {
      await c.waitForSeq(gm.seq);
      expect(c.state.tokens[rogue]!.position).toEqual({ x: 100, y: 100 });
    }
    // The GM client's history matches the server's; players keep none.
    expect(gm.state.undo).toEqual([]);
    expect(alice.state.undo).toEqual([]);
    expect(bob.rawLog.join("\n")).not.toContain("commandId");
  });

  it("refuses a player's undo as forbidden", async () => {
    const { alice, rogue } = await setup();
    await alice.command({ type: "token.move", tokenId: rogue, to: { x: 300, y: 100 } });
    expect(await alice.command({ type: "history.undo", commandId: "any" })).toMatchObject({ type: "rejected", code: "forbidden" });
  });

  it("appends nothing when the undo is refused", async () => {
    const { gm, rogue } = await setup();
    await gm.command({ type: "token.move", tokenId: rogue, to: { x: 300, y: 100 } });
    await gm.command({ type: "token.configure", tokenId: rogue, changes: { size: 2, position: { x: 500, y: 100 } } });
    const seq = gm.seq;
    expect(await gm.command({ type: "history.undo", commandId: lastUndoable(gm) })).toMatchObject({
      type: "rejected", code: "invalid", message: "Can't undo: Rogue has changed since.",
    });
    expect((await store.loadEvents(gm.state.roomId)).at(-1)!.seq).toBe(seq);
  });

  it("never shows players a hidden token when its move is undone", async () => {
    const { gm, bob, orc } = await setup();
    await gm.command({ type: "token.move", tokenId: orc, to: { x: 50, y: 50 } });
    await gm.command({ type: "history.undo", commandId: lastUndoable(gm) });
    await bob.waitForSeq(gm.seq);
    expect(gm.state.tokens[orc]!.position).toEqual({ x: 0, y: 0 });
    const raw = bob.rawLog.join("\n");
    expect(raw).not.toContain(orc);
    expect(raw).not.toContain("Orc");
  });

  it("keeps the undo history across a room reload", async () => {
    const { gm, rogue } = await setup();
    await gm.command({ type: "token.move", tokenId: rogue, to: { x: 300, y: 100 } });
    const room = await LiveRoom.load(gm.state.roomId, store);
    expect(await room.submit(gm.participantId, { type: "history.undo", commandId: lastUndoable(gm) })).toMatchObject({ ok: true });
    const events = await store.loadEvents(gm.state.roomId);
    expect(events.at(-1)!.event.type).toBe("ActionUndone");
    expect(events.at(-2)!.event).toMatchObject({ type: "TokenMoved", to: { x: 100, y: 100 } });
    // Both events of the undo share one command id.
    expect(events.at(-1)!.commandId).toBe(events.at(-2)!.commandId);
  });
});

describe("MemoryRoomStore command ids (ADR 0013)", () => {
  it("round-trips a batch's command id and leaves it off events appended without one", async () => {
    const memory = new MemoryRoomStore();
    await memory.createRoom("room-a", "INVITE01");
    await memory.append("room-a", 0, [{ actorId: null, event: { type: "RoomCreated", name: "Old" } }]);
    await memory.append("room-a", 1, [{ actorId: null, commandId: "cmd-1", event: { type: "RoomCreated", name: "New" } }]);
    const loaded = await memory.loadEvents("room-a");
    expect(loaded.map((e) => e.commandId)).toEqual([undefined, "cmd-1"]);
  });
});
