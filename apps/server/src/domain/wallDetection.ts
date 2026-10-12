import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Queue, QueueEvents } from "bullmq";
import type { Redis } from "ioredis";
import {
  WALL_DETECTION_QUEUE,
  WallDetectionResult,
  wallsFitMap,
  type DetectedWall,
  type MapImage,
  type WallDetectionRequest,
  type WallDetectionAvailability,
  type WallDetectionStatus,
  type WallStyle,
} from "@vtt/shared";
import type { AssetStore } from "../store/assetStore";

/**
 * Automatic wall detection (FR-GM-11, ADR 0029). The app server produces a BullMQ job; the Python
 * worker in `services/vision` consumes it; queue events tell this server when it is done. Results
 * are suggestions kept in this process for the room's GM: nothing here touches room state, which
 * changes only when the GM's `wall.applyDetected` goes through `decide`.
 */

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** Most results kept at once; the oldest room's goes first. */
const MAX_RESULTS = 200;
/** A job with no answer by then is reported failed, so a missing worker never leaves the GM waiting forever. */
const JOB_TIMEOUT_MS = 10 * 60_000;
/** Prefix of an image's Redis key; must match IMAGE_KEY_PREFIX in wall_worker.py. */
export const WALL_IMAGE_KEY_PREFIX = "vtt:wall-image:";
/** An image outlives its longest job by a minute, and no longer: Redis removes it if nobody does. */
const IMAGE_TTL_SECONDS = JOB_TIMEOUT_MS / 1000 + 60;
/**
 * Most analyses queued or running at once, server-wide. Each holds one map image in Redis (up to
 * 25 MB), so this bounds that memory; maps with the same bytes share one image.
 */
export const MAX_PENDING_JOBS = 4;

/**
 * What the app server puts on the queue. The bytes are read from its own storage or from the maps
 * that ship with the app, never from a caller's URL. They do not travel in the job: they sit in
 * one raw Redis key with an expiry, and the job names it (wall-job-transport).
 */
export interface WallJobData {
  /** `vtt:wall-image:<sha256 hex of the bytes>`: where the worker reads the image. */
  imageKey: string;
  width: number;
  height: number;
  /** The room grid's cell size in image pixels, so the worker judges walls against the squares. */
  cellSize: number;
  /** A point on a wall the GM clicked, in image pixels: detect walls of its colour (wall-editing). */
  sample?: { x: number; y: number };
  /** With a sample: how far a colour may differ from it, in Lab units (wall-editing). */
  tolerance?: number;
  /** Share of a run's edge that must follow an outline. */
  strictness?: number;
  /** Shortest wall kept, in grid cells. */
  minLength?: number;
  /** Only look for light stone ("bright"), dark ink ("dark"), or inked outlines ("outlined"). */
  style?: WallStyle;
}

/** A queue event about one job, as BullMQ's `QueueEvents` reports it. */
export type WallJobEvent =
  | { jobId: string; kind: "active" }
  | { jobId: string; kind: "completed"; returnvalue: unknown }
  | { jobId: string; kind: "failed"; reason: string };

/** The transport: BullMQ in production, a stand-in in tests (no Redis or Python in CI). */
export interface WallJobQueue {
  add(jobId: string, data: WallJobData): Promise<void>;
  /** Stores the image bytes under `key`, to expire after `ttlSeconds`. */
  putImage(key: string, bytes: Uint8Array, ttlSeconds: number): Promise<void>;
  /** Pushes an already stored image's expiry out to `ttlSeconds` from now. */
  extendImage(key: string, ttlSeconds: number): Promise<void>;
  /** Deletes a stored image; a missing key is fine. */
  dropImage(key: string): Promise<void>;
  /** Whether a vision worker has checked in recently (its heartbeat key, map-editor D4). */
  workerAlive(): Promise<boolean>;
  remove(jobId: string): Promise<void>;
  onEvent(handler: (event: WallJobEvent) => void): void;
  close(): Promise<void>;
}

/** Tells the room's GM that an analysis changed state (a socket notice, not room data). */
export type WallNotifier = (roomId: string, mapUrl: string, status: WallDetectionStatus) => void;

