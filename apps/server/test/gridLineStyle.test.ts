import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GRID, type GridSpec } from "@vtt/shared";
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

const styled: GridSpec = { ...DEFAULT_GRID, lineColor: "#ff3355", lineWidth: 4, lineOpacity: 0.8 };

describe("grid line style over the wire (grid-line-style, ADR 0005)", () => {
  it("delivers the GM's styled grid to every player, and survives a reconnect", async () => {
    const gmCreds = await server.createRoom();
    const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
    const gm = await server.connect(gmCreds);
    const alice = await server.connect(aliceCreds);
    clients.push(gm, alice);

    const res = await gm.command({ type: "scene.setGrid", grid: styled });
    expect(res).toMatchObject({ type: "ack" });
    await alice.waitForSeq(gm.seq);
    expect(alice.state.scene.grid).toEqual(styled);

    const again = await server.connect(aliceCreds);
    clients.push(again);
    expect(again.state.scene.grid).toEqual(styled);
  });

  it("rejects a player's restyle and a malformed colour, changing nothing (FR-GM-15)", async () => {
    const gmCreds = await server.createRoom();
    const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
    const gm = await server.connect(gmCreds);
    const alice = await server.connect(aliceCreds);
    clients.push(gm, alice);
    const seqBefore = gm.seq;

    expect(await alice.command({ type: "scene.setGrid", grid: styled })).toMatchObject({ type: "rejected", code: "forbidden" });
    // Fails zod at the trust boundary, but still settles the client's command request.
    gm.send({ type: "command", clientCommandId: "bad-colour", command: { type: "scene.setGrid", grid: { ...DEFAULT_GRID, lineColor: "red" } } });
    expect(await gm.waitFor((m) => m.type === "rejected" && m.clientCommandId === "bad-colour"))
      .toMatchObject({ code: "bad_request" });
    gm.send({ type: "command", clientCommandId: "bad-offset", command: {
      type: "scene.setGrid", grid: { ...DEFAULT_GRID, offsetX: DEFAULT_GRID.cellSize },
    } });
    expect(await gm.waitFor((m) => m.type === "rejected" && m.clientCommandId === "bad-offset"))
      .toMatchObject({ code: "bad_request", message: "Grid offset must be less than the cell size" });
    expect(gm.seq).toBe(seqBefore);
    expect(gm.state.scene.grid).toEqual(DEFAULT_GRID);
  });
});
