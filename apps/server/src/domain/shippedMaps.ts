import { randomUUID } from "node:crypto";
import { SHIPPED_MAPS } from "@vtt/shared";
import type { LibraryAssetRecord, LibraryStore } from "../store/libraryStore";

/** Object keys of seeded rows start with this; the image is a shipped file, not a stored object (ADR 0036). */
export const SHIPPED_KEY_PREFIX = "shipped:";

export const isShippedKey = (objectKey: string) => objectKey.startsWith(SHIPPED_KEY_PREFIX);

/**
 * Gives an owner the shipped maps as library rows the first time it is called for them. Later calls
 * do nothing, so a map the owner deleted is not added back.
 */
export async function ensureShippedMaps(store: Pick<LibraryStore, "seedShippedMaps">, ownerGmId: string): Promise<void> {
  const createdAt = new Date().toISOString();
  const rows: LibraryAssetRecord[] = SHIPPED_MAPS.map((m) => ({
    id: randomUUID(),
    ownerGmId,
    kind: "map",
    objectKey: `${SHIPPED_KEY_PREFIX}${m.slug}`,
    url: m.url,
    name: m.name,
    width: m.width,
    height: m.height,
    grid: m.grid,
    detectionStatus: null,
    detectionAttempt: 0,
    detectionResult: null,
    createdAt,
  }));
  await store.seedShippedMaps(ownerGmId, rows);
}
