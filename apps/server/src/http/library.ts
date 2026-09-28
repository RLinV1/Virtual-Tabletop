import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  canRenderGrid,
  DEFAULT_GRID,
  GmIdentifyRequest,
  LibraryPatchRequest,
  LibraryUploadFields,
  GridDetectionStatus,
  type GmRoomSummary,
  type LibraryAsset,
  type LibraryUsageResponse,
} from "@vtt/shared";
import { hashToken } from "../domain/credentials";
import { registerCreatureRoutes } from "./creatures";
import type { AssetStore } from "../store/assetStore";
import type { LibraryAssetRecord } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";
import { enqueueDetection, type GridDetectionDispatcher } from "../domain/gridDetection";
import type { DetectionRecord } from "../store/gridDetectionStore";
import { resolveGm } from "./gmAuth";
import { imageUploader } from "./imageUpload";

const AssetIdParam = z.uuid();

/**
 * GM identity, dashboard and asset library (ADR 0004). Every route resolves the GM first;
 * an asset the caller does not own answers 404, the same as one that does not exist.
 */
export function registerLibraryRoutes(
  app: Express,
  deps: { store: RoomStore; uploadDir: string; assets: AssetStore; detection: GridDetectionDispatcher },
) {
  const { store, uploadDir, assets, detection } = deps;
  const receiveImage = imageUploader(uploadDir);

  /** Registers this browser's GM token. Idempotent; the server keeps only its hash. */
  app.post("/api/gm/identify", (req, res) => {
    void (async () => {
      const body = GmIdentifyRequest.safeParse(req.body);
      if (!body.success) return res.status(400).json({ error: body.error.issues });
      await store.registerGm(hashToken(body.data.gmToken));
      return res.status(204).end();
    })().catch(() => res.status(500).json({ error: "Internal error" }));
  });

  app.get("/api/gm/rooms", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const rooms: GmRoomSummary[] = await store.listOwnedRooms(gmId);
      res.json(rooms);
    });
  });

  app.get("/api/library", (req, res) => {
    void withGm(req, res, async (gmId) => {
      res.json((await store.listAssets(gmId)).map(toWire));
    });
  });

  app.post("/api/library", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const upload = await receiveImage(req, res);
      if (!upload.ok) return void res.status(upload.status).json({ error: upload.error });
      const fields = LibraryUploadFields.safeParse(req.body);
      if (!fields.success) {
        await unlink(upload.file.path).catch(() => {});
        return void res.status(400).json({ error: fields.error.issues });
      }
      const key = path.basename(upload.file.path);
      const url = await assets.put(upload.file.path, key, upload.file.mimetype);
      const record: LibraryAssetRecord = {
        id: randomUUID(),
        ownerGmId: gmId,
        kind: fields.data.kind,
        objectKey: key,
        url,
        name: fields.data.name,
        width: fields.data.width,
        height: fields.data.height,
        grid: fields.data.kind === "map" ? DEFAULT_GRID : null,
        detectionStatus: fields.data.kind === "map" ? "queued" : null,
        detectionAttempt: fields.data.kind === "map" ? 1 : 0,
        detectionResult: null,
        createdAt: new Date().toISOString(),
      };
      await store.createAsset(record);
      if (record.kind === "map") await enqueueDetection(store, detection, { scope: "library", id: record.id }, 1);
      res.status(201).json(toWire(record));
    });
  });

  app.patch("/api/library/:id", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const patch = LibraryPatchRequest.safeParse(req.body);
      if (!patch.success) return void res.status(400).json({ error: patch.error.issues });
      const existing = await store.findAsset(id.data, gmId);
      if (!existing) return void notFound(res);
      if (patch.data.grid && existing.kind !== "map") {
        return void res.status(400).json({ error: "Only maps have a grid" });
      }
      // The same drawable-grid limit `decide` applies to a room's grid, against this map's size.
      if (patch.data.grid && !canRenderGrid(patch.data.grid.cellSize, existing)) {
        return void res.status(400).json({ error: "Grid cell size is too small for this map" });
      }
      const updated = await store.updateAsset(id.data, gmId, patch.data);
      if (!updated) return void notFound(res);
      res.json(toWire(updated));
    });
  });

  app.get("/api/library/:id/grid-detection", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      if (!id.success || !(await store.findAsset(id.data, gmId))) return void notFound(res);
      const row = await store.findDetection({ scope: "library", id: id.data });
      if (!row) return void notFound(res);
      res.json(detectionWire(row));
    });
  });

  app.post("/api/library/:id/grid-detection/retry", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      if (!id.success || !(await store.findAsset(id.data, gmId))) return void notFound(res);
      const target = { scope: "library" as const, id: id.data };
      const attempt = await store.retryDetection(target);
      if (!attempt) return void res.status(409).json({ error: "Analysis is not in error" });
      await enqueueDetection(store, detection, target, attempt);
      res.status(202).json(detectionWire((await store.findDetection(target))!));
    });
  });

  app.get("/api/library/:id/usage", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      if (!id.success || !(await store.findAsset(id.data, gmId))) return void notFound(res);
      const response: LibraryUsageResponse = {
        rooms: await store.assetUsage(id.data, gmId),
        creatures: await store.creaturesUsingImage(id.data, gmId),
      };
      res.json(response);
    });
  });

  app.delete("/api/library/:id", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = AssetIdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const removed = await store.deleteAsset(id.data, gmId);
      if (!removed) return void notFound(res);
      // Rooms still naming this URL in their log now get a 404 and draw a generic stand-in.
      await assets.delete(removed.objectKey);
      res.status(204).end();
    });
  });

  registerCreatureRoutes(app, { store, withGm });

  async function withGm(req: Request, res: Response, handler: (gmId: string) => Promise<void>) {
    try {
      const gm = await resolveGm(req, store);
      if (!gm) return void res.status(401).json({ error: "GM identity required" });
      await handler(gm.gmId);
    } catch {
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  }
}

export function detectionWire(row: DetectionRecord): GridDetectionStatus {
  return GridDetectionStatus.parse(row.status === "suggested" && row.candidate
    ? { status: "suggested", attempt: row.attempt, candidate: row.candidate }
    : { status: row.status, attempt: row.attempt });
}

function notFound(res: Response) {
  res.status(404).json({ error: "Asset not found" });
}

/** The server-only object key stays behind. */
function toWire(record: LibraryAssetRecord): LibraryAsset {
  return {
    id: record.id,
    kind: record.kind,
    name: record.name,
    url: record.url,
    width: record.width,
    height: record.height,
    grid: record.grid,
    createdAt: record.createdAt,
  };
}
