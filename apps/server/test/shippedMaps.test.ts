import { describe, expect, it } from "vitest";
import { SHIPPED_MAPS } from "@vtt/shared";
import { ensureShippedMaps, isShippedKey } from "../src/domain/shippedMaps";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

describe("seeding the shipped maps (builtin-library-assets, ADR 0036)", () => {
  it("seeds an owner once, keys the rows apart from stored objects, and never re-seeds", async () => {
    const store = new MemoryRoomStore();
    await ensureShippedMaps(store, "owner-a");
    await ensureShippedMaps(store, "owner-a");
    const rows = await store.listAssets("owner-a");
    expect(rows).toHaveLength(SHIPPED_MAPS.length);
    for (const row of rows) {
      expect(isShippedKey(row.objectKey)).toBe(true);
      expect(row.kind).toBe("map");
    }
    await store.deleteAsset(rows[0]!.id, "owner-a");
    await ensureShippedMaps(store, "owner-a");
    expect(await store.listAssets("owner-a")).toHaveLength(SHIPPED_MAPS.length - 1);
    expect(await store.listAssets("owner-b")).toEqual([]);
  });

  it("seeds concurrent callers once", async () => {
    const store = new MemoryRoomStore();
    await Promise.all([ensureShippedMaps(store, "o"), ensureShippedMaps(store, "o")]);
    expect(await store.listAssets("o")).toHaveLength(SHIPPED_MAPS.length);
  });
});
