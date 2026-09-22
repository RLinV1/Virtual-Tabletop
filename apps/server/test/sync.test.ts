import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Token } from "@vtt/shared";
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
  const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  const bob = await server.connect(bobCreds);
  clients.push(gm, alice, bob);
  return { gm, alice, bob, gmCreds, aliceCreds, bobCreds };
}

const tokens = (c: TestClient) => Object.values(c.state.tokens) as Token[];

describe("committed channel", () => {
  it("converges all clients on the same state after an owner moves a token (FR-SYNC-01/02)", async () => {
    const { gm, alice, bob } = await setup();

    const created = await gm.command({
      type: "token.create",
      name: "Fighter",
      position: { x: 35, y: 35 },
      ownerIds: [alice.participantId],
    });
    expect(created.type).toBe("ack");

    await alice.waitForSeq(gm.seq);
    const tokenId = tokens(alice)[0]!.id;
    const moved = await alice.command({ type: "token.move", tokenId, to: { x: 105, y: 35 } });
    expect(moved).toMatchObject({ type: "ack" });

    const finalSeq = (moved as { seq: number }).seq;
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(finalSeq)));
    for (const c of [gm, alice, bob]) {
      expect(c.state.tokens[tokenId]!.position).toEqual({ x: 105, y: 35 });
      expect(c.state).toEqual(gm.state);
    }
  });

  it("rejects moving a token you don't own and changes nothing (FR-GM-15)", async () => {
    const { gm, alice, bob } = await setup();
    await gm.command({ type: "token.create", name: "Fighter", position: { x: 0, y: 0 }, ownerIds: [alice.participantId] });
    await bob.waitForSeq(gm.seq);
    const seqBefore = gm.seq;

    const res = await bob.command({ type: "token.move", tokenId: tokens(bob)[0]!.id, to: { x: 999, y: 999 } });
    expect(res).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(gm.seq).toBe(seqBefore);
  });

  it("assigns gap-free, strictly increasing seqs to concurrent commands (FR-SYNC-04)", async () => {
    const { gm, alice, bob } = await setup();
    await gm.command({ type: "token.create", name: "A", position: { x: 0, y: 0 }, ownerIds: [alice.participantId] });
    await gm.command({ type: "token.create", name: "B", position: { x: 0, y: 0 }, ownerIds: [bob.participantId] });
    await Promise.all([alice.waitForSeq(gm.seq), bob.waitForSeq(gm.seq)]);
    const a = tokens(alice).find((t) => t.name === "A")!;
    const b = tokens(bob).find((t) => t.name === "B")!;

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        i % 2
          ? alice.command({ type: "token.move", tokenId: a.id, to: { x: i, y: i } })
          : bob.command({ type: "token.move", tokenId: b.id, to: { x: i, y: i } }),
      ),
    );
    const seqs = results.map((r) => (r as { seq: number }).seq).sort((x, y) => x - y);
    expect(new Set(seqs).size).toBe(20);
    expect(seqs.at(-1)! - seqs[0]!).toBe(19);

    const last = seqs.at(-1)!;
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(last)));
    expect(alice.state).toEqual(gm.state);
    expect(bob.state).toEqual(gm.state);
  });
});

describe("visibility (FR-GM-16, FR-GM-23)", () => {
  it("never sends hidden tokens to players, and resyncs them on reveal", async () => {
    const { gm, alice } = await setup();
    const res = await gm.command({ type: "token.create", name: "Secret Ogre", position: { x: 0, y: 0 }, hidden: true });
    expect(res.type).toBe("ack");
    await alice.waitForSeq(gm.seq);

    expect(tokens(alice)).toHaveLength(0);
    expect(alice.rawLog.some((raw) => raw.includes("Secret Ogre"))).toBe(false);

    const ogre = tokens(gm)[0]!;
    await gm.command({ type: "token.setHidden", tokenId: ogre.id, hidden: false });
    await alice.waitFor((m) => m.type === "welcome");
    expect(tokens(alice).map((t) => t.name)).toEqual(["Secret Ogre"]);
  });
});

