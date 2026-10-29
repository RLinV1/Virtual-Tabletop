import { afterEach, describe, expect, it } from "vitest";
import { DetectedWallsResponse, SHIPPED_MAPS, type WallDetectionStatus } from "@vtt/shared";
import type { WallJobQueue } from "../src/domain/wallDetection";
import { startServer, type TestClient } from "./helpers";

const crypt = SHIPPED_MAPS.find((m) => m.slug === "sunken-crypt")!;
const stored = crypt.walls!;

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.close();
});

const api = (token: string, path: string, init: RequestInit = {}) =>
  fetch(`${server.base}${path}`, { ...init, headers: { authorization: `Bearer ${token}` } });

/** A queue whose worker never checks in: the vision service is down. */
const downQueue = {
  add: async () => {}, putImage: async () => {}, extendImage: async () => {}, dropImage: async () => {},
  workerAlive: async () => false, remove: async () => {}, onEvent: () => {}, close: async () => {},
} satisfies WallJobQueue;

async function roomOn(map: { url: string; width: number; height: number }, queue: WallJobQueue | null = null) {
  server = await startServer(undefined, { wallQueue: queue });
  const room = await server.createRoom();
  const gm = await server.connect(room);
  const playerCreds = await server.join(room.inviteCode, "Aria");
  clients.push(gm);
  expect(await gm.command({ type: "scene.setMap", map })).toMatchObject({ type: "ack" });
  return { room, gm, playerCreds, base: `/api/rooms/${room.roomId}/wall-detection` };
}

describe("stored walls need no vision service (FR-GM-09)", () => {
  it("detects a shipped map's stored walls at once, and they reach the room only through wall.add", async () => {
    const { room, gm, base } = await roomOn({ url: crypt.url, width: crypt.width, height: crypt.height });
    const res = await api(room.guestToken, base, { method: "POST" });
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ status: "done", wallCount: stored.length });
    const q = `?map=${encodeURIComponent(crypt.url)}`;
    const status = (await (await api(room.guestToken, base + q)).json()) as WallDetectionStatus;
    expect(status.status).toBe("done");

    const detected = DetectedWallsResponse.parse(await (await api(room.guestToken, `${base}/walls${q}`)).json());
    expect(detected.walls.map(({ a, b, portal }) => ({ a, b, ...(portal ? { portal } : {}) }))).toEqual(stored);
    expect(detected.walls.some((w) => w.portal)).toBe(true);
    expect(detected.walls.every((w) => w.confidence === 1)).toBe(true);
    expect(gm.state.walls).toEqual({});

    const added = await gm.command({ type: "wall.add", expectedMapUrl: crypt.url, walls: stored.slice(0, 50).map((w) => ({ ...w })) });
    expect(added).toMatchObject({ type: "ack" });
    await gm.waitForSeq((added as { seq: number }).seq);
    expect(Object.keys(gm.state.walls)).toHaveLength(Math.min(50, stored.length));
  });

  it("applies stored walls with their doors through wall.applyDetected", async () => {
    const { room, gm, base } = await roomOn({ url: crypt.url, width: crypt.width, height: crypt.height });
    await api(room.guestToken, base, { method: "POST" });
    const applied = await gm.command({ type: "wall.applyDetected", mapUrl: crypt.url });
    expect(applied).toMatchObject({ type: "ack" });
    await gm.waitForSeq((applied as { seq: number }).seq);
    expect(Object.values(gm.state.walls).filter((w) => w.portal)).toHaveLength(stored.filter((w) => w.portal).length);
  });

  it("serves the map's own image as the preview (no builtin dir in tests: 404 is tolerated by the client)", async () => {
    const { room, base } = await roomOn({ url: crypt.url, width: crypt.width, height: crypt.height });
    await api(room.guestToken, base, { method: "POST" });
    const res = await api(room.guestToken, `${base}/preview?map=${encodeURIComponent(crypt.url)}`);
    expect([200, 404]).toContain(res.status);
  });

  it("still refuses an uploaded map, and the same URL at another size, without the vision service", async () => {
    const other = await roomOn({ url: "/uploads/mine.png", width: 700, height: 700 });
    expect((await api(other.room.guestToken, other.base, { method: "POST" })).status).toBe(503);
    await server.close();
    const resized = await roomOn({ url: crypt.url, width: crypt.width + 10, height: crypt.height });
    expect((await api(resized.room.guestToken, resized.base, { method: "POST" })).status).toBe(503);
  });

  it("keeps Detect like this on the vision service, and refuses players", async () => {
    const { room, playerCreds, base } = await roomOn({ url: crypt.url, width: crypt.width, height: crypt.height });
    const sampled = await fetch(`${server.base}${base}`, {
      method: "POST", headers: { authorization: `Bearer ${room.guestToken}`, "content-type": "application/json" },
      body: JSON.stringify({ sample: { x: 10, y: 10 } }),
    });
    expect(sampled.status).toBe(503);
    expect((await api(playerCreds.guestToken, base, { method: "POST" })).status).toBe(403);
  });
});

describe("availability is per map (FR-GM-09)", () => {
  const availability = (token: string, roomId: string) => api(token, `/api/wall-detection/availability?room=${roomId}`);

  for (const [label, queue] of [["no queue", null], ["worker down", downQueue]] as const) {
    it(`built-in map with stored walls is available, others are not (${label})`, async () => {
      const { room } = await roomOn({ url: crypt.url, width: crypt.width, height: crypt.height }, queue);
      expect(await (await availability(room.guestToken, room.roomId)).json()).toEqual({ available: true, sampleAvailable: false });
      await server.close();
      const up = await roomOn({ url: "/uploads/mine.png", width: 700, height: 700 }, queue);
      const body = (await (await availability(up.room.guestToken, up.room.roomId)).json()) as { available: boolean; reason?: string };
      expect(body.available).toBe(false);
      expect(body.reason).toBeTruthy();
    });
  }

  it("refuses a player when a room is named", async () => {
    const { room, playerCreds } = await roomOn({ url: crypt.url, width: crypt.width, height: crypt.height });
    expect((await availability(playerCreds.guestToken, room.roomId)).status).toBe(403);
  });
});
