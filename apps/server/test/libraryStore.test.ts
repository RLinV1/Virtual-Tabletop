import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import type { LibraryAssetRecord } from "../src/store/libraryStore";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import type { RoomStore } from "../src/store/roomStore";

/**
 * One contract, two stores (ADR 0004). Postgres runs only when DATABASE_URL is set,
 * like postgresStore.test.ts.
 */
const url = process.env.DATABASE_URL;
const postgres = url ? await PostgresRoomStore.connect(url) : null;

afterAll(async () => {
  await postgres?.close();
});

const stores: [string, RoomStore | null][] = [
  ["memory", new MemoryRoomStore()],
  ["postgres", postgres],
];

for (const [label, store] of stores) {
  describe.skipIf(!store)(`LibraryStore contract: ${label} (asset-library, gm-home)`, () => {
    const s = () => store!;
    const asset = (ownerGmId: string, overrides: Partial<LibraryAssetRecord> = {}): LibraryAssetRecord => ({
      id: randomUUID(),
      ownerGmId,
      kind: "map",
      objectKey: `${randomUUID()}.png`,
      url: "/uploads/x.png",
      name: "Goblin Cave",
      width: 2048,
      height: 1536,
      grid: DEFAULT_GRID,
      createdAt: new Date().toISOString(),
      ...overrides,
    });

    it("registers a GM identity idempotently", async () => {
      const hash = randomUUID();
      const a = await s().registerGm(hash);
      expect(await s().registerGm(hash)).toBe(a);
      expect(await s().findGm(hash)).toBe(a);
      expect(await s().findGm(randomUUID())).toBeNull();
    });

    it("lists only the GM's own rooms, most recently active first", async () => {
      const gmA = await s().registerGm(randomUUID());
      const gmB = await s().registerGm(randomUUID());
      const older = randomUUID();
      const newer = randomUUID();
      await s().createRoom(older, randomUUID().slice(0, 10), { ownerGmId: gmA, name: "Older" });
      await s().createRoom(newer, randomUUID().slice(0, 10), { ownerGmId: gmA, name: "Newer" });
      await s().createRoom(randomUUID(), randomUUID().slice(0, 10), { ownerGmId: gmB, name: "B's" });
      await new Promise((r) => setTimeout(r, 5));
      await s().append(newer, 0, [{ actorId: null, event: { type: "RoomCreated", name: "Newer" } }]);

      const rooms = await s().listOwnedRooms(gmA);
      expect(rooms.map((r) => r.name)).toEqual(["Newer", "Older"]);
    });

    it("scopes every asset read and write to its owner", async () => {
      const gmA = await s().registerGm(randomUUID());
      const gmB = await s().registerGm(randomUUID());
      const a = asset(gmA);
      await s().createAsset(a);

      expect((await s().listAssets(gmA)).map((x) => x.id)).toEqual([a.id]);
      expect(await s().listAssets(gmB)).toEqual([]);
      expect(await s().findAsset(a.id, gmB)).toBeNull();
      expect(await s().updateAsset(a.id, gmB, { name: "Stolen" })).toBeNull();
      expect(await s().deleteAsset(a.id, gmB)).toBeNull();
      expect((await s().findAsset(a.id, gmA))?.name).toBe("Goblin Cave");
    });

    it("renames and re-grids an asset", async () => {
      const gm = await s().registerGm(randomUUID());
      const a = asset(gm);
      await s().createAsset(a);
      const grid = { ...DEFAULT_GRID, cellSize: 64 };
      const updated = await s().updateAsset(a.id, gm, { name: "Crypt", grid });
      expect(updated).toMatchObject({ name: "Crypt", grid });
    });

    it("reports usage only from rooms the asset's owner owns, and forgets it on delete", async () => {
      const gmA = await s().registerGm(randomUUID());
      const gmB = await s().registerGm(randomUUID());
      const a = asset(gmA, { kind: "token", grid: null });
      await s().createAsset(a);
      const roomA = randomUUID();
      const roomB = randomUUID();
      await s().createRoom(roomA, randomUUID().slice(0, 10), { ownerGmId: gmA, name: "Cave" });
      await s().createRoom(roomB, randomUUID().slice(0, 10), { ownerGmId: gmB, name: "Intruder" });
      await s().setAssetRefs(roomA, [a.id]);
      await s().setAssetRefs(roomB, [a.id, "not-a-uuid"]);

      expect(await s().assetUsage(a.id, gmA)).toEqual([{ id: roomA, name: "Cave" }]);

      await s().setAssetRefs(roomA, []);
      expect(await s().assetUsage(a.id, gmA)).toEqual([]);

      await s().setAssetRefs(roomA, [a.id]);
      expect((await s().deleteAsset(a.id, gmA))?.id).toBe(a.id);
      expect(await s().assetUsage(a.id, gmA)).toEqual([]);
      expect(await s().listAssets(gmA)).toEqual([]);

      // A room still showing the deleted asset cannot write it back into the index.
      await s().setAssetRefs(roomA, [a.id]);
      expect(await s().assetUsage(a.id, gmA)).toEqual([]);
    });
  });
}