describe("reconnect (FR-PL-02, FR-PL-05, FR-PL-06)", () => {
  it("rebinds the same identity and ownership and catches up on missed events", async () => {
    const { gm, alice, aliceCreds } = await setup();
    await gm.command({ type: "token.create", name: "Fighter", position: { x: 0, y: 0 }, ownerIds: [alice.participantId] });
    const originalId = alice.participantId;
    alice.close();

    // Things happen while Alice is offline.
    const tokenId = tokens(gm)[0]!.id;
    await gm.command({ type: "token.move", tokenId, to: { x: 70, y: 70 } });

    const again = await server.connect(aliceCreds);
    clients.push(again);
    expect(again.participantId).toBe(originalId);
    expect(again.seq).toBe(gm.seq);
    expect(again.state.tokens[tokenId]!.position).toEqual({ x: 70, y: 70 });
    expect(await again.command({ type: "token.move", tokenId, to: { x: 0, y: 0 } })).toMatchObject({ type: "ack" });
  });

  it("keeps the GM as GM after a reconnect, even if players joined meanwhile", async () => {
    const gmCreds = await server.createRoom();
    const gm = await server.connect(gmCreds);
    gm.close();

    await server.join(gmCreds.inviteCode, "Alice");
    await server.join(gmCreds.inviteCode, "Bob");

    const again = await server.connect(gmCreds);
    clients.push(again);
    expect(again.participantId).toBe(gmCreds.participantId);
    expect(again.state.participants[again.participantId]!.role).toBe("gm");
    expect(await again.command({ type: "token.create", name: "Ogre", position: { x: 0, y: 0 } })).toMatchObject({
      type: "ack",
    });
  });

  it("refuses a handshake with a bad guest token (FR-GM-15)", async () => {
    const { gmCreds } = await setup();
    await expect(
      server.connect({ ...gmCreds, guestToken: server.newGuestToken() }),
    ).rejects.toThrow(/unauthorized/);
  });
});

describe("tactical panels (FR-GM-21, FR-GM-22, FR-TAC-07)", () => {
  it("never sends a GM-only roll to a player, over the real wire (FR-GM-22)", async () => {
    const { gm, alice } = await setup();

    const rolled = await gm.command({ type: "dice.roll", expression: "1d20+7", visibility: "gm" });
    expect(rolled.type).toBe("ack");
    await alice.waitForSeq(gm.seq);

    expect(gm.state.rolls).toHaveLength(1);
    expect(alice.state.rolls).toHaveLength(0);

    // The strongest form of the assertion: the result never appeared in any byte Alice got.
    const secret = String(gm.state.rolls[0]!.total);
    const dice = String(gm.state.rolls[0]!.dice[0]);
    const seen = alice.rawLog.join("");
    expect(seen).not.toContain(`"total":${secret}`);
    expect(seen).not.toContain(`"dice":[${dice}]`);
  });

  it("shares a public roll with everyone, with identical results (FR-TAC-09)", async () => {
    const { gm, alice, bob } = await setup();

    await alice.command({ type: "dice.roll", expression: "2d6+3" });
    await gm.waitForSeq(alice.seq);
    await bob.waitForSeq(alice.seq);

    expect(alice.state.rolls).toHaveLength(1);
    // Everyone sees the server's roll, not their own — convergence applies to dice too.
    expect(bob.state.rolls).toEqual(alice.state.rolls);
    expect(gm.state.rolls).toEqual(alice.state.rolls);
    expect(alice.state.rolls[0]!.expression).toBe("2d6+3");
  });

  it("keeps hidden tokens out of the turn order a player receives (FR-GM-21)", async () => {
    const { gm, alice } = await setup();

    const open = await gm.command({
      type: "token.create", name: "Guard", position: { x: 35, y: 35 }, ownerIds: [],
    });
    const secret = await gm.command({
      type: "token.create", name: "Ambusher", position: { x: 105, y: 35 }, ownerIds: [], hidden: true,
    });
    expect(open.type).toBe("ack");
    expect(secret.type).toBe("ack");
    await alice.waitForSeq(gm.seq);

    const ids = Object.keys(gm.state.tokens);
    await gm.command({
      type: "initiative.start",
      entries: ids.map((tokenId, i) => ({ tokenId, score: 20 - i })),
    });
    await alice.waitForSeq(gm.seq);

    expect(gm.state.initiative!.order).toHaveLength(2);
    expect(alice.state.initiative!.order).toHaveLength(1);
    expect(alice.rawLog.join("")).not.toContain("Ambusher");
  });

  it("lets an owner set their token's stats but refuses a stranger (FR-TAC-07)", async () => {
    const { gm, alice, bob } = await setup();

    const created = await gm.command({
      type: "token.create", name: "Rogue", position: { x: 35, y: 35 }, ownerIds: [alice.participantId],
    });
    expect(created.type).toBe("ack");
    await alice.waitForSeq(gm.seq);
    const tokenId = Object.keys(alice.state.tokens)[0]!;

    const mine = await alice.command({
      type: "token.setStats", tokenId, stats: { hp: 12, maxHp: 20, ac: 15 },
    });
    expect(mine.type).toBe("ack");

    const theirs = await bob.command({
      type: "token.setStats", tokenId, stats: { hp: 1, maxHp: 20, ac: 15 },
    });
    expect(theirs).toMatchObject({ type: "rejected", code: "forbidden" });

    await bob.waitForSeq(alice.seq);
    expect(bob.state.tokens[tokenId]!.stats).toEqual({ hp: 12, maxHp: 20, ac: 15 });
  });
});
