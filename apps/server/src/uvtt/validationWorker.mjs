import { parentPort, workerData } from "node:worker_threads";
import { register } from "tsx/esm/api";
register();
const { validateUvttFile } = await import("./validateFile.ts");
try {
  const result = await validateUvttFile(workerData.filename, workerData.grid);
  parentPort.postMessage({ ok: true, result }, [result.image.buffer]);
} catch (err) {
  parentPort.postMessage({ ok: false, issues: err?.issues ?? [{ code: "validation_failed", path: "file", message: "Could not validate this UVTT file.", severity: "error" }] });
}
