import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { DEV_MINIO_ENDPOINT, LocalDiskAssetStore, createAssetStore, type AssetStore } from "../src/store/assetStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

/** Stands in for a connected MinIO: reads come from an in-memory map. */
function fakeMinio(objects: Record<string, string> = {}): AssetStore {
  return {
    put: async (_temp, key) => `/uploads/${key}`,
    delete: async () => {},
    read: async (key) => (key in objects ? { body: Readable.from([objects[key]!]), contentType: "image/png" } : null),
  };
}

describe("choosing upload storage (upload-storage)", () => {
  afterEach(() => vi.restoreAllMocks());
  const quiet = () => vi.spyOn(console, "log").mockImplementation(() => {});

  it("connects to MINIO_ENDPOINT when it is set", async () => {
    quiet();
    const minio = fakeMinio();
    const connect = vi.fn(async () => minio);
    const store = await createAssetStore("/tmp/u", { MINIO_ENDPOINT: "http://minio:9000" }, connect);
    expect(store).not.toBeInstanceOf(LocalDiskAssetStore);
    expect(store.read).toBeTypeOf("function");
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ endpoint: "http://minio:9000" }));
  });

  it("refuses to start in production without MINIO_ENDPOINT", async () => {
    const connect = vi.fn(async () => fakeMinio());
    await expect(createAssetStore("/tmp/u", { NODE_ENV: "production" }, connect)).rejects.toThrow(/MINIO_ENDPOINT/);
    expect(connect).not.toHaveBeenCalled();
  });

  it("uses local disk without probing when MINIO_AUTODETECT=0", async () => {
    quiet();
    const connect = vi.fn(async () => fakeMinio());
    const store = await createAssetStore("/tmp/u", { MINIO_AUTODETECT: "0" }, connect);
    expect(store).toBeInstanceOf(LocalDiskAssetStore);
    expect(connect).not.toHaveBeenCalled();
  });

  it("uses the compose MinIO when it answers, with a single attempt", async () => {
    quiet();
    const minio = fakeMinio();
    const connect = vi.fn(async () => minio);
    const store = await createAssetStore("/tmp/u", {}, connect);
    expect(store).not.toBeInstanceOf(LocalDiskAssetStore);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ endpoint: DEV_MINIO_ENDPOINT, attempts: 1 }));
  });

  it("falls back to local disk when nothing answers", async () => {
    quiet();
    const refused = vi.fn(async (): Promise<AssetStore> => {
      throw new Error("ECONNREFUSED");
    });
    expect(await createAssetStore("/tmp/u", {}, refused)).toBeInstanceOf(LocalDiskAssetStore);
  });

  it("falls back to local disk within about a second when the probe hangs", async () => {
    quiet();
    const hangs = () => new Promise<AssetStore>(() => {});
    const started = Date.now();
    expect(await createAssetStore("/tmp/u", {}, hangs)).toBeInstanceOf(LocalDiskAssetStore);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe("keeping a disk copy alongside MinIO (upload-storage)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("deletes both the MinIO object and the disk copy, so a deleted asset stops loading", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    await writeFile(path.join(uploadDir, "map.png"), "disk copy");
    const minioDelete = vi.fn(async () => {});
    const connect = vi.fn(async (): Promise<AssetStore> => ({ ...fakeMinio(), delete: minioDelete }));
    const store = await createAssetStore(uploadDir, { MINIO_ENDPOINT: "http://minio:9000" }, connect);
    await store.delete("map.png");
    expect(minioDelete).toHaveBeenCalledWith("map.png");
    expect(existsSync(path.join(uploadDir, "map.png"))).toBe(false);
  });
});

describe("serving uploads while MinIO is in use (upload-storage)", () => {
  it("serves MinIO objects, falls through to disk for older uploads, and 404s the rest", async () => {
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    await writeFile(path.join(uploadDir, "old.png"), "from-disk");
    const app = await buildApp({ store: new MemoryRoomStore(), uploadDir, assets: fakeMinio({ "new.png": "from-minio" }) });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      expect(await (await fetch(`${base}/uploads/new.png`)).text()).toBe("from-minio");
      expect(await (await fetch(`${base}/uploads/old.png`)).text()).toBe("from-disk");
      expect((await fetch(`${base}/uploads/missing.png`)).status).toBe(404);
    } finally {
      await app.close();
    }
  });
});