interface Entry {
  roomId: string;
  mapUrl: string;
  map: { width: number; height: number };
  jobId: string;
  /** The stored image this job holds a reference to, until it is done. */
  imageKey: string | null;
  status: WallDetectionStatus;
  result: WallDetectionResult | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export type StartResult = "queued" | "busy" | "overloaded" | "unavailable" | "unreadable";

/** Key the Python worker refreshes while it runs; must match HEARTBEAT_KEY in wall_worker.py. */
export const WALL_WORKER_HEARTBEAT = "vtt:wall-worker:heartbeat";
/** How long an availability answer is reused. */
const AVAILABILITY_TTL_MS = 10_000;

/** The object key behind a map this server stored (`/uploads/<key>`), or null for any other address. */
export function uploadKey(url: string): string | null {
  const match = /^\/uploads\/([A-Za-z0-9._-]+)$/.exec(url);
  return match ? match[1]! : null;
}

/** The file behind a map that ships with the web app (`/img/<name>`), or null for any other address. */
export function builtinImageName(url: string): string | null {
  const match = /^\/img\/([a-z0-9-]+\.(?:webp|png|jpe?g))$/.exec(url);
  return match ? match[1]! : null;
}

export class WallDetections {
  private entries = new Map<string, Entry>();
  private byJob = new Map<string, Entry>();
  /** How many live jobs use each stored image; the image is deleted when the last one is done. */
  private imageRefs = new Map<string, number>();
  private attempts = 0;

  constructor(
    private assets: AssetStore,
    private queue: WallJobQueue | null,
    private notify: WallNotifier,
    /** Where the web app's built-in maps live (`apps/web/public/img`); null when this server can't see them. */
    private builtinDir: string | null = null,
  ) {
    queue?.onEvent((event) => this.onEvent(event));
  }

  /** False without Redis: the routes answer 503 and uploads skip detection. */
  get available() {
    return this.queue !== null;
  }

  private availabilityCache: { at: number; value: WallDetectionAvailability } | null = null;

  /** Whether detection can run now: a queue, and a worker that has checked in (map-editor D4). */
  async availability(now = Date.now()): Promise<WallDetectionAvailability> {
    if (!this.queue) return { available: false, reason: "Wall detection isn't set up on this server." };
    if (this.availabilityCache && now - this.availabilityCache.at < AVAILABILITY_TTL_MS) return this.availabilityCache.value;
    const alive = await this.queue.workerAlive().catch(() => false);
    const value: WallDetectionAvailability = alive
      ? { available: true }
      : { available: false, reason: "The wall detection service isn't running." };
    this.availabilityCache = { at: now, value };
    return value;
  }

  /** Queues an analysis of this room's map. Refuses while one for the same map is still running. */
  async start(
    roomId: string,
    map: Pick<MapImage, "url" | "width" | "height">,
    cellSize: number,
    request: WallDetectionRequest = {},
  ): Promise<StartResult> {
    if (!this.queue) return "unavailable";
    if (!uploadKey(map.url) && !builtinImageName(map.url)) return "unreadable";
    const existing = this.entries.get(entryKey(roomId, map.url));
    if (existing && (existing.status.status === "queued" || existing.status.status === "running")) return "busy";
    if (this.pending() >= MAX_PENDING_JOBS) return "overloaded";
    const bytes = await this.readMap(map.url);
    if (!bytes) return "unreadable";
    // The read above can take a while: check again before committing an image to Redis.
    if (this.pending() >= MAX_PENDING_JOBS) return "overloaded";
    const hash = createHash("sha1").update(map.url).digest("hex").slice(0, 16);
    const jobId = `walls-${roomId}-${hash}-${++this.attempts}`;
    const imageKey = WALL_IMAGE_KEY_PREFIX + createHash("sha256").update(bytes).digest("hex");
    const entry: Entry = {
      roomId, mapUrl: map.url, map: { width: map.width, height: map.height }, jobId, imageKey,
      status: { status: "queued" }, result: null, timer: null,
    };
    this.replace(entry);
    try {
      await this.holdImage(imageKey, bytes);
      await this.queue.add(jobId, {
        imageKey,
        width: map.width,
        height: map.height,
        cellSize: Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 0,
        ...request,
      });
    } catch {
      this.finish(entry, { status: "failed", message: "Wall detection is unavailable right now." }, null);
      return "unavailable";
    }
    entry.timer = setTimeout(() => {
      this.finish(entry, { status: "failed", message: "The vision service didn't answer in time." }, null);
      void this.queue?.remove(entry.jobId).catch(() => {});
    }, JOB_TIMEOUT_MS);
    entry.timer.unref?.();
    this.notify(roomId, map.url, entry.status);
    return "queued";
  }

