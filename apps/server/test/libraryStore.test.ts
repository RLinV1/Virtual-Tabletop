import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_GRID, ENCOUNTER_TEMPLATE_VERSION } from "@vtt/shared";
import { CreatureImageMissingError, EncounterLimitError, EncounterMapMissingError, type LibraryAssetRecord, type NewCreatureRecord, type NewEncounterRecord } from "../src/store/libraryStore";
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

    const creature = (ownerGmId: string, overrides: Partial<NewCreatureRecord> = {}): NewCreatureRecord => ({
      id: randomUUID(),
      ownerGmId,
      name: "Goblin",
      size: 1,
      maxHp: 7,
      ac: 15,
      imageAssetId: null,
      createdAt: new Date().toISOString(),
      ...overrides,
    });

    it("scopes every creature read and write to its owner (library-creatures)", async () => {
      const gmA = await s().registerGm(randomUUID());
      const gmB = await s().registerGm(randomUUID());
      const c = creature(gmA);
      // Colour and conditions left out read back as the defaults (KAN-70).
      expect(await s().createCreature(c)).toEqual({ ...c, hp: null, attacks: [], color: "#c0392b", conditions: [], imageUrl: null });

      expect((await s().listCreatures(gmA)).map((x) => x.id)).toEqual([c.id]);
      expect(await s().listCreatures(gmB)).toEqual([]);
      expect(await s().findCreature(c.id, gmB)).toBeNull();
      expect(await s().updateCreature(c.id, gmB, { name: "Stolen" })).toBeNull();
      expect(await s().deleteCreature(c.id, gmB)).toBe(false);
      expect((await s().findCreature(c.id, gmA))?.name).toBe("Goblin");
    });

    it("edits and deletes a creature, newest listed first", async () => {
      const gm = await s().registerGm(randomUUID());
      const older = creature(gm, { createdAt: new Date(Date.now() - 1000).toISOString() });
      const newer = creature(gm, { name: "Orc" });
      await s().createCreature(older);
      await s().createCreature(newer);
      expect((await s().listCreatures(gm)).map((x) => x.name)).toEqual(["Orc", "Goblin"]);

      expect(await s().updateCreature(older.id, gm, { maxHp: 9, ac: null, size: 1.5 }))
        .toMatchObject({ name: "Goblin", maxHp: 9, ac: null, size: 1.5 });
      expect(await s().deleteCreature(older.id, gm)).toBe(true);
      expect((await s().listCreatures(gm)).map((x) => x.name)).toEqual(["Orc"]);
    });

    it("round-trips starting HP, colour and conditions, including legacy defaults (KAN-70)", async () => {
      const gm = await s().registerGm(randomUUID());
      const attacks = [{ name: "Claws", toHit: null, damage: { count: 2, sides: 6, modifier: 1 } }];
      const c = creature(gm, { hp: 3, attacks, color: "#2e7d32", conditions: ["prone"] });
      expect(await s().createCreature(c)).toMatchObject({ hp: 3, maxHp: 7, color: "#2e7d32", conditions: ["prone"] });
      expect(await s().findCreature(c.id, gm)).toMatchObject({ hp: 3, attacks, color: "#2e7d32", conditions: ["prone"] });
      expect(await s().updateCreature(c.id, gm, { hp: 0, conditions: ["poisoned"] }))
        .toMatchObject({ hp: 0, maxHp: 7, color: "#2e7d32", conditions: ["poisoned"] });
      expect(await s().updateCreature(c.id, gm, { hp: null, attacks: [] })).toMatchObject({ hp: null, attacks: [], maxHp: 7 });
    });

    it("links token art, reports it, and keeps the creature without it when the art is deleted", async () => {
      const gm = await s().registerGm(randomUUID());
      const art = asset(gm, { kind: "token", grid: null, url: "/uploads/goblin.webp" });
      await s().createAsset(art);
      const c = creature(gm, { imageAssetId: art.id });
      expect((await s().createCreature(c)).imageUrl).toBe("/uploads/goblin.webp");
      expect(await s().creaturesUsingImage(art.id, gm)).toEqual([{ id: c.id, name: "Goblin" }]);

      await s().deleteAsset(art.id, gm);
      expect(await s().findCreature(c.id, gm)).toMatchObject({ name: "Goblin", maxHp: 7, imageAssetId: null, imageUrl: null });
      expect(await s().creaturesUsingImage(art.id, gm)).toEqual([]);
    });

    it("refuses to link art that does not exist", async () => {
      const gm = await s().registerGm(randomUUID());
      await expect(s().createCreature(creature(gm, { imageAssetId: randomUUID() }))).rejects.toBeInstanceOf(CreatureImageMissingError);
      expect(await s().listCreatures(gm)).toEqual([]);
      const c = creature(gm);
      await s().createCreature(c);
      await expect(s().updateCreature(c.id, gm, { imageAssetId: randomUUID() })).rejects.toBeInstanceOf(CreatureImageMissingError);
      expect((await s().findCreature(c.id, gm))?.imageAssetId).toBeNull();
    });

    const encounter = (ownerGmId: string, mapAssetId: string | null, overrides: Partial<NewEncounterRecord> = {}): NewEncounterRecord => ({
      id: randomUUID(),
      ownerGmId,
      name: "Goblin ambush",
      version: ENCOUNTER_TEMPLATE_VERSION,
      data: { map: { assetId: mapAssetId ?? randomUUID(), width: 100, height: 100 }, grid: DEFAULT_GRID, tokens: [], fog: [] },
      mapAssetId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    });

    it("scopes every encounter template read and write to its owner (encounter-templates, FR-GM-13)", async () => {
      const [a, b] = [await s().registerGm(randomUUID()), await s().registerGm(randomUUID())];
      const map = asset(a);
      await s().createAsset(map);
      const e = encounter(a, map.id);
      await s().createEncounter(e, 50);
      expect(await s().findEncounter(e.id, a)).toMatchObject({ id: e.id, mapName: map.name, mapUrl: map.url });
      expect(await s().findEncounter(e.id, b)).toBeNull();
      expect(await s().listEncounters(b)).toEqual([]);
      expect(await s().renameEncounter(e.id, b, "Mine", new Date().toISOString())).toBeNull();
      expect(await s().deleteEncounter(e.id, b)).toBe(false);
      expect(await s().countEncounters(a)).toBe(1);
      expect(await s().countEncounters(b)).toBe(0);
      expect(await s().encountersUsingMap(map.id, b)).toEqual([]);
      expect(await s().encountersUsingMap(map.id, a)).toEqual([{ id: e.id, name: "Goblin ambush" }]);
    });

    it("renames and deletes an encounter template, newest listed first", async () => {
      const gm = await s().registerGm(randomUUID());
      const map = asset(gm);
      await s().createAsset(map);
      const older = encounter(gm, map.id, { name: "Older", createdAt: "2026-10-01T00:00:00.000Z" });
      const newer = encounter(gm, map.id, { name: "Newer", createdAt: "2026-10-02T00:00:00.000Z" });
      await s().createEncounter(older, 50);
      await s().createEncounter(newer, 50);
      expect((await s().listEncounters(gm)).map((x) => x.name)).toEqual(["Newer", "Older"]);
      expect(await s().renameEncounter(older.id, gm, "Renamed", "2026-10-03T00:00:00.000Z")).toMatchObject({ name: "Renamed", updatedAt: "2026-10-03T00:00:00.000Z" });
      expect(await s().deleteEncounter(newer.id, gm)).toBe(true);
      expect(await s().deleteEncounter(newer.id, gm)).toBe(false);
      expect((await s().listEncounters(gm)).map((x) => x.name)).toEqual(["Renamed"]);
    });

    it("holds an owner to the template limit even when saves arrive together (encounter-templates, FR-GM-13)", async () => {
      const gm = await s().registerGm(randomUUID());
      const map = asset(gm);
      await s().createAsset(map);
      for (let i = 0; i < 2; i++) await s().createEncounter(encounter(gm, map.id), 3);
      const results = await Promise.allSettled([0, 1, 2, 3].map(() => s().createEncounter(encounter(gm, map.id), 3)));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(EncounterLimitError);
      expect(await s().countEncounters(gm)).toBe(3);
      // Another owner is not held to this owner's count.
      const other = await s().registerGm(randomUUID());
      const otherMap = asset(other);
      await s().createAsset(otherMap);
      await expect(s().createEncounter(encounter(other, otherMap.id), 3)).resolves.toBeTruthy();
    });

    it("reads an id that is not a uuid as no template", async () => {
      const gm = await s().registerGm(randomUUID());
      expect(await s().findEncounter("not-a-uuid", gm)).toBeNull();
      expect(await s().renameEncounter("not-a-uuid", gm, "x", new Date().toISOString())).toBeNull();
      expect(await s().deleteEncounter("not-a-uuid", gm)).toBe(false);
    });

    it("keeps an encounter template without its map when the map is deleted, and refuses a map that does not exist", async () => {
      const gm = await s().registerGm(randomUUID());
      const map = asset(gm);
      await s().createAsset(map);
      const e = encounter(gm, map.id);
      await s().createEncounter(e, 50);
      await s().deleteAsset(map.id, gm);
      expect(await s().findEncounter(e.id, gm)).toMatchObject({ id: e.id, mapAssetId: null, mapName: null, mapUrl: null });
      await expect(s().createEncounter(encounter(gm, randomUUID()), 50)).rejects.toBeInstanceOf(EncounterMapMissingError);
    });
  });
}
