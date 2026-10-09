import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, type GridDetectionStatus, type LibraryAsset } from "@vtt/shared";
import type { Detector } from "../src/domain/gridDetection";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { startServer, type TestClient } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const candidate = { cellSize: 64, offsetX: 7, offsetY: 13, confidence: 0.74 };
const dimensions = { width: 768, height: 648 };

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
afterEach(async () => {
  clients.splice(0).forEach((client) => client.close());
  if (server) await server.close();
});

async function until<T>(read: () => Promise<T>, matches: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 3000;
  for (;;) {
    const value = await read();
    if (matches(value)) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for analysis: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function imageForm(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("file", new Blob([PNG], { type: "image/png" }), "sample.png");
  return form;
}

/** A signed-in GM's session cookie (ADR 0017): library routes act as the account. */
async function newGm() {
  return (await server.signUp()).cookie;
}

async function libraryUpload(cookie: string, kind: "map" | "token") {
  const res = await fetch(`${server.base}/api/library`, {
    method: "POST", headers: { cookie },
    body: imageForm({ kind, name: "Test art", width: "768", height: "648" }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as LibraryAsset;
}

async function roomUpload(token: string, purpose?: "map" | "token") {
  const fields: Record<string, string> = {};
  if (purpose) fields.purpose = purpose;
  if (purpose === "map") {
    fields.width = "768";
    fields.height = "648";
  }
  const res = await fetch(`${server.base}/api/uploads`, {
    method: "POST", headers: { authorization: `Bearer ${token}` }, body: imageForm(fields),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { url: string };
}

async function gmStatus(cookie: string, id: string) {
  const res = await fetch(`${server.base}/api/library/${id}/grid-detection`, { headers: { cookie } });
  return { status: res.status, body: (await res.json()) as GridDetectionStatus };
}

async function roomStatus(roomId: string, token: string, mapUrl = "") {
  const res = await fetch(`${server.base}/api/rooms/${roomId}/grid-detection`, {
    headers: { authorization: `Bearer ${token}`, "x-expected-map-url": mapUrl },
  });
  return { status: res.status, body: (await res.json()) as GridDetectionStatus };
}

describe("automatic map grid detection (FR-GM-03)", () => {
  const detector: Detector = async () => ({ status: "suggested", candidate });

  beforeEach(() => { server = undefined as unknown as typeof server; });

  it("analyzes a new library map once, keeps its saved grid, and never reruns on placement or token upload", async () => {
    const run = vi.fn(detector);
    server = await startServer(new MemoryRoomStore(), { detector: run });
    const gmToken = await newGm();
    const room = await server.createRoom("GM", { cookie: gmToken });
    const gm = await server.connect(room);
    clients.push(gm);
    const map = await libraryUpload(gmToken, "map");
    // Uploading establishes no grid (KAN-09); analysis only suggests one.
    expect(map.grid).toBeNull();
    expect(JSON.stringify(map)).not.toContain("detection");
    await until(() => gmStatus(gmToken, map.id), (r) => r.body.status === "suggested");
    expect(run).toHaveBeenCalledTimes(1);
    const art = await libraryUpload(gmToken, "token");
    expect((await gmStatus(gmToken, art.id)).status).toBe(404);
    const result = await gm.command({
      type: "scene.setMap", map: { url: map.url, width: map.width, height: map.height, assetId: map.id },
    });
    expect(result.type).toBe("ack");
    expect(gm.state.scene.grid).toEqual(DEFAULT_GRID);
    expect((await roomStatus(room.roomId, room.guestToken, map.url)).status).toBe(404);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("analyzes a direct room map and denies player, other room, and other GM status access", async () => {
    const run = vi.fn(detector);
    server = await startServer(new MemoryRoomStore(), { detector: run });
    const room = await server.createRoom();
    const gm = await server.connect(room);
    clients.push(gm);
    const playerCreds = await server.join(room.inviteCode, "Player");
    const player = await server.connect(playerCreds);
    clients.push(player);
    await roomUpload(room.guestToken); // Existing token callers omit purpose.
    await roomUpload(room.guestToken, "token");
    const missingSize = await fetch(`${server.base}/api/uploads`, {
      method: "POST", headers: { authorization: `Bearer ${room.guestToken}` },
      body: imageForm({ purpose: "map" }),
    });
    expect(missingSize.status).toBe(400);
    const map = await roomUpload(room.guestToken, "map");
    expect((await gm.command({ type: "scene.setMap", map: { url: map.url, ...dimensions } })).type).toBe("ack");
    const result = await until(() => roomStatus(room.roomId, room.guestToken, map.url), (r) => r.body.status === "suggested");
    expect(result.body).toMatchObject({ status: "suggested", candidate });
    expect(run).toHaveBeenCalledTimes(1);
    expect((await roomStatus(room.roomId, playerCreds.guestToken, map.url)).status).toBe(403);
    const other = await server.createRoom("Other");
    expect((await roomStatus(room.roomId, other.guestToken, map.url)).status).toBe(403);
    expect(player.rawLog.join(" ")).not.toContain("confidence");
    expect(player.rawLog.join(" ")).not.toContain("detection");
    expect(gm.state.scene.grid).toEqual(DEFAULT_GRID);
    const replacement = await roomUpload(room.guestToken, "map");
    expect((await gm.command({ type: "scene.setMap", map: { url: replacement.url, ...dimensions } })).type).toBe("ack");
    expect((await roomStatus(room.roomId, room.guestToken, map.url)).status).toBe(404);
  });

  it("reports service failure, allows one retry, and rejects a stale completion", async () => {
    const run = vi.fn<Detector>().mockRejectedValueOnce(new Error("service down"))
      .mockResolvedValue({ status: "suggested", candidate });
    server = await startServer(new MemoryRoomStore(), { detector: run });
    const gmToken = await newGm();
    await server.createRoom("GM", { cookie: gmToken });
    const map = await libraryUpload(gmToken, "map");
    await until(() => gmStatus(gmToken, map.id), (r) => r.body.status === "error");
    const retry = () => fetch(`${server.base}/api/library/${map.id}/grid-detection/retry`, {
      method: "POST", headers: { cookie: gmToken },
    });
    const responses = await Promise.all([retry(), retry()]);
    expect(responses.map((r) => r.status).sort()).toEqual([202, 409]);
    const result = await until(() => gmStatus(gmToken, map.id), (r) => r.body.status === "suggested");
    expect(result.body.attempt).toBe(2);
    expect(run).toHaveBeenCalledTimes(2);
    expect(await server.store.finishDetection({ scope: "library", id: map.id }, 1, { status: "no_grid" })).toBe(false);
    expect((await gmStatus(gmToken, map.id)).body.status).toBe("suggested");
  });

  it("retries the current direct room map only for its active GM", async () => {
    const run = vi.fn<Detector>().mockRejectedValueOnce(new Error("service down"))
      .mockResolvedValue({ status: "suggested", candidate });
    server = await startServer(new MemoryRoomStore(), { detector: run });
    const room = await server.createRoom();
    const gm = await server.connect(room);
    clients.push(gm);
    const map = await roomUpload(room.guestToken, "map");
    await gm.command({ type: "scene.setMap", map: { url: map.url, ...dimensions } });
    await until(() => roomStatus(room.roomId, room.guestToken, map.url), (r) => r.body.status === "error");
    const retryUrl = `${server.base}/api/rooms/${room.roomId}/grid-detection/retry`;
    const headers = { authorization: `Bearer ${room.guestToken}`, "x-expected-map-url": map.url };
    const first = await fetch(retryUrl, { method: "POST", headers });
    expect(first.status).toBe(202);
    expect((await first.json() as GridDetectionStatus).attempt).toBe(2);
    const resolved = await until(() => roomStatus(room.roomId, room.guestToken, map.url), (r) => r.body.status === "suggested");
    expect(resolved.body.attempt).toBe(2);
    const playerCreds = await server.join(room.inviteCode, "Player");
    expect((await fetch(retryUrl, { method: "POST", headers: {
      authorization: `Bearer ${playerCreds.guestToken}`, "x-expected-map-url": map.url,
    } })).status).toBe(403);
    expect((await fetch(retryUrl, { method: "POST", headers })).status).toBe(409);
  });

  it("keeps uploads successful if dispatch fails and removes analysis with its asset or room", async () => {
    server = await startServer(new MemoryRoomStore(), {
      dispatcher: { enqueue: async () => { throw new Error("queue down"); }, close: async () => {} },
    });
    const gmToken = await newGm();
    const room = await server.createRoom("GM", { cookie: gmToken });
    const gm = await server.connect(room);
    clients.push(gm);
    const library = await libraryUpload(gmToken, "map");
    expect((await gmStatus(gmToken, library.id)).body.status).toBe("error");
    const otherGm = await newGm();
    await server.createRoom("Other", { cookie: otherGm });
    expect((await gmStatus(otherGm, library.id)).status).toBe(404);
    expect((await fetch(`${server.base}/api/library/${library.id}/grid-detection`, {
      headers: { authorization: `Bearer ${room.guestToken}` },
    })).status).toBe(401);
    const map = await roomUpload(room.guestToken, "map");
    const key = map.url.slice("/uploads/".length);
    await gm.command({ type: "scene.setMap", map: { url: map.url, ...dimensions } });
    expect((await roomStatus(room.roomId, room.guestToken, map.url)).body.status).toBe("error");
    const removed = await fetch(`${server.base}/api/library/${library.id}`, { method: "DELETE", headers: { cookie: gmToken } });
    expect(removed.status).toBe(204);
    expect(await server.store.findDetection({ scope: "library", id: library.id })).toBeNull();
    const deleted = await fetch(`${server.base}/api/rooms/${room.roomId}`, { method: "DELETE", headers: { cookie: gmToken } });
    expect(deleted.status).toBe(204);
    expect(await server.store.findDetection({ scope: "room", roomId: room.roomId, objectKey: key })).toBeNull();
  });

  it("rejects malformed service candidates before exposing them to the GM", async () => {
    server = await startServer(new MemoryRoomStore(), {
      detector: async () => ({ status: "suggested", candidate: { ...candidate, offsetX: 64 } }),
    });
    const gmToken = await newGm();
    await server.createRoom("GM", { cookie: gmToken });
    const map = await libraryUpload(gmToken, "map");
    const result = await until(() => gmStatus(gmToken, map.id), (r) => r.body.status === "error");
    expect(result.body).toEqual({ status: "error", attempt: 1 });
  });

  it("only retries error rows and makes old attempts unable to finish the new one", async () => {
    const store = new MemoryRoomStore();
    const id = randomUUID();
    const gmId = await store.registerGm("owner");
    await store.createAsset({
      id, ownerGmId: gmId, kind: "map", objectKey: "stored.png", url: "/uploads/stored.png",
      name: "Map", width: 768, height: 648, grid: DEFAULT_GRID, createdAt: new Date().toISOString(),
      detectionStatus: "queued", detectionAttempt: 1,
    });
    const target = { scope: "library" as const, id };
    expect(await store.retryDetection(target)).toBeNull();
    expect(await store.markDetectionRunning(target, 1)).toBe(true);
    expect(await store.finishDetection(target, 1, { status: "error" })).toBe(true);
    expect((await Promise.all([store.retryDetection(target), store.retryDetection(target)])).sort()).toEqual([2, null].sort());
    expect(await store.finishDetection(target, 1, { status: "suggested", candidate })).toBe(false);
    expect(await store.markDetectionRunning(target, 2)).toBe(true);
    expect(await store.finishDetection(target, 2, { status: "no_grid" })).toBe(true);
    expect((await store.findDetection(target))?.status).toBe("no_grid");
  });

  it("recovers queued work and supersedes an interrupted running attempt", async () => {
    const store = new MemoryRoomStore();
    const id = randomUUID();
    const gmId = await store.registerGm("owner");
    await store.createAsset({
      id, ownerGmId: gmId, kind: "map", objectKey: "stored.png", url: "/uploads/stored.png",
      name: "Map", width: 768, height: 648, grid: DEFAULT_GRID, createdAt: new Date().toISOString(),
      detectionStatus: "queued", detectionAttempt: 1,
    });
    const target = { scope: "library" as const, id };
    expect(await store.recoverDetections()).toEqual([{ target, attempt: 1 }]);
    expect(await store.markDetectionRunning(target, 1)).toBe(true);
    expect(await store.recoverDetections()).toEqual([]);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 61_000);
      expect(await store.recoverDetections()).toEqual([{ target, attempt: 2 }]);
    } finally {
      vi.useRealTimers();
    }
    expect(await store.finishDetection(target, 1, { status: "suggested", candidate })).toBe(false);
    expect(await store.markDetectionRunning(target, 2)).toBe(true);
  });
});