  /** Analyses queued or running now, across every room. */
  private pending() {
    let count = 0;
    for (const entry of this.byJob.values()) {
      if (entry.status.status === "queued" || entry.status.status === "running") count += 1;
    }
    return count;
  }

  /**
   * Takes a reference to the image under `key`. The first reference stores the bytes; later ones
   * (the same map again, or in another room) only push the expiry out, so one copy serves them all.
   */
  private async holdImage(key: string, bytes: Uint8Array) {
    const held = this.imageRefs.get(key) ?? 0;
    this.imageRefs.set(key, held + 1);
    if (held > 0) return this.queue!.extendImage(key, IMAGE_TTL_SECONDS).catch(() => {});
    await this.queue!.putImage(key, bytes, IMAGE_TTL_SECONDS);
  }

  /** Gives up an entry's reference; the last one out deletes the image. Safe to call twice. */
  private releaseImage(entry: Entry) {
    const key = entry.imageKey;
    if (!key) return;
    entry.imageKey = null;
    const left = (this.imageRefs.get(key) ?? 1) - 1;
    if (left > 0) return void this.imageRefs.set(key, left);
    this.imageRefs.delete(key);
    void this.queue?.dropImage(key).catch(() => {});
  }

  /** The map's bytes: an upload from storage, or a built-in map from the web app's files. */
  private async readMap(url: string): Promise<Uint8Array | null> {
    const key = uploadKey(url);
    if (key) return this.assets.readPrivate(key, MAX_IMAGE_BYTES);
    const name = builtinImageName(url);
    if (!name || !this.builtinDir) return null;
    const filename = path.join(this.builtinDir, name);
    try {
      if ((await stat(filename)).size > MAX_IMAGE_BYTES) return null;
      return await readFile(filename);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  /** The latest analysis of a map this room asked for, or null. */
  status(roomId: string, mapUrl: string): WallDetectionStatus | null {
    return this.entries.get(entryKey(roomId, mapUrl))?.status ?? null;
  }

  /** The validated result, for the preview and for `wall.applyDetected`. */
  result(roomId: string, mapUrl: string): WallDetectionResult | null {
    return this.entries.get(entryKey(roomId, mapUrl))?.result ?? null;
  }

  /** The walls `decide` may commit for this room's map (ADR 0029). */
  detectedWalls(roomId: string, mapUrl: string): readonly DetectedWall[] | null {
    return this.result(roomId, mapUrl)?.walls ?? null;
  }

  /** Drops a deleted room's results. */
  forgetRoom(roomId: string) {
    for (const entry of [...this.entries.values()]) {
      if (entry.roomId === roomId) this.drop(entry);
    }
  }

  async close() {
    for (const entry of this.entries.values()) if (entry.timer) clearTimeout(entry.timer);
    await this.queue?.close();
  }

  private onEvent(event: WallJobEvent) {
    const entry = this.byJob.get(event.jobId);
    // Another process's job, or one this server already gave up on or replaced.
    if (!entry || (entry.status.status !== "queued" && entry.status.status !== "running")) return;
    if (event.kind === "active") {
      entry.status = { status: "running" };
      this.notify(entry.roomId, entry.mapUrl, entry.status);
      return;
    }
    if (event.kind === "failed") {
      // The worker's message may name internals; the GM gets a plain one.
      this.finish(entry, { status: "failed", message: "Wall detection couldn't read this map." }, null);
      return;
    }
    const result = parseResult(event.returnvalue, entry.map);
    if (!result) {
      this.finish(entry, { status: "failed", message: "Wall detection returned an unusable result." }, null);
      return;
    }
    this.finish(entry, {
      status: "done", wallCount: result.walls.length, width: result.preview.width, height: result.preview.height,
    }, result);
  }

  private finish(entry: Entry, status: WallDetectionStatus, result: WallDetectionResult | null) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    entry.status = status;
    entry.result = result;
    this.byJob.delete(entry.jobId);
    // Remove the job either way, and the image once no other job needs it.
    void this.queue?.remove(entry.jobId).catch(() => {});
    this.releaseImage(entry);
    if (this.entries.get(entryKey(entry.roomId, entry.mapUrl)) === entry) this.notify(entry.roomId, entry.mapUrl, status);
  }

  private replace(entry: Entry) {
    const key = entryKey(entry.roomId, entry.mapUrl);
    const old = this.entries.get(key);
    if (old) this.drop(old);
    this.entries.set(key, entry);
    this.byJob.set(entry.jobId, entry);
    while (this.entries.size > MAX_RESULTS) {
      const oldest = this.entries.values().next().value as Entry;
      this.drop(oldest);
    }
  }

  private drop(entry: Entry) {
    if (entry.timer) clearTimeout(entry.timer);
    // A job still waiting holds an image in Redis; nothing will read its answer now.
    if (this.byJob.get(entry.jobId) === entry) void this.queue?.remove(entry.jobId).catch(() => {});
    this.releaseImage(entry);
    this.entries.delete(entryKey(entry.roomId, entry.mapUrl));
    this.byJob.delete(entry.jobId);
  }
}

const entryKey = (roomId: string, mapUrl: string) => `${roomId}\n${mapUrl}`;

/** The worker's return value, validated: shape, count, size, and every wall on the map. */
export function parseResult(raw: unknown, map: { width: number; height: number }): WallDetectionResult | null {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const parsed = WallDetectionResult.safeParse(value);
  if (!parsed.success || !wallsFitMap(parsed.data.walls, map)) return null;
  return parsed.data;
}

/** BullMQ connection options from a Redis URL, as the grid queue builds them. */
function redisAddress(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname, port: Number(url.port || 6379),
    ...(url.username && { username: decodeURIComponent(url.username) }),
    ...(url.password && { password: decodeURIComponent(url.password) }),
    ...(url.pathname.length > 1 && { db: Number(url.pathname.slice(1)) }),
    ...(url.protocol === "rediss:" && { tls: {} }),
  };
}

/** The production transport: a BullMQ producer and a `QueueEvents` listener on the app's Redis. */
export function bullmqWallQueue(redisUrl: string): WallJobQueue {
  const address = redisAddress(redisUrl);
  const queue = new Queue<WallJobData>(WALL_DETECTION_QUEUE, {
    connection: { ...address, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1000 },
  });
  queue.on("error", () => {});
  // BullMQ types its client narrowly; it is an ioredis connection, which has SET ... EX and EXPIRE.
  const redis = async () => (await queue.client) as unknown as Redis;
  const events = new QueueEvents(WALL_DETECTION_QUEUE, { connection: { ...address, maxRetriesPerRequest: null } });
  events.on("error", () => {});
  return {
    add: async (jobId, data) => {
      // One attempt: a map the worker can't read won't read better the second time.
      await queue.add("analyze", data, { jobId, attempts: 1, removeOnComplete: true, removeOnFail: true });
    },
    remove: async (jobId) => {
      await queue.remove(jobId);
    },
    // Raw bytes, not base64: a quarter smaller, and Redis expires the key if nobody deletes it.
    putImage: async (key, bytes, ttlSeconds) => {
      await (await redis()).set(key, Buffer.from(bytes), "EX", ttlSeconds);
    },
    extendImage: async (key, ttlSeconds) => {
      await (await redis()).expire(key, ttlSeconds);
    },
    dropImage: async (key) => {
      await (await redis()).del(key);
    },
    workerAlive: async () => (await (await queue.client).get(WALL_WORKER_HEARTBEAT)) !== null,
    onEvent: (handler) => {
      events.on("active", ({ jobId }) => handler({ jobId, kind: "active" }));
      events.on("completed", ({ jobId, returnvalue }) => handler({ jobId, kind: "completed", returnvalue }));
      events.on("failed", ({ jobId, failedReason }) => handler({ jobId, kind: "failed", reason: failedReason }));
    },
    close: async () => {
      // A Redis that never answered would hold a graceful close forever; give it a moment, then cut it.
      const graceful = Promise.all([events.close(), queue.close()]).then(() => true);
      const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), 1000).unref());
      if (!(await Promise.race([graceful, timeout]))) {
        // Not awaited: against a dead Redis these wait for a connection that never comes.
        void events.disconnect().catch(() => {});
        void queue.disconnect().catch(() => {});
      }
    },
  };
}
