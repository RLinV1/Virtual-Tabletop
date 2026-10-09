import { createHash } from "node:crypto";
import { Queue, QueueEvents } from "bullmq";
import {
  WALL_DETECTION_QUEUE,
  WallDetectionResult,
  wallsFitMap,
  type DetectedWall,
  type MapImage,
  type WallDetectionStatus,
} from "@vtt/shared";
import type { AssetStore } from "../store/assetStore";

/**
 * Automatic wall detection (FR-GM-11, ADR 0025). The app server produces a BullMQ job; the Python
 * worker in `services/vision` consumes it; queue events tell this server when it is done. Results
 * are suggestions kept in this process for the room's GM: nothing here touches room state, which
 * changes only when the GM's `wall.applyDetected` goes through `decide`.
 */

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** Most results kept at once; the oldest room's goes first. */
const MAX_RESULTS = 200;
/** A job with no answer by then is reported failed, so a missing worker never leaves the GM waiting forever. */
const JOB_TIMEOUT_MS = 10 * 60_000;

/** What the app server puts on the queue. The bytes are read from its own storage, never a caller's URL. */
export interface WallJobData {
  /** Base64 image bytes. */
  image: string;
  width: number;
  height: number;
  /** The room grid's cell size in image pixels, so the worker judges walls against the squares. */
  cellSize: number;
}

/** A queue event about one job, as BullMQ's `QueueEvents` reports it. */
export type WallJobEvent =
  | { jobId: string; kind: "active" }
  | { jobId: string; kind: "completed"; returnvalue: unknown }
  | { jobId: string; kind: "failed"; reason: string };

/** The transport: BullMQ in production, a stand-in in tests (no Redis or Python in CI). */
export interface WallJobQueue {
  add(jobId: string, data: WallJobData): Promise<void>;
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
  status: WallDetectionStatus;
  result: WallDetectionResult | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export type StartResult = "queued" | "busy" | "unavailable" | "unreadable";

/** The object key behind a map this server stored (`/uploads/<key>`), or null for any other address. */
export function uploadKey(url: string): string | null {
  const match = /^\/uploads\/([A-Za-z0-9._-]+)$/.exec(url);
  return match ? match[1]! : null;
}

export class WallDetections {
  private entries = new Map<string, Entry>();
  private byJob = new Map<string, Entry>();
  private attempts = 0;

  constructor(
    private assets: AssetStore,
    private queue: WallJobQueue | null,
    private notify: WallNotifier,
  ) {
    queue?.onEvent((event) => this.onEvent(event));
  }

  /** False without Redis: the routes answer 503 and uploads skip detection. */
  get available() {
    return this.queue !== null;
  }

  /** Queues an analysis of this room's map. Refuses while one for the same map is still running. */
  async start(roomId: string, map: Pick<MapImage, "url" | "width" | "height">, cellSize: number): Promise<StartResult> {
    if (!this.queue) return "unavailable";
    const key = uploadKey(map.url);
    if (!key) return "unreadable";
    const existing = this.entries.get(entryKey(roomId, map.url));
    if (existing && (existing.status.status === "queued" || existing.status.status === "running")) return "busy";
    const bytes = await this.assets.readPrivate(key, MAX_IMAGE_BYTES);
    if (!bytes) return "unreadable";
    const hash = createHash("sha1").update(map.url).digest("hex").slice(0, 16);
    const jobId = `walls-${roomId}-${hash}-${++this.attempts}`;
    const entry: Entry = {
      roomId, mapUrl: map.url, map: { width: map.width, height: map.height }, jobId,
      status: { status: "queued" }, result: null, timer: null,
    };
    this.replace(entry);
    try {
      await this.queue.add(jobId, {
        image: Buffer.from(bytes).toString("base64"),
        width: map.width,
        height: map.height,
        cellSize: Number.isFinite(cellSize) && cellSize > 0 ? cellSize : 0,
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

  /** The latest analysis of a map this room asked for, or null. */
  status(roomId: string, mapUrl: string): WallDetectionStatus | null {
    return this.entries.get(entryKey(roomId, mapUrl))?.status ?? null;
  }

  /** The validated result, for the preview and for `wall.applyDetected`. */
  result(roomId: string, mapUrl: string): WallDetectionResult | null {
    return this.entries.get(entryKey(roomId, mapUrl))?.result ?? null;
  }

  /** The walls `decide` may commit for this room's map (ADR 0025). */
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
    // Remove the job either way: its data holds the whole image.
    void this.queue?.remove(entry.jobId).catch(() => {});
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
    // A job still waiting holds the whole image in Redis; nothing will read its answer now.
    if (this.byJob.get(entry.jobId) === entry) void this.queue?.remove(entry.jobId).catch(() => {});
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
