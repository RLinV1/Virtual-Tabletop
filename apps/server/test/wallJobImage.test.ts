import { afterEach, describe, expect, it } from "vitest";
import { MAX_PENDING_JOBS, WALL_IMAGE_KEY_PREFIX, type WallJobData, type WallJobEvent, type WallJobQueue } from "../src/domain/wallDetection";
import { startServer, type TestClient } from "./helpers";

/** 1x1 PNG: the stand-in worker never decodes it, but the server reads real bytes from storage. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const MAP = { width: 700, height: 700 };

/** Plays Redis and the worker: keeps jobs and the raw images they name, and records every call. */
class StandInQueue implements WallJobQueue {
  jobs = new Map<string, WallJobData>();
  images = new Map<string, { bytes: Uint8Array; ttl: number }>();
  puts = 0;
  extends = 0;
  drops = 0;
  private handler: (event: WallJobEvent) => void = () => {};
  async workerAlive() {
    return true;
  }
  async add(jobId: string, data: WallJobData) {
    this.jobs.set(jobId, data);
  }
  async remove() {}
  async putImage(key: string, bytes: Uint8Array, ttlSeconds: number) {
    this.puts += 1;
    this.images.set(key, { bytes, ttl: ttlSeconds });
  }
  async extendImage(key: string, ttlSeconds: number) {
    this.extends += 1;
    const image = this.images.get(key);
    if (image) image.ttl = ttlSeconds;
  }
  async dropImage(key: string) {
    this.drops += 1;
    this.images.delete(key);
  }
  onEvent(handler: (event: WallJobEvent) => void) {
    this.handler = handler;
  }
  async close() {}
  emit(event: WallJobEvent) {
    this.handler(event);
  }
}

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server?.close();
});

/** A new room whose GM uploads the map and applies it, which queues an analysis. */
async function roomWithMap(bytes: Buffer = PNG) {
  const room = await server.createRoom();
  const gm = await server.connect(room);
  clients.push(gm);
  const form = new FormData();
  form.append("purpose", "map");
  form.append("width", String(MAP.width));
  form.append("height", String(MAP.height));
  form.append("file", new Blob([bytes], { type: "image/png" }), "map.png");
  const res = await fetch(`${server.base}/api/uploads`, { method: "POST", headers: { authorization: `Bearer ${room.guestToken}` }, body: form });
  expect(res.status).toBe(200);
  const { url } = (await res.json()) as { url: string };
  expect(await gm.command({ type: "scene.setMap", map: { url, ...MAP } })).toMatchObject({ type: "ack" });
  return { room, gm };
}

const detect = (token: string, roomId: string) =>
  fetch(`${server.base}/api/rooms/${roomId}/wall-detection`, { method: "POST", headers: { authorization: `Bearer ${token}` } });

describe("wall detection keeps map images out of the job (wall-job-transport)", () => {
  it("queues a key, not the bytes, and stores the raw image once with an expiry", async () => {
    const queue = new StandInQueue();
    server = await startServer(undefined, { wallQueue: queue });
    await roomWithMap();
    const [data] = [...queue.jobs.values()];
    expect(JSON.stringify(data)).not.toContain(PNG.toString("base64"));
    expect(data!.imageKey).toMatch(new RegExp(`^${WALL_IMAGE_KEY_PREFIX}[0-9a-f]{64}$`));
    const stored = queue.images.get(data!.imageKey)!;
    expect(Buffer.from(stored.bytes).equals(PNG)).toBe(true);
    // Longer than the ten-minute job timeout, and finite.
    expect(stored.ttl).toBeGreaterThan(600);
    expect(stored.ttl).toBeLessThan(3600);
  });

  it("deletes the image when its only job is done", async () => {
    const queue = new StandInQueue();
    server = await startServer(undefined, { wallQueue: queue });
    const { gm } = await roomWithMap();
    const [jobId] = [...queue.jobs.keys()];
    expect(queue.images.size).toBe(1);
    queue.emit({ jobId: jobId!, kind: "failed", reason: "no walls" });
    await gm.waitFor((m) => m.type === "wallDetection" && m.status.status === "failed");
    expect(queue.images.size).toBe(0);
    expect(queue.drops).toBe(1);
  });

  it("shares one stored image between jobs with the same bytes, and deletes it after the last", async () => {
    const queue = new StandInQueue();
    server = await startServer(undefined, { wallQueue: queue });
    const a = await roomWithMap();
    const b = await roomWithMap();
    const [first, second] = [...queue.jobs.keys()];
    expect(queue.jobs.size).toBe(2);
    expect(queue.images.size).toBe(1);
    expect(queue.puts).toBe(1);
    expect(queue.extends).toBe(1);

    queue.emit({ jobId: first!, kind: "failed", reason: "x" });
    await a.gm.waitFor((m) => m.type === "wallDetection" && m.status.status === "failed");
    expect(queue.images.size).toBe(1);
    queue.emit({ jobId: second!, kind: "failed", reason: "x" });
    await b.gm.waitFor((m) => m.type === "wallDetection" && m.status.status === "failed");
    expect(queue.images.size).toBe(0);
    expect(queue.drops).toBe(1);
  });

  it("stores different images separately", async () => {
    const queue = new StandInQueue();
    server = await startServer(undefined, { wallQueue: queue });
    await roomWithMap();
    await roomWithMap(Buffer.concat([PNG, Buffer.from([0])]));
    expect(queue.images.size).toBe(2);
  });

  it("refuses an analysis beyond the server-wide limit and stores nothing for it", async () => {
    const queue = new StandInQueue();
    server = await startServer(undefined, { wallQueue: queue });
    for (let i = 0; i < MAX_PENDING_JOBS; i += 1) await roomWithMap();
    expect(queue.jobs.size).toBe(MAX_PENDING_JOBS);

    const extra = await roomWithMap(Buffer.concat([PNG, Buffer.from([1])]));
    // The upload's own best-effort analysis was skipped, and asking for one is refused.
    expect(queue.jobs.size).toBe(MAX_PENDING_JOBS);
    expect(queue.images.size).toBe(1);
    const refused = await detect(extra.room.guestToken, extra.room.roomId);
    expect(refused.status).toBe(503);
    expect(((await refused.json()) as { error: string }).error).toMatch(/busy/i);
    expect(queue.images.size).toBe(1);
  });

  it("accepts a new analysis once a pending one finishes", async () => {
    const queue = new StandInQueue();
    server = await startServer(undefined, { wallQueue: queue });
    const rooms = [];
    for (let i = 0; i < MAX_PENDING_JOBS; i += 1) rooms.push(await roomWithMap());
    const extra = await roomWithMap();
    expect((await detect(extra.room.guestToken, extra.room.roomId)).status).toBe(503);

    queue.emit({ jobId: [...queue.jobs.keys()][0]!, kind: "failed", reason: "x" });
    await rooms[0]!.gm.waitFor((m) => m.type === "wallDetection" && m.status.status === "failed");
    expect((await detect(extra.room.guestToken, extra.room.roomId)).status).toBe(202);
  });
});
