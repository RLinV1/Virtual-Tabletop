import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GM_TOKEN_HEADER, type GmRoomSummary, type LibraryAsset, type LibraryUsageResponse } from "@vtt/shared";
import { newGuestToken, startServer, type TestClient } from "./helpers";

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

async function newGm() {
  const gmToken = newGuestToken();
  const res = await fetch(`${server.base}/api/gm/identify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gmToken }),
  });
  expect(res.status).toBe(204);
  return gmToken;
}

const gmFetch = (gmToken: string | null, url: string, init: RequestInit = {}) =>
  fetch(server.base + url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), ...(gmToken ? { [GM_TOKEN_HEADER]: gmToken } : {}) },
  });

async function upload(
  gmToken: string,
  fields: { kind: string; name: string; width?: number; height?: number },
  file: { bytes: Uint8Array; type: string; filename: string } = { bytes: PNG, type: "image/png", filename: "map.png" },
) {
  const form = new FormData();
  form.append("kind", fields.kind);
  form.append("name", fields.name);
  form.append("width", String(fields.width ?? 2048));
  form.append("height", String(fields.height ?? 1536));
  form.append("file", new Blob([file.bytes], { type: file.type }), file.filename);
  return gmFetch(gmToken, "/api/library", { method: "POST", body: form });
}

async function uploadOk(gmToken: string, fields: Parameters<typeof upload>[1], file?: Parameters<typeof upload>[2]) {
  const res = await upload(gmToken, fields, file);
  expect(res.status).toBe(201);
  return (await res.json()) as LibraryAsset;
}

const usage = async (gmToken: string, id: string) =>
  ((await (await gmFetch(gmToken, `/api/library/${id}/usage`)).json()) as LibraryUsageResponse).rooms;

describe("GM device identity (gm-home)", () => {
  it("rejects GM endpoints without a registered token", async () => {
    expect((await gmFetch(null, "/api/gm/rooms")).status).toBe(401);
    expect((await gmFetch(newGuestToken(), "/api/library")).status).toBe(401);
  });

  it("registers idempotently", async () => {
    const gmToken = await newGm();
    const again = await fetch(`${server.base}/api/gm/identify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gmToken }),
    });
    expect(again.status).toBe(204);
    expect((await gmFetch(gmToken, "/api/library")).status).toBe(200);
  });

  it("lets a stored token the server forgot re-register (gm-identity-recovery)", async () => {
    // A browser token from before a wipe: never registered with this store.
    const stored = newGuestToken();
    expect((await gmFetch(stored, "/api/library")).status).toBe(401);
    const res = await fetch(`${server.base}/api/gm/identify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gmToken: stored }),
    });
    expect(res.status).toBe(204);
    expect((await gmFetch(stored, "/api/library")).status).toBe(200);
  });

  it("keeps owned rooms when a known token is re-registered (gm-identity-recovery)", async () => {
    const gmToken = await newGm();
    await server.createRoom("GM", { gmToken, roomName: "Keep me" });
    await fetch(`${server.base}/api/gm/identify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gmToken }),
    });
    const rooms = (await (await gmFetch(gmToken, "/api/gm/rooms")).json()) as GmRoomSummary[];
    expect(rooms.map((r) => r.name)).toEqual(["Keep me"]);
  });

  it("rejects a room guest credential on library endpoints", async () => {
    const room = await server.createRoom();
    const res = await fetch(`${server.base}/api/library`, { headers: { authorization: `Bearer ${room.guestToken}` } });
    expect(res.status).toBe(401);
  });
});

describe("GM dashboard (gm-home)", () => {
  it("lists only the caller's rooms, most recently active first", async () => {
    const gmA = await newGm();
    const gmB = await newGm();
    await server.createRoom("GM", { gmToken: gmA, roomName: "Older" });
    await new Promise((r) => setTimeout(r, 5));
    await server.createRoom("GM", { gmToken: gmA, roomName: "Newer" });
    await server.createRoom("GM", { gmToken: gmB, roomName: "Not yours" });
    await server.createRoom("GM", { roomName: "Unowned" });

    const rooms = (await (await gmFetch(gmA, "/api/gm/rooms")).json()) as GmRoomSummary[];
    expect(rooms.map((r) => r.name)).toEqual(["Newer", "Older"]);
    expect(JSON.stringify(rooms)).not.toContain("Not yours");
  });
});

