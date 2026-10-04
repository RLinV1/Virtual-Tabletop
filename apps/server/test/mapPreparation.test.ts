import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GRID, type ServerMessage, type UploadResponse } from "@vtt/shared";
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

/** 1x1 transparent PNG. The server checks the declared type; bytes just need to exist. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

describe("private map preparation (KAN-59)", () => {
  it("tells players nothing about an upload, and applies map and grid as one event", async () => {
    const gmCreds = await server.createRoom();
    const gm = await server.connect(gmCreds);
    const player = await server.connect(await server.join(gmCreds.inviteCode, "Alice"));
    clients.push(gm, player);
    const before = player.rawLog.length;
    const seqBefore = gm.seq;

    // Preparing: the GM's browser uploads the image. The room hears nothing.
    const form = new FormData();
    form.append("file", new Blob([PNG], { type: "image/png" }), "map.png");
    const res = await fetch(`${server.base}/api/uploads`, {
      method: "POST",
      headers: { authorization: `Bearer ${gmCreds.guestToken}` },
      body: form,
    });
    expect(res.status).toBe(200);
    const { url } = (await res.json()) as UploadResponse;
    await new Promise((r) => setTimeout(r, 150));
    expect(player.rawLog.length).toBe(before);

    // Apply: one command, one event, map and grid together.
    const grid = { ...DEFAULT_GRID, cellSize: 50 };
    const ack = await gm.command({ type: "scene.setMap", map: { url, width: 1400, height: 700 }, grid });
    expect(ack).toMatchObject({ type: "ack", seq: seqBefore + 1 });
    await player.waitForSeq(gm.seq);
    const events = player.rawLog.slice(before).map((raw) => JSON.parse(raw) as ServerMessage).filter((m) => m.type === "event");
    expect(events).toHaveLength(1);
    expect(player.state.scene).toMatchObject({ map: { url }, grid: { cellSize: 50 } });
  });
});
