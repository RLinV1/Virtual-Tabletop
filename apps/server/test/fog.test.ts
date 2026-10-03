import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FogRegion, Token } from "@vtt/shared";
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
  return { gm, alice };
}

const seqOf = (reply: unknown) => (reply as { seq: number }).seq;
const fog = (c: TestClient) => Object.values(c.state.fog) as FogRegion[];
const tokenNamed = (c: TestClient, name: string) => (Object.values(c.state.tokens) as Token[]).find((t) => t.name === name);
const FOG_RECT = { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 0 }, to: { x: 140, y: 140 } } } as const;

describe("manual fog of war over the wire (FR-GM-17, FR-GM-23, ADR 0016)", () => {
  it("shows fog to everyone and refuses it from a player", async () => {
    const { gm, alice } = await setup();
    const seq = seqOf(await gm.command(FOG_RECT));
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seq)));
    expect(fog(gm)).toHaveLength(1);
    expect(fog(alice)).toEqual(fog(gm));
    expect(await alice.command(FOG_RECT)).toMatchObject({ type: "rejected", code: "forbidden" });
    expect(await alice.command({ type: "fog.remove", regionId: fog(gm)[0]!.id })).toMatchObject({ type: "rejected", code: "forbidden" });
  });

  it("never sends a token under fog to a player, and reveals it when the fog is removed", async () => {
    const { gm, alice } = await setup();
    await gm.waitForSeq(seqOf(await gm.command(FOG_RECT)));
    const created = await gm.command({ type: "token.create", name: "Lurker", position: { x: 70, y: 70 } });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(created))));
    const lurker = tokenNamed(gm, "Lurker")!;
    const moved = await gm.command({ type: "token.move", tokenId: lurker.id, to: { x: 105, y: 35 } });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(moved))));

    expect(tokenNamed(alice, "Lurker")).toBeUndefined();
    expect(alice.rawLog.join(" ")).not.toContain("Lurker");
    expect(alice.rawLog.join(" ")).not.toContain(lurker.id);

    const removed = await gm.command({ type: "fog.remove", regionId: fog(gm)[0]!.id });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(removed))));
    expect(fog(alice)).toEqual([]);
    expect(tokenNamed(alice, "Lurker")).toMatchObject({ position: { x: 105, y: 35 } });
  });

  it("drops a token that walks into fog without sending where it went", async () => {
    const { gm, alice } = await setup();
    const created = await gm.command({ type: "token.create", name: "Scout", position: { x: 385, y: 385 } });
    await gm.waitForSeq(seqOf(await gm.command(FOG_RECT)));
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(created) + 1)));
    const scout = tokenNamed(gm, "Scout")!;
    expect(tokenNamed(alice, "Scout")).toBeDefined();

    gm.send({ type: "ephemeral", payload: { type: "tokenDragPreview", tokenId: scout.id, at: { x: 77, y: 66 } } });
    const moved = await gm.command({ type: "token.move", tokenId: scout.id, to: { x: 35, y: 35 } });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(moved))));
    expect(tokenNamed(alice, "Scout")).toBeUndefined();
    expect(alice.rawLog.join(" ")).not.toContain('"x":35,"y":35');
    expect(alice.rawLog.join(" ")).not.toContain('"x":77,"y":66');
  });

  it("undoes an accidental reveal (FR-REC-02)", async () => {
    const { gm, alice } = await setup();
    await gm.waitForSeq(seqOf(await gm.command(FOG_RECT)));
    const created = await gm.command({ type: "token.create", name: "Lurker", position: { x: 70, y: 70 } });
    await gm.waitForSeq(seqOf(created));
    const removed = await gm.command({ type: "fog.remove", regionId: fog(gm)[0]!.id });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(removed))));
    expect(tokenNamed(alice, "Lurker")).toBeDefined();

    const entry = gm.state.undo.at(-1)!;
    const undone = await gm.command({ type: "history.undo", commandId: entry.commandId });
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seqOf(undone))));
    expect(fog(gm)).toHaveLength(1);
    expect(fog(alice)).toEqual(fog(gm));
    expect(tokenNamed(alice, "Lurker")).toBeUndefined();
  });
});
