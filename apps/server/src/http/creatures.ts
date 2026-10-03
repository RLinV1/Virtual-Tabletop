import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { CreateCreatureRequest, UpdateCreatureRequest, type LibraryCreature } from "@vtt/shared";
import { CreatureImageMissingError, type LibraryCreatureRecord } from "../store/libraryStore";
import { requireAccountOwner, type Owner } from "../ownership/resolveOwner";
import type { RoomStore } from "../store/roomStore";

const CreatureIdParam = z.uuid();

type WithGm = (req: Request, res: Response, handler: (gmId: string, owner: Owner) => Promise<void>) => Promise<void>;

/**
 * Reusable creatures (ADR 0012), beside the asset library and under the same rules: GM-only,
 * and another GM's creature answers 404, the same as one that does not exist.
 */
export function registerCreatureRoutes(app: Express, deps: { store: RoomStore; withGm: WithGm }) {
  const { store, withGm } = deps;

  /**
   * An image must be the caller's own token art. A missing id, another GM's asset and a map
   * all get the same answer, so this can't be used to learn which assets exist.
   */
  async function ownTokenArt(gmId: string, imageAssetId: string | null | undefined): Promise<boolean> {
    if (imageAssetId == null) return true;
    const asset = await store.findAsset(imageAssetId, gmId);
    return asset?.kind === "token";
  }

  app.get("/api/library/creatures", (req, res) => {
    void withGm(req, res, async (gmId) => {
      res.json((await store.listCreatures(gmId)).map(toWire));
    });
  });

  app.post("/api/library/creatures", (req, res) => {
    void withGm(req, res, async (gmId, owner) => {
      if (!requireAccountOwner(owner, res)) return;
      const body = CreateCreatureRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues });
      if (!(await ownTokenArt(gmId, body.data.imageAssetId))) return void imageRejected(res);
      try {
        const created = await store.createCreature({
          id: randomUUID(), ownerGmId: gmId, ...body.data, createdAt: new Date().toISOString(),
        });
        res.status(201).json(toWire(created));
      } catch (err) {
        if (err instanceof CreatureImageMissingError) return void imageRejected(res);
        throw err;
      }
    });
  });

  app.patch("/api/library/creatures/:id", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = CreatureIdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const patch = UpdateCreatureRequest.safeParse(req.body);
      if (!patch.success) return void res.status(400).json({ error: patch.error.issues });
      if (!(await store.findCreature(id.data, gmId))) return void notFound(res);
      if (!(await ownTokenArt(gmId, patch.data.imageAssetId))) return void imageRejected(res);
      try {
        const updated = await store.updateCreature(id.data, gmId, patch.data);
        if (!updated) return void notFound(res);
        res.json(toWire(updated));
      } catch (err) {
        if (err instanceof CreatureImageMissingError) return void imageRejected(res);
        throw err;
      }
    });
  });

  app.delete("/api/library/creatures/:id", (req, res) => {
    void withGm(req, res, async (gmId) => {
      const id = CreatureIdParam.safeParse(req.params.id);
      if (!id.success || !(await store.deleteCreature(id.data, gmId))) return void notFound(res);
      res.status(204).end();
    });
  });
}

function notFound(res: Response) {
  res.status(404).json({ error: "Creature not found" });
}

function imageRejected(res: Response) {
  res.status(400).json({ error: new CreatureImageMissingError().message });
}

/** The owner stays on the server, like an asset's object key. */
function toWire(record: LibraryCreatureRecord): LibraryCreature {
  return {
    id: record.id,
    name: record.name,
    size: record.size,
    maxHp: record.maxHp,
    ac: record.ac,
    imageAssetId: record.imageAssetId,
    imageUrl: record.imageUrl,
    createdAt: record.createdAt,
  };
}
