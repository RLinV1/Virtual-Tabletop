import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ServerMessage, Token } from "@vtt/shared";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

async function setup() {
  const gmCreds = await server.createRoom();
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  clients.push(gm, alice);

  await gm.command({ type: "token.create", name: "Aria", position: { x: 35, y: 35 }, ownerIds: [alice.participantId], stats: { hp: 30, maxHp: 30, ac: 14 } });
  await gm.command({ type: "token.create", name: "Goblin", position: { x: 175, y: 35 }, stats: { hp: 15, maxHp: 15, ac: 13 } });
  await gm.command({ type: "token.create", name: "Shadow Lurker", position: { x: 315, y: 35 }, hidden: true, stats: { hp: 20, maxHp: 20, ac: 15 } });
  await alice.waitForSeq(gm.seq);
  const byName = (c: TestClient, name: string) => (Object.values(c.state.tokens) as Token[]).find((t) => t.name === name);
  return { gm, alice, aria: byName(gm, "Aria")!, goblin: byName(gm, "Goblin")!, shadow: byName(gm, "Shadow Lurker")! };
}

const seqOf = (reply: unknown) => (reply as { seq: number }).seq;
const nuke = { type: "nuke.detonate", amount: 12, origin: { x: 100, y: 100 } } as const;

describe("map nuke over the wire (FR-TAC-06, FR-TAC-07, FR-GM-15, FR-GM-23, ADR 0038)", () => {
  it("damages every token and shows the blast to everyone", async () => {
    const { gm, alice, aria, goblin, shadow } = await setup();
    const messages: ServerMessage[] = [];
    alice.onMessage((m) => messages.push(m));

    const ack = await gm.command(nuke);
    expect(ack).toMatchObject({ type: "ack" });
    await alice.waitForSeq(seqOf(ack));

    expect(gm.state.tokens[aria.id]?.stats.hp).toBe(18);
    expect(gm.state.tokens[goblin.id]?.stats.hp).toBe(3);
    expect(gm.state.tokens[shadow.id]?.stats.hp).toBe(8);
    expect(alice.state.tokens[aria.id]?.stats.hp).toBe(18);
    expect(alice.state.tokens[goblin.id]?.stats.hp).toBe(3);
    expect(messages[0]).toMatchObject({ type: "event", committed: { event: { type: "MapNuked" } } });
  });

  it("never tells a player about the hidden token", async () => {
    const { gm, alice, shadow } = await setup();
    const messages: ServerMessage[] = [];
    alice.onMessage((m) => messages.push(m));
    const ack = await gm.command(nuke);
    await alice.waitForSeq(seqOf(ack));
    expect(Object.keys(alice.state.tokens)).not.toContain(shadow.id);
    expect(JSON.stringify(messages)).not.toContain("Shadow Lurker");
  });

  it("rejects a player's nuke and forged amounts (FR-GM-15)", async () => {
    const { gm, alice, aria } = await setup();
    expect(await alice.command(nuke)).toMatchObject({ type: "rejected", code: "forbidden" });
    for (const amount of [0, -4, 2.5, 100000]) {
      expect(await gm.command({ ...nuke, amount } as never)).toMatchObject({ type: "rejected" });
    }
    expect(gm.state.tokens[aria.id]?.stats.hp).toBe(30);
  });

  it("undoes the nuke and does not replay the blast for a late joiner", async () => {
    const { gm, aria, goblin } = await setup();
    const ack = await gm.command(nuke);
    await gm.waitForSeq(seqOf(ack));
    const commandId = gm.state.undo.at(-1)!.commandId;
    const undone = await gm.command({ type: "history.undo", commandId });
    expect(undone).toMatchObject({ type: "ack" });
    await gm.waitForSeq(seqOf(undone));
    expect(gm.state.tokens[aria.id]?.stats.hp).toBe(30);
    expect(gm.state.tokens[goblin.id]?.stats.hp).toBe(15);
  });
});
