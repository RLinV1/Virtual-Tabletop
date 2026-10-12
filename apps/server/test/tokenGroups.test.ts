import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandInput } from "@vtt/shared";
import { startServer, viewFor, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { clients.splice(0).forEach((c) => c.close()); await server.close(); });

async function table() {
  const owner = await server.createRoom("Mara");
  const alice = await server.join(owner.inviteCode, "Alice");
  const gm = await server.connect(owner);
  const pc = await server.connect(alice);
  clients.push(gm, pc);
  return { owner, alice, gm, pc };
}

const tokenId = (client: TestClient, name: string) => Object.values(client.state.tokens).find((t) => t.name === name)!.id;

describe("Token groups across the wire (KAN-82, FR-GM-16, FR-GM-23)", () => {
  it("never sends a player a group name, id or membership, live or on reconnect", async () => {
    const { alice, gm, pc } = await table();
    await gm.command({ type: "token.create", name: "Goblin", position: { x: 35, y: 35 } });
    await gm.command({ type: "token.create", name: "Shadow", position: { x: 175, y: 35 }, hidden: true });
    expect((await gm.command({ type: "group.create", name: "Gate guards" })).type).toBe("ack");
    const groupId = Object.keys(gm.state.groups)[0]!;
    expect((await gm.command({ type: "group.assign", groupId, tokenIds: [tokenId(gm, "Goblin"), tokenId(gm, "Shadow")] })).type).toBe("ack");
    await gm.command({ type: "group.rename", groupId, name: "Back room cultists" });
    await pc.waitForSeq(gm.seq);
    expect(gm.state.groups[groupId]?.name).toBe("Back room cultists");
    for (const secret of ["Gate guards", "Back room cultists", groupId]) expect(pc.rawLog.join("\n")).not.toContain(secret);
    expect(pc.state.groups).toEqual({});
    expect(pc.state.tokenGroups).toEqual({});
    expect(pc.state).toEqual(viewFor(gm.state, pc));

    const again = await server.connect(alice);
    clients.push(again);
    expect(again.rawLog.join("\n")).not.toContain(groupId);
    expect(again.state.groups).toEqual({});
  });

  it("rejects forged player group and duplicate commands (FR-GM-15)", async () => {
    const { gm, pc } = await table();
    await gm.command({ type: "token.create", name: "Fighter", position: { x: 35, y: 35 }, ownerIds: [pc.participantId] });
    await gm.command({ type: "group.create", name: "Party" });
    const groupId = Object.keys(gm.state.groups)[0]!;
    await pc.waitForSeq(gm.seq);
    const seq = gm.seq;
    for (const command of [
      { type: "group.create", name: "Mine" },
      { type: "group.rename", groupId, name: "Mine" },
      { type: "group.delete", groupId },
      { type: "group.assign", groupId, tokenIds: [tokenId(pc, "Fighter")] },
      { type: "token.duplicate", tokenId: tokenId(pc, "Fighter"), count: 3 },
    ] satisfies CommandInput[]) {
      expect(await pc.command(command)).toMatchObject({ type: "rejected", code: "forbidden" });
    }
    expect(gm.seq).toBe(seq);
  });

  it("converges a duplicate ×3 and its undo on every client", async () => {
    const { gm, pc } = await table();
    await gm.command({ type: "token.create", name: "Goblin", position: { x: 105, y: 105 } });
    expect((await gm.command({ type: "token.duplicate", tokenId: tokenId(gm, "Goblin"), count: 3 })).type).toBe("ack");
    await pc.waitForSeq(gm.seq);
    expect(Object.values(pc.state.tokens).map((t) => t.name).sort()).toEqual(["Goblin", "Goblin 2", "Goblin 3", "Goblin 4"]);
    expect(pc.state).toEqual(viewFor(gm.state, pc));

    const commandId = gm.state.undo.at(-1)!.commandId;
    expect((await gm.command({ type: "history.undo", commandId })).type).toBe("ack");
    await pc.waitForSeq(gm.seq);
    expect(Object.values(pc.state.tokens).map((t) => t.name)).toEqual(["Goblin"]);
    expect(pc.state).toEqual(viewFor(gm.state, pc));
  });
});
