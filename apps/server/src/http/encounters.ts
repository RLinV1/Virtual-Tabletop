import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  ENCOUNTER_TEMPLATE_VERSION,
  EncounterTemplateData,
  MAX_ENCOUNTER_TEMPLATES,
  RenameEncounterRequest,
  SaveEncounterRequest,
  type EncounterSummary,
} from "@vtt/shared";
import type { RoomRegistry } from "../domain/roomRegistry";
import { requireAccountOwner, resolveOwner, type Owner } from "../ownership/resolveOwner";
import { EncounterLimitError, EncounterMapMissingError, type EncounterRecord } from "../store/libraryStore";
import type { RoomStore } from "../store/roomStore";

const IdParam = z.uuid();

/**
 * Reusable encounter templates (FR-GM-13, ADR 0024), beside the asset library and under the same
 * rules: another GM's template answers 404, the same as one that does not exist. A template is
 * built here, on the server, from the live room the caller owns; the client sends no board data.
 */
export function registerEncounterRoutes(app: Express, deps: { store: RoomStore; registry: RoomRegistry }) {
  const { store, registry } = deps;

  app.get("/api/library/encounters", (req, res) => {
    void withOwner(req, res, async (gmId) => {
      res.json((await store.listEncounters(gmId)).map(toSummary));
    });
  });

  app.post("/api/library/encounters", (req, res) => {
    void withOwner(req, res, async (gmId, owner) => {
      if (!requireAccountOwner(owner, res)) return;
      const body = SaveEncounterRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues });
      // A room that is missing or someone else's is the same 404, so room ids can't be probed.
      if ((await store.findRoomOwner(body.data.roomId)) !== gmId) return void res.status(404).json({ error: "Room not found" });

      const room = await registry.get(body.data.roomId);
      if (!room) return void res.status(404).json({ error: "Room not found" });
      const board = room.boardForOwner();
      const map = board.scene.map;
      const mapAsset = map?.assetId ? await store.findAsset(map.assetId, gmId) : null;
      if (!map || !mapAsset || mapAsset.kind !== "map") {
        return void res.status(400).json({ error: "Put this room's map in your library first, then save the encounter" });
      }

      const data = EncounterTemplateData.safeParse({
        map: { assetId: mapAsset.id, width: mapAsset.width, height: mapAsset.height },
        grid: board.scene.grid,
        tokens: Object.values(board.tokens).map(({ id: _id, ownerIds: _owners, initiative: _initiative, ...token }) => token),
        fog: Object.values(board.fog).map(({ id: _id, ...region }) => region),
      });
      if (!data.success) return void res.status(400).json({ error: "This board is too large to save as a template" });

      const now = new Date().toISOString();
      try {
        const created = await store.createEncounter({
          id: randomUUID(),
          ownerGmId: gmId,
          name: body.data.name,
          version: ENCOUNTER_TEMPLATE_VERSION,
          data: data.data,
          mapAssetId: mapAsset.id,
          createdAt: now,
          updatedAt: now,
        }, MAX_ENCOUNTER_TEMPLATES);
        res.status(201).json(toSummary(created));
      } catch (err) {
        if (err instanceof EncounterMapMissingError || err instanceof EncounterLimitError) {
          return void res.status(400).json({ error: err.message });
        }
        throw err;
      }
    });
  });

  app.patch("/api/library/encounters/:id", (req, res) => {
    void withOwner(req, res, async (gmId) => {
      const id = IdParam.safeParse(req.params.id);
      if (!id.success) return void notFound(res);
      const body = RenameEncounterRequest.safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: body.error.issues });
      const updated = await store.renameEncounter(id.data, gmId, body.data.name, new Date().toISOString());
      if (!updated) return void notFound(res);
      res.json(toSummary(updated));
    });
  });

  app.delete("/api/library/encounters/:id", (req, res) => {
    void withOwner(req, res, async (gmId) => {
      const id = IdParam.safeParse(req.params.id);
      if (!id.success || !(await store.deleteEncounter(id.data, gmId))) return void notFound(res);
      res.status(204).end();
    });
  });

  async function withOwner(req: Request, res: Response, handler: (gmId: string, owner: Owner) => Promise<void>) {
    try {
      const owner = await resolveOwner(req, res, store);
      if (!owner) return void res.status(401).json({ error: "Sign in to do that" });
      await handler(owner.ownerId, owner);
    } catch (err) {
      console.error("[vtt] encounter route failed", err);
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  }
}

function notFound(res: Response) {
  res.status(404).json({ error: "Encounter template not found" });
}

/** The board data stays on the server; the library needs only what it lists. */
function toSummary(record: EncounterRecord): EncounterSummary {
  return {
    id: record.id,
    name: record.name,
    mapName: record.mapName,
    tokenCount: record.data.tokens.length,
    fogCount: record.data.fog.length,
    createdAt: record.createdAt,
  };
}