describe("library upload and management (asset-library)", () => {
  it("uploads a map with the default grid and a token with none", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, { kind: "map", name: "Goblin Cave" });
    expect(map).toMatchObject({ kind: "map", name: "Goblin Cave", width: 2048, height: 1536 });
    expect(map.grid?.cellSize).toBe(70);
    const token = await uploadOk(gm, { kind: "token", name: "Goblin", width: 256, height: 256 });
    expect(token.grid).toBeNull();

    const list = (await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[];
    expect(list.map((a) => a.name).sort()).toEqual(["Goblin", "Goblin Cave"]);
    expect(JSON.stringify(list)).not.toContain("objectKey");
  });

  it("never puts the name or filename in the image URL", async () => {
    const gm = await newGm();
    const a = await uploadOk(gm, { kind: "token", name: "Beholder" }, { bytes: PNG, type: "image/png", filename: "beholder.png" });
    expect(a.url.toLowerCase()).not.toContain("beholder");
  });

  it("rejects GIFs and files over 25 MB, adding nothing", async () => {
    const gm = await newGm();
    const gif = await upload(gm, { kind: "map", name: "Anim" }, { bytes: PNG, type: "image/gif", filename: "a.gif" });
    expect(gif.status).toBe(415);
    const huge = await upload(gm, { kind: "map", name: "Huge" }, {
      bytes: new Uint8Array(25 * 1024 * 1024 + 1), type: "image/png", filename: "huge.png",
    });
    expect(huge.status).toBe(413);
    expect(await (await gmFetch(gm, "/api/library")).json()).toEqual([]);
  });

  it("rejects bad metadata", async () => {
    const gm = await newGm();
    expect((await upload(gm, { kind: "monster", name: "x" })).status).toBe(400);
    expect((await upload(gm, { kind: "map", name: "x", width: 0 })).status).toBe(400);
  });

  it("renames, re-grids maps, and refuses a grid on a token", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, { kind: "map", name: "Cave" });
    const grid = { cellSize: 64, offsetX: 3, offsetY: 4, unitsPerCell: 5, unitLabel: "ft" };
    const res = await gmFetch(gm, `/api/library/${map.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Crypt", grid }),
    });
    expect(await res.json()).toMatchObject({ name: "Crypt", grid });

    const token = await uploadOk(gm, { kind: "token", name: "Goblin" });
    const bad = await gmFetch(gm, `/api/library/${token.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grid }),
    });
    expect(bad.status).toBe(400);
  });

  it("answers 404 to another GM for every per-asset route", async () => {
    const gmA = await newGm();
    const gmB = await newGm();
    const a = await uploadOk(gmA, { kind: "map", name: "Mine" });
    const json = { "content-type": "application/json" };
    expect((await gmFetch(gmB, `/api/library/${a.id}`, { method: "PATCH", headers: json, body: '{"name":"x"}' })).status).toBe(404);
    expect((await gmFetch(gmB, `/api/library/${a.id}/usage`)).status).toBe(404);
    expect((await gmFetch(gmB, `/api/library/${a.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await gmFetch(gmB, `/api/library/not-a-uuid`, { method: "DELETE" })).status).toBe(404);
    expect(await (await gmFetch(gmB, "/api/library")).json()).toEqual([]);
    expect(((await (await gmFetch(gmA, "/api/library")).json()) as LibraryAsset[])[0]?.name).toBe("Mine");
  });

  it("deletes the stored image so its URL answers 404 (board-asset-fallback)", async () => {
    const gm = await newGm();
    const a = await uploadOk(gm, { kind: "token", name: "Goblin" });
    expect((await fetch(server.base + a.url)).status).toBe(200);
    expect((await gmFetch(gm, `/api/library/${a.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await fetch(server.base + a.url)).status).toBe(404);
    expect(await (await gmFetch(gm, "/api/library")).json()).toEqual([]);
  });
});

