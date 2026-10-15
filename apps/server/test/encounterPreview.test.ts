import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EncounterSummary, LibraryAsset } from "@vtt/shared";
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

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const gmFetch = (cookie: string, url: string, init: { method?: string; body?: unknown } = {}) =>
  fetch(server.base + url, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", cookie },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });

describe("preview a saved encounter template (encounter-templates, FR-GM-13)", () => {
  it("returns the board with its map, hidden tokens and fog, only to its GM", async () => {
    const cookie = (await server.signUp()).cookie;
    const form = new FormData();
    form.append("kind", "map");
    form.append("name", "Cave");
    form.append("width", "256");
    form.append("height", "256");
    form.append("file", new Blob([PNG], { type: "image/png" }), "a.png");
    const map = (await (await fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie }, body: form })).json()) as LibraryAsset;

    const creds = await server.createRoom("GM", { cookie, roomName: "Prep" });
    const gm = await server.connect(creds);
    clients.push(gm);
    const ok = async (p: Promise<unknown>) => expect(await p).toMatchObject({ type: "ack" });
    await ok(gm.command({ type: "scene.setMap", map: { url: map.url, width: map.width, height: map.height, assetId: map.id } }));
    await ok(gm.command({ type: "token.create", name: "Orc", position: { x: 175, y: 105 }, hidden: true }));
    await ok(gm.command({ type: "fog.add", region: { shape: "rect", from: { x: 100, y: 100 }, to: { x: 200, y: 200 } } }));

    const saved = (await (await gmFetch(cookie, "/api/library/encounters", { method: "POST", body: { roomId: creds.roomId, name: "Ambush" } })).json()) as EncounterSummary;
    const res = await gmFetch(cookie, `/api/library/encounters/${saved.id}/preview`);
    expect(res.status).toBe(200);
    const preview = (await res.json()) as { name: string; map: { url: string; assetId: string }; tokens: { name: string; hidden: boolean }[]; fog: unknown[] };
    expect(preview).toMatchObject({ name: "Ambush", map: { url: map.url, assetId: map.id }, fog: [expect.anything()] });
    expect(preview.tokens.find((t) => t.name === "Orc")?.hidden).toBe(true);
    expect(JSON.stringify(preview)).not.toMatch(/ownerIds|ownerGmId/);

    const other = (await server.signUp()).cookie;
    expect((await gmFetch(other, `/api/library/encounters/${saved.id}/preview`)).status).toBe(404);
    expect((await gmFetch(cookie, "/api/library/encounters/not-an-id/preview")).status).toBe(404);
  });
});
