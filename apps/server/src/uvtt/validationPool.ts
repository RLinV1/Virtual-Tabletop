import { Worker } from "node:worker_threads";
import { UvttError, UvttIssue, type GridSpec } from "@vtt/shared";
import type { ValidatedUvttFile } from "./validateFile";

interface Job { filename: string; grid: GridSpec; resolve: (v: ValidatedUvttFile) => void; reject: (e: Error) => void }
/** One worker at a time; no parsing or full image decoding in the room's FIFO queue. */
export class UvttValidationPool {
  private pending: Job[] = [];
  private active: Worker | null = null;
  private closed = false;
  constructor(private timeoutMs = 30_000) {}
  validate(filename: string, grid: GridSpec): Promise<ValidatedUvttFile> {
    if (this.closed || (this.active && this.pending.length >= 2)) return Promise.reject(this.failure("validation_busy", "Validation is busy. Try again shortly."));
    return new Promise((resolve, reject) => { this.pending.push({ filename, grid, resolve, reject }); this.next(); });
  }
  async close() {
    this.closed = true;
    for (const job of this.pending.splice(0)) job.reject(this.failure("validation_closed", "Server restarted. Re-import the file."));
    if (this.active) await this.active.terminate();
  }
  private failure(code: string, message: string) {
    return new UvttError([{ code, message, path: "file", severity: "error" }]);
  }
  private next() {
    if (this.closed || this.active) return;
    const job = this.pending.shift();
    if (!job) return;
    const worker = new Worker(new URL("./validationWorker.mjs", import.meta.url), { workerData: { filename: job.filename, grid: job.grid } });
    this.active = worker;
    let settled = false;
    const finish = (result: ValidatedUvttFile | null, err?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      // Do not start another decode until the terminated worker has actually exited.
      void worker.terminate().finally(() => { this.active = null; this.next(); });
      if (result) job.resolve(result); else job.reject(err ?? this.failure("validation_failed", "Could not validate this file."));
    };
    const timer = setTimeout(() => finish(null, this.failure("validation_timeout", "Validation took too long. Use a smaller file.")), this.timeoutMs);
    worker.once("message", (message: { ok: boolean; result?: ValidatedUvttFile; issues?: unknown }) => {
      if (message.ok && message.result) finish(message.result);
      else {
        const issues = UvttIssue.array().max(20).safeParse(message.issues);
        finish(null, issues.success ? new UvttError(issues.data) : undefined);
      }
    });
    worker.once("error", () => finish(null));
    worker.once("exit", () => { if (!settled) finish(null); });
  }
}