describe("in-use tracking (asset-library: Warn before deleting an asset in use)", () => {
  async function gmInRoom(roomName: string, gmToken: string) {
    const creds = await server.createRoom("GM", { gmToken, roomName });
    const client = await server.connect(creds);
    clients.push(client);
    return { client, creds };
  }

  it("follows the room's current state: tokens (hidden included) and the map", async () => {
    const gm = await newGm();
    const tokenAsset = await uploadOk(gm, { kind: "token", name: "Goblin" });
    const mapAsset = await uploadOk(gm, { kind: "map", name: "Cave" });
    const { client } = await gmInRoom("Goblin Cave", gm);
    expect(await usage(gm, tokenAsset.id)).toEqual([]);

    const created = await client.command({
      type: "token.create", name: "Goblin", position: { x: 0, y: 0 },
      imageUrl: tokenAsset.url, assetId: tokenAsset.id, hidden: true,
    });
    expect(created.type).toBe("ack");
    expect((await usage(gm, tokenAsset.id)).map((r) => r.name)).toEqual(["Goblin Cave"]);

    await client.command({
      type: "scene.setMap",
      map: { url: mapAsset.url, width: mapAsset.width, height: mapAsset.height, assetId: mapAsset.id },
      grid: mapAsset.grid!,
    });
    expect((await usage(gm, mapAsset.id)).map((r) => r.name)).toEqual(["Goblin Cave"]);

    await client.waitForSeq((created as { seq: number }).seq);
    const tokenId = Object.keys(client.state.tokens)[0]!;
    await client.command({ type: "token.delete", tokenId });
    expect(await usage(gm, tokenAsset.id)).toEqual([]);
  });

  it("ignores references from rooms owned by another GM", async () => {
    const gmA = await newGm();
    const gmB = await newGm();
    const a = await uploadOk(gmA, { kind: "token", name: "Mine" });
    const { client } = await gmInRoom("Intruder", gmB);
    await client.command({ type: "token.create", name: "x", position: { x: 0, y: 0 }, imageUrl: a.url, assetId: a.id });
    expect(await usage(gmA, a.id)).toEqual([]);
  });

  it("never sends a player a hidden library token's image, asset id, or any library name", async () => {
    const gm = await newGm();
    const secret = await uploadOk(gm, { kind: "token", name: "Beholder Ambush" });
    const map = await uploadOk(gm, { kind: "map", name: "Secret Lair" });
    const { client, creds } = await gmInRoom("Cave", gm);
    const aliceCreds = await server.join(creds.inviteCode, "Alice");
    const alice = await server.connect(aliceCreds);
    clients.push(alice);

    await client.command({
      type: "token.create", name: "Rock", position: { x: 0, y: 0 },
      imageUrl: secret.url, assetId: secret.id, hidden: true,
    });
    const placed = await client.command({
      type: "scene.setMap",
      map: { url: map.url, width: map.width, height: map.height, assetId: map.id },
      grid: map.grid!,
    });
    await alice.waitForSeq((placed as { seq: number }).seq);

    const raw = alice.rawLog.join("\n");
    expect(raw).not.toContain(secret.id);
    expect(raw).not.toContain(secret.url);
    expect(raw).not.toContain("Beholder Ambush");
    expect(raw).not.toContain("Secret Lair");
  });

  it("converges GM and player on a library map with its grid and a visible library token", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, { kind: "map", name: "Cave" });
    const grid = { cellSize: 64, offsetX: 3, offsetY: 4, unitsPerCell: 5, unitLabel: "ft" };
    await gmFetch(gm, `/api/library/${map.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ grid }),
    });
    const token = await uploadOk(gm, { kind: "token", name: "Goblin" });
    const { client, creds } = await gmInRoom("Cave", gm);
    const alice = await server.connect(await server.join(creds.inviteCode, "Alice"));
    clients.push(alice);

    await client.command({
      type: "scene.setMap",
      map: { url: map.url, width: map.width, height: map.height, assetId: map.id },
      grid,
    });
    const created = await client.command({
      type: "token.create", name: "Goblin", position: { x: 0, y: 0 }, imageUrl: token.url, assetId: token.id,
    });
    const seq = (created as { seq: number }).seq;
    await Promise.all([client.waitForSeq(seq), alice.waitForSeq(seq)]);

    expect(alice.state.scene).toEqual(client.state.scene);
    expect(alice.state.scene.grid).toEqual(grid);
    expect(alice.state.scene.map?.assetId).toBe(map.id);
    expect(alice.state.tokens).toEqual(client.state.tokens);
  });

  it("saves a styled grid to the library and brings the style back on placement (grid-line-style)", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, { kind: "map", name: "Glacier" });
    const grid = { cellSize: 64, offsetX: 3, offsetY: 4, unitsPerCell: 5, unitLabel: "ft", lineColor: "#ffffff", lineWidth: 4, lineOpacity: 0.8 };
    const saved = await gmFetch(gm, `/api/library/${map.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ grid }),
    });
    expect(await saved.json()).toMatchObject({ grid });
    const listed = (await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[];
    const stored = listed.find((a) => a.id === map.id)!;
    expect(stored.grid).toEqual(grid);

    const { client, creds } = await gmInRoom("Glacier", gm);
    const alice = await server.connect(await server.join(creds.inviteCode, "Alice"));
    clients.push(alice);
    const placed = await client.command({
      type: "scene.setMap",
      map: { url: stored.url, width: stored.width, height: stored.height, assetId: stored.id },
      grid: stored.grid!,
    });
    await alice.waitForSeq((placed as { seq: number }).seq);
    expect(alice.state.scene.grid).toEqual(grid);
  });
});
