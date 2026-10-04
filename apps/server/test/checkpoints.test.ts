import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tableOf, type Token } from "@vtt/shared";
import { startServer, type TestClient, viewFor } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

async function connect(creds: Parameters<typeof server.connect>[0]) {
  const c = await server.connect(creds);
  clients.push(c);
  return c;
}

const named = (c: TestClient, name: string) => (Object.values(c.state.tokens) as Token[]).find((t) => t.name === name);
const ok = async (p: Promise<unknown>) => expect(await p).toMatchObject({ type: "ack" });

/** GM and two players; a map, Alice's Rogue, a hidden Orc, fog and a template, then "Start". */
async function setup() {
  const gmCreds = await server.createRoom();
  const gm = await connect(gmCreds);
  const alice = await connect(await server.join(gmCreds.inviteCode, "Alice"));
  const bob = await connect(await server.join(gmCreds.inviteCode, "Bob"));
  await ok(gm.command({ type: "scene.setMap", map: { url: "/uploads/a.png", width: 1000, height: 800 } }));
  await ok(gm.command({ type: "token.create", name: "Rogue", position: { x: 35, y: 35 }, ownerIds: [alice.participantId] }));
  await ok(gm.command({ type: "token.create", name: "Orc", position: { x: 105, y: 35 }, hidden: true }));
  await ok(gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 600, y: 600 }, to: { x: 800, y: 800 } } }));
  await ok(alice.command({ type: "template.place", shape: "circle", origin: { x: 210, y: 210 }, toward: { x: 210, y: 210 }, size: 10 }));
  await ok(gm.command({ type: "checkpoint.create", name: "Start" }));
  await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
  return { gm, alice, bob };
}

describe("checkpoints over the wire (KAN-41, FR-REC-02)", () => {
  it("restores the board for every client after mixed changes, filtered for each", async () => {
    const { gm, alice, bob } = await setup();
    const start = tableOf(gm.state);
    const orcId = named(gm, "Orc")!.id;
    const checkpointId = gm.state.checkpoints[0]!.id;

    await ok(alice.command({ type: "token.move", tokenId: named(gm, "Rogue")!.id, to: { x: 315, y: 315 } }));
    await ok(gm.command({ type: "token.setHidden", tokenId: orcId, hidden: false }));
    await ok(gm.command({ type: "token.delete", tokenId: named(gm, "Rogue")!.id }));
    await ok(gm.command({ type: "token.create", name: "Troll", position: { x: 385, y: 35 } }));
    await ok(gm.command({ type: "scene.setMap", map: { url: "/uploads/b.png", width: 2000, height: 1600 } }));
    await ok(gm.command({ type: "initiative.start", entries: [{ tokenId: orcId, score: 12 }] }));
    await ok(bob.command({ type: "chat.send", text: "the orc is out" }));
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(bob.seq)));
    const chat = gm.state.chat;

    await ok(gm.command({ type: "checkpoint.restore", checkpointId }));
    await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));

    expect(tableOf(gm.state)).toEqual(start);
    expect(gm.state.chat).toEqual(chat);
    for (const c of [alice, bob]) {
      expect(c.state).toEqual(viewFor(gm.state, c));
      expect(named(c, "Orc")).toBeUndefined(); // hidden again at the checkpoint
      expect(c.state.checkpoints).toEqual([]);
      expect(c.rawLog.join("\n")).not.toContain("Start");
    }
    // The restore event itself, with both boards in it, never reached a player.
    for (const c of [alice, bob]) expect(c.rawLog.join("\n")).not.toContain("CheckpointRestored");
  });

  it("undoes a restore, putting back the board from just before it", async () => {
    const { gm, alice, bob } = await setup();
    await ok(gm.command({ type: "token.move", tokenId: named(gm, "Rogue")!.id, to: { x: 455, y: 455 } }));
    const beforeRestore = tableOf(gm.state);
    await ok(gm.command({ type: "checkpoint.restore", checkpointId: gm.state.checkpoints[0]!.id }));
    const restore = [...gm.state.undo].reverse().find((e) => e.events[0]?.type === "CheckpointRestored")!;

    await ok(gm.command({ type: "history.undo", commandId: restore.commandId }));
    await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
    expect(tableOf(gm.state)).toEqual(beforeRestore);
    for (const c of [alice, bob]) expect(c.state).toEqual(viewFor(gm.state, c));
  });

  it("refuses players and keeps the history append-only", async () => {
    const { gm, alice } = await setup();
    const checkpointId = gm.state.checkpoints[0]!.id;
    expect(await alice.command({ type: "checkpoint.create", name: "Mine" })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(await alice.command({ type: "checkpoint.restore", checkpointId })).toMatchObject({ type: "rejected", code: "forbidden" });
    // A refused restore never reads the log.
    const loads = server.store.loadEvents.bind(server.store);
    let reads = 0;
    server.store.loadEvents = async (roomId) => { reads++; return loads(roomId); };
    expect(await alice.command({ type: "checkpoint.restore", checkpointId })).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(await gm.command({ type: "checkpoint.restore", checkpointId: "00000000-0000-4000-8000-000000000000" })).toMatchObject({ type: "rejected", code: "not_found" });
    expect(reads).toBe(0);
    server.store.loadEvents = loads;

    // A store that fails while reading the log answers the restore itself, and the room carries on.
    server.store.loadEvents = async () => { throw new Error("disk on fire"); };
    expect(await gm.command({ type: "checkpoint.restore", checkpointId })).toMatchObject({
      type: "rejected", code: "invalid", message: expect.stringContaining("Try again"),
    });
    server.store.loadEvents = loads;
    await ok(gm.command({ type: "checkpoint.create", name: "Still works" }));

    const before = await server.store.loadEvents(gm.state.roomId);
    await ok(gm.command({ type: "checkpoint.restore", checkpointId }));
    const after = await server.store.loadEvents(gm.state.roomId);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)!.event.type).toBe("CheckpointRestored");
  });
});
