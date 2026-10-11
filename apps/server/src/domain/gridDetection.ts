import { Queue, Worker } from "bullmq";
import { GridDetectionCandidate, canRenderGrid } from "@vtt/shared";
import type { AssetStore } from "../store/assetStore";
import type { DetectionOutcome, DetectionTarget } from "../store/gridDetectionStore";
import type { RoomStore } from "../store/roomStore";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VISION_RESPONSE_BYTES = 4096;
const VISION_TIMEOUT_MS = 15_000;
const RECOVERY_INTERVAL_MS = 30_000;

export type Detector = (bytes: Uint8Array, dimensions: { width: number; height: number }) => Promise<DetectionOutcome>;
export interface GridDetectionDispatcher {
  enqueue(target: DetectionTarget, attempt: number): Promise<void>;
  close(): Promise<void>;
}

/** Never turn an otherwise valid upload into an error because dispatch is unavailable. */
export async function enqueueDetection(store: RoomStore, dispatcher: GridDetectionDispatcher, target: DetectionTarget, attempt: number) {
  try {
    await dispatcher.enqueue(target, attempt);
  } catch {
    try {
      if (await store.markDetectionRunning(target, attempt)) {
        await store.finishDetection(target, attempt, { status: "error" });
      }
    } catch { /* Startup recovery can revisit the row. */ }
  }
}

/** The URL comes only from server configuration. The image comes only from the stored object key. */
export function visionDetector(url: string): Detector {
  return async (bytes, dimensions) => {
    const response = await fetch(`${url.replace(/\/$/, "")}/detect`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      headers: {
        "content-type": "application/octet-stream",
        "x-image-width": String(dimensions.width),
        "x-image-height": String(dimensions.height),
      },
      body: Buffer.from(bytes),
    });
    if (!response.ok) throw new Error("Vision service unavailable");
    if (!response.body) throw new Error("Empty vision response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_VISION_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error("Vision response too large");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const result: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (typeof result !== "object" || result === null || !("kind" in result)) throw new Error("Invalid vision response");
    if (result.kind === "no_grid") return { status: "no_grid" };
    if (result.kind !== "candidate") throw new Error("Invalid vision response");
    const candidate = GridDetectionCandidate.parse(result);
    return { status: "suggested", candidate };
  };
}

export async function createGridDetectionDispatcher(
  store: RoomStore,
  assets: AssetStore,
  options: { redisUrl?: string; visionUrl?: string; detector?: Detector } = {},
): Promise<GridDetectionDispatcher> {
  const detector = options.detector ?? visionDetector(options.visionUrl ?? "http://127.0.0.1:8000");
  const processJob = async (target: DetectionTarget, attempt: number) => {
    if (!(await store.markDetectionRunning(target, attempt))) return;
    try {
      const row = await store.findDetection(target);
      if (!row || row.attempt !== attempt) return;
      const bytes = await assets.readPrivate(row.objectKey, MAX_IMAGE_BYTES);
      if (!bytes) throw new Error("Stored image unavailable");
      const outcome = await detector(bytes, { width: row.width, height: row.height });
      if (outcome.status === "suggested") {
        const candidate = GridDetectionCandidate.parse(outcome.candidate);
        const { cellSize } = candidate;
        if (!canRenderGrid(cellSize, row) || cellSize > Math.max(row.width, row.height)) {
          throw new Error("Candidate outside drawable range");
        }
      }
      await store.finishDetection(target, attempt, outcome);
    } catch {
      // Do not log image bytes, object keys, job details, or private results.
      await store.finishDetection(target, attempt, { status: "error" });
    }
  };

  let queue: Queue<{ target: DetectionTarget; attempt: number }> | null = null;
  let worker: Worker<{ target: DetectionTarget; attempt: number }> | null = null;
  if (options.redisUrl) {
    const url = new URL(options.redisUrl);
    const address = {
      host: url.hostname, port: Number(url.port || 6379),
      ...(url.username && { username: decodeURIComponent(url.username) }),
      ...(url.password && { password: decodeURIComponent(url.password) }),
      ...(url.pathname.length > 1 && { db: Number(url.pathname.slice(1)) }),
      ...(url.protocol === "rediss:" && { tls: {} }),
    };
    queue = new Queue("grid-detection", {
      connection: { ...address, maxRetriesPerRequest: 1, enableOfflineQueue: false, connectTimeout: 1000 },
    });
    queue.on("error", () => {});
    worker = new Worker("grid-detection", async (job) => processJob(job.data.target, job.data.attempt), {
      connection: { ...address, maxRetriesPerRequest: null }, concurrency: 2,
    });
    worker.on("error", () => {});
  }

  const enqueue = async (target: DetectionTarget, attempt: number) => {
    try {
      if (queue) {
        const id = target.scope === "library" ? `lib-${target.id}` : `room-${target.roomId}-${target.objectKey}`;
        await queue.add("analyze", { target, attempt }, { jobId: `${id}-${attempt}`, removeOnComplete: true, removeOnFail: true });
      } else {
        setImmediate(() => { void processJob(target, attempt); });
      }
    } catch {
      try {
        if (await store.markDetectionRunning(target, attempt)) {
          await store.finishDetection(target, attempt, { status: "error" });
        }
      } catch { /* The recovery scan will revisit the row. */ }
    }
  };

  const recover = async () => {
    try {
      for (const job of await store.recoverDetections()) await enqueue(job.target, job.attempt);
    } catch {
      // A later scan retries. An unavailable queue must not prevent ordinary play.
    }
  };
  await recover();
  const timer = setInterval(() => { void recover(); }, RECOVERY_INTERVAL_MS);
  timer.unref();
  return {
    enqueue,
    close: async () => {
      clearInterval(timer);
      await worker?.close();
      await queue?.close();
    },
  };
}
