import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AreaTemplate } from "@vtt/shared";
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
  return { gm, alice, bob };
}

const templates = (c: TestClient) => Object.values(c.state.templates) as AreaTemplate[];
const cone = { type: "template.place", shape: "cone", origin: { x: 70, y: 70 }, toward: { x: 280, y: 70 }, size: 15 } as const;

describe("shared area templates over the wire (FR-TAC-06, FR-SYNC-02, ADR 0007)", () => {
  it("shows a player's template to everyone and lets them remove it", async () => {
    const { gm, alice, bob } = await setup();

    const placed = await alice.command(cone);
    expect(placed).toMatchObject({ type: "ack" });
    const seq = (placed as { seq: number }).seq;
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(seq)));
    for (const c of [gm, alice, bob]) {
      expect(templates(c)).toHaveLength(1);
      expect(templates(c)[0]).toMatchObject({ shape: "cone", size: 15, ownerId: alice.participantId });
    }

    const id = templates(bob)[0]!.id;
    expect(await bob.command({ type: "template.remove", templateId: id })).toMatchObject({ type: "rejected", code: "forbidden" });

    const removed = await alice.command({ type: "template.remove", templateId: id });
    const removedSeq = (removed as { seq: number }).seq;
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(removedSeq)));
    for (const c of [gm, alice, bob]) expect(templates(c)).toEqual([]);
  });

  it("never sends a GM-only template to players, but keeps their seq gap-free (FR-GM-23)", async () => {
    const { gm, alice } = await setup();

    const placed = await gm.command({ ...cone, gmOnly: true });
    const seq = (placed as { seq: number }).seq;
    await Promise.all([gm, alice].map((c) => c.waitForSeq(seq)));
    expect(templates(gm)).toHaveLength(1);
    expect(templates(alice)).toEqual([]);
    expect(alice.rawLog.join(" ")).not.toContain("TemplatePlaced");

    expect(await alice.command({ ...cone, gmOnly: true })).toMatchObject({ type: "rejected", code: "forbidden" });
  });
});
