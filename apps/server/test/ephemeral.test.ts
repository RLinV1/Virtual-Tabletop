import { afterEach, describe, expect, it } from "vitest";
import type { EphemeralPayload, ServerMessage, Token } from "@vtt/shared";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import type { NewEvent } from "../src/store/roomStore";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>> | null = null;
const clients: TestClient[] = [];

afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.close();
  server = null;
});

async function setup(store?: MemoryRoomStore) {
  server = await startServer(store);
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  const bob = await server.connect(bobCreds);
  clients.push(gm, alice, bob);
  await gm.command({ type: "scene.setMap", map: { url: "/uploads/m.png", width: 1000, height: 800 } });
  await Promise.all([alice, bob].map((c) => c.waitForSeq(gm.seq)));
  return { gm, alice, bob };
}

const isEphemeral = (m: ServerMessage): m is Extract<ServerMessage, { type: "ephemeral" }> => m.type === "ephemeral";
const ping = (x: number): EphemeralPayload => ({ type: "ping", at: { x, y: 10 } });

/** The next ephemeral message `client` receives. A marker ping sent after a payload proves the payload was dropped. */
const nextEphemeral = (client: TestClient) => client.waitFor(isEphemeral);

async function createToken(gm: TestClient, others: TestClient[], extra: { hidden?: boolean; ownerIds?: string[] } = {}) {
  await gm.command({ type: "token.create", name: "Wolf", position: { x: 35, y: 35 }, ...extra });
  await Promise.all(others.map((c) => c.waitForSeq(gm.seq)));
  return (Object.values(gm.state.tokens) as Token[]).find((t) => t.name === "Wolf")!;
}

describe("ephemeral channel (KAN-39, FR-SYNC-03)", () => {
  it("relays a ping to everyone else in the room, not back to the sender", async () => {
    const { gm, alice, bob } = await setup();
    alice.send({ type: "ephemeral", payload: ping(100) });
    expect(await nextEphemeral(gm)).toEqual({ type: "ephemeral", from: alice.participantId, payload: ping(100) });
    expect(await nextEphemeral(bob)).toEqual({ type: "ephemeral", from: alice.participantId, payload: ping(100) });
    // Alice's next ephemeral is Bob's ping, not an echo of her own.
    bob.send({ type: "ephemeral", payload: ping(200) });
    const got = await nextEphemeral(alice);
    expect(got.from).toBe(bob.participantId);
  });

  it("takes no seq and leaves room state unchanged", async () => {
    const { gm, alice, bob } = await setup();
    const seqBefore = alice.seq;
    const stateBefore = JSON.stringify(bob.state);
    alice.send({ type: "ephemeral", payload: ping(100) });
    await nextEphemeral(bob);
    expect(JSON.stringify(bob.state)).toBe(stateBefore);
    const ack = await alice.command({ type: "dice.roll", expression: "1d20" });
    expect(ack.type === "ack" && ack.seq).toBe(seqBefore + 1);
    // A late joiner's snapshot carries nothing from it either.
    expect(JSON.stringify(gm.state)).not.toContain('"ping"');
  });

  it("never reaches another room", async () => {
    const { bob } = await setup();
    const otherGmCreds = await server!.createRoom("Other GM");
    const otherGm = await server!.connect(otherGmCreds);
    clients.push(otherGm);
    await otherGm.command({ type: "scene.setMap", map: { url: "/uploads/o.png", width: 1000, height: 800 } });
    bob.send({ type: "ephemeral", payload: ping(100) });
    await new Promise((r) => setTimeout(r, 100));
    await expect(otherGm.waitFor(isEphemeral, 200)).rejects.toThrow(/Timed out/);
  });

  it("never sends a player the drag preview of a hidden token", async () => {
    const { gm, alice, bob } = await setup();
    const wolf = await createToken(gm, [alice, bob], { hidden: true });
    gm.send({ type: "ephemeral", payload: { type: "tokenDragPreview", tokenId: wolf.id, at: { x: 50, y: 50 } } });
    gm.send({ type: "ephemeral", payload: ping(1) });
    const first = await nextEphemeral(alice);
    expect(first.payload.type).toBe("ping");
    expect(alice.rawLog.join("\n")).not.toContain(wolf.id);
  });

  it("drops a drag preview from a player who cannot move the token", async () => {
    const { gm, alice, bob } = await setup();
    const wolf = await createToken(gm, [alice, bob]);
    alice.send({ type: "ephemeral", payload: { type: "tokenDragPreview", tokenId: wolf.id, at: { x: 50, y: 50 } } });
    alice.send({ type: "ephemeral", payload: ping(1) });
    expect((await nextEphemeral(bob)).payload.type).toBe("ping");
    expect((await nextEphemeral(gm)).payload.type).toBe("ping");
  });

  it("relays a ping without waiting for a command still committing on the same connection", async () => {
    let release!: () => void;
    let holding = false;
    const gate = new Promise<void>((resolve) => (release = resolve));
    class SlowStore extends MemoryRoomStore {
      override async append(roomId: string, expectedLastSeq: number, events: NewEvent[]) {
        if (holding) await gate;
        return super.append(roomId, expectedLastSeq, events);
      }
    }
    const { alice, bob } = await setup(new SlowStore());
    holding = true;
    const order: string[] = [];
    const seqBefore = bob.seq;
    const roll = alice.command({ type: "dice.roll", expression: "1d20" });
    alice.send({ type: "ephemeral", payload: ping(100) });
    await nextEphemeral(bob);
    order.push("ping");
    // The roll is still held by the store, so nothing has been committed yet.
    expect(bob.seq).toBe(seqBefore);
    release();
    await roll;
    await bob.waitForSeq(seqBefore + 1);
    order.push("event");
    expect(order).toEqual(["ping", "event"]);
  });
});
