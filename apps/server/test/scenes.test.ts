import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { filterStateForViewer, tableOf } from "@vtt/shared";
import { startServer, type TestClient } from "./helpers";
let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
beforeEach(async () => { server = await startServer(); });
afterEach(async () => { clients.splice(0).forEach((client) => client.close()); await server.close(); });
async function connect(creds: Parameters<typeof server.connect>[0]) { const client = await server.connect(creds); clients.push(client); return client; }
const ok = async (promise: Promise<unknown>) => expect(await promise).toMatchObject({ type: "ack" });

describe("scene switching over real sockets", () => {
  it("autosaves both locations, filters every switch and reloads saved progress after a server restart", async () => {
    const gmCreds = await server.createRoom();
    const gm = await connect(gmCreds);
    const playerCreds = await server.join(gmCreds.inviteCode, "Alice");
    const player = await connect(playerCreds);
    await ok(gm.command({ type: "scene.rename", sceneId: "initial", name: "Secret tavern" }));
    await ok(gm.command({ type: "token.create", name: "Rogue", ownerIds: [player.participantId], position: { x: 35, y: 35 }, stats: { hp: 3, maxHp: 10, ac: null } }));
    await ok(gm.command({ type: "token.create", name: "Secret monster", hidden: true, position: { x: 315, y: 315 } }));
    const tavern = tableOf(gm.state);
    await ok(gm.command({ type: "scene.create", name: "Secret cellar" }));
    const cellarId = gm.state.activeSceneId!;
    await player.waitForSeq(gm.seq);
    expect(player.state.tokens).toEqual({});
    expect(player.state.savedScenes).toEqual({});
    expect(player.state.sceneNames).toEqual({});
    await ok(gm.command({ type: "token.create", name: "Rat", position: { x: 35, y: 35 } }));
    await ok(player.command({ type: "chat.send", text: "Moving downstairs" }));
    await gm.waitForSeq(player.seq);
    const cellar = tableOf(gm.state);
    await ok(gm.command({ type: "scene.switch", sceneId: "initial" }));
    await player.waitForSeq(gm.seq);
    expect(tableOf(gm.state)).toEqual(tavern);
    expect(player.state).toEqual(filterStateForViewer(gm.state, gm.state.participants[player.participantId]!));
    expect(gm.state.chat.at(-1)?.text).toBe("Moving downstairs");
    expect(player.rawLog.join(" ")).not.toContain("Secret");
    await ok(gm.command({ type: "scene.switch", sceneId: cellarId }));
    expect(tableOf(gm.state)).toEqual(cellar);
    const store = server.store;
    clients.splice(0).forEach((client) => client.close());
    await server.close();
    server = await startServer(store);
    const resumed = await connect(gmCreds);
    expect(tableOf(resumed.state)).toEqual(cellar);
    await ok(resumed.command({ type: "scene.switch", sceneId: "initial" }));
    expect(tableOf(resumed.state)).toEqual(tavern);
    const reconnect = await connect(playerCreds);
    expect(reconnect.rawLog.join(" ")).not.toContain("Secret");
    expect(reconnect.state.tokens).toHaveProperty(Object.keys(tavern.tokens)[0]!);
  });

  it("keeps checkpoint restores in the current scene and refuses player management", async () => {
    const creds = await server.createRoom();
    const gm = await connect(creds);
    const player = await connect(await server.join(creds.inviteCode, "Alice"));
    expect(await player.command({ type: "scene.create", name: "Forbidden" })).toMatchObject({ type: "rejected", code: "forbidden" });
    await ok(gm.command({ type: "token.create", name: "Tavern guard", position: { x: 35, y: 35 } }));
    const tavern = tableOf(gm.state);
    await ok(gm.command({ type: "scene.create", name: "Cellar" }));
    await ok(gm.command({ type: "checkpoint.create", name: "Empty cellar" }));
    await ok(gm.command({ type: "token.create", name: "Rat", position: { x: 35, y: 35 } }));
    await ok(gm.command({ type: "checkpoint.restore", checkpointId: gm.state.checkpoints[0]!.id }));
    expect(gm.state.tokens).toEqual({});
    expect(gm.state.sceneNames).toEqual({ initial: "Scene 1", [gm.state.activeSceneId!]: "Cellar" });
    await ok(gm.command({ type: "scene.switch", sceneId: "initial" }));
    expect(tableOf(gm.state)).toEqual(tavern);
  });

  it("does not restore a revoked participant's access from an inactive scene", async () => {
    const creds = await server.createRoom();
    const gm = await connect(creds);
    const playerCreds = await server.join(creds.inviteCode, "Alice");
    const player = await connect(playerCreds);
    await ok(gm.command({ type: "token.create", name: "Rogue", ownerIds: [player.participantId], position: { x: 35, y: 35 } }));
    await ok(gm.command({ type: "scene.create", name: "Cellar" }));
    await ok(gm.command({ type: "participant.revoke", participantId: player.participantId }));
    await ok(gm.command({ type: "scene.switch", sceneId: "initial" }));
    expect(gm.state.participants[player.participantId]!.revoked).toBe(true);
    await expect(server.connect(playerCreds)).rejects.toThrow();
  });
});
