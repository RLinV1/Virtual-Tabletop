import { ENCOUNTER_TEMPLATE_VERSION, EncounterTemplateData, templateMapImage, type ResolvedEncounter } from "@vtt/shared";
import type { LibraryStore } from "../store/libraryStore";

export type ResolveEncounterResult =
  | { ok: true; encounter: ResolvedEncounter }
  | { ok: false; reason: "missing" | "unreadable" | "map_missing"; message: string };

/**
 * Reads one of the owner's encounter templates for an apply (ADR 0024): validated against the
 * shared schema, with its map's address resolved now. A template that is another account's
 * reads exactly as one that does not exist.
 */
export async function resolveEncounter(
  store: Pick<LibraryStore, "findEncounter">,
  ownerGmId: string,
  templateId: string,
): Promise<ResolveEncounterResult> {
  const record = await store.findEncounter(templateId, ownerGmId);
  if (!record) return { ok: false, reason: "missing", message: "That encounter template isn't available." };
  if (record.version !== ENCOUNTER_TEMPLATE_VERSION) {
    return { ok: false, reason: "unreadable", message: `"${record.name}" was saved in a format this server can't read.` };
  }
  const data = EncounterTemplateData.safeParse(record.data);
  if (!data.success) return { ok: false, reason: "unreadable", message: `"${record.name}" can't be read. It may be damaged.` };
  if (!record.mapAssetId || !record.mapUrl) {
    return { ok: false, reason: "map_missing", message: `The map for "${record.name}" was deleted from your library.` };
  }
  return {
    ok: true,
    encounter: {
      id: record.id,
      name: record.name,
      scene: { map: templateMapImage({ ...data.data.map, assetId: record.mapAssetId }, record.mapUrl), grid: data.data.grid },
      tokens: data.data.tokens,
      fog: data.data.fog,
    },
  };
}
