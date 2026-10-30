import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_GRID, SHIPPED_MAPS } from "@vtt/shared";
import type { LibraryAssetRecord } from "../src/store/libraryStore";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import type { RoomStore } from "../src/store/roomStore";
import { ensureShippedMaps, isShippedKey } from "../src/domain/shippedMaps";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";

const url = process.env.DATABASE_URL;
const postgres = url ? await PostgresRoomStore.connect(url) : null;
afterAll(async () => {
  await postgres?.close();
});

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

describe("seeding per map (builtin-library-assets, ADR 0036 amendment)", () => {
  const stores: [string, RoomStore | null][] = [["memory", new MemoryRoomStore()], ["postgres", postgres]];
  const row = (ownerGmId: string, slug: string): LibraryAssetRecord => ({
    id: randomUUID(), ownerGmId, kind: "map", objectKey: `shipped:${slug}`, url: `/img/${slug}.webp`,
    name: slug, width: 700, height: 700, grid: DEFAULT_GRID, createdAt: new Date().toISOString(),
  });
  const slugs = async (s: RoomStore, o: string) => (await s.listAssets(o)).map((r) => r.objectKey).sort();
  const ORIGINAL = ["broken-span", "hollowfrost-keep", "temple-green-sun"];

  for (const [label, store] of stores) {
    describe.skipIf(!store)(label, () => {
      const owner = () => store!.registerGm(randomUUID());

      it("adds only the new catalog map once, and never re-adds a deleted one", async () => {
        const o = await owner();
        expect(await store!.seedShippedMaps(o, ORIGINAL.map((s) => row(o, s)))).toBe(true);
        const [first] = await store!.listAssets(o);
        await store!.deleteAsset(first!.id, o);
        const catalog = [...ORIGINAL, "new-map"].map((s) => row(o, s));
        expect(await store!.seedShippedMaps(o, catalog)).toBe(true);
        expect(await store!.seedShippedMaps(o, catalog)).toBe(false);
        const keys = await slugs(store!, o);
        expect(keys).toHaveLength(3);
        expect(keys).toContain("shipped:new-map");
        expect(keys).not.toContain(first!.objectKey);
      });

      it("gives a new account every row exactly once, even under concurrent calls", async () => {
        const o = await owner();
        const catalog = [...ORIGINAL, "new-map"];
        await Promise.all([1, 2, 3].map(() => store!.seedShippedMaps(o, catalog.map((s) => row(o, s)))));
        expect(await slugs(store!, o)).toEqual(catalog.map((s) => `shipped:${s}`).sort());
      });
    });
  }
});
