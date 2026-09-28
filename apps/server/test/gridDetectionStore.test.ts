import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_GRID } from "@vtt/shared";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import type { RoomStore } from "../src/store/roomStore";

const postgres = process.env.DATABASE_URL ? await PostgresRoomStore.connect(process.env.DATABASE_URL) : null;
afterAll(async () => { await postgres?.close(); });

for (const [name, store] of [["memory", new MemoryRoomStore()], ["postgres", postgres]] as [string, RoomStore | null][]) {
  describe.skipIf(!store)(`grid detection store: ${name}`, () => {
    const s = () => store!;
    const candidate = { cellSize: 48, offsetX: 11, offsetY: 17, confidence: 0.81 };

    it("persists a library suggestion, conditionally retries errors, and deletes analysis with the asset", async () => {
      const ownerGmId = await s().registerGm(randomUUID());
      const id = randomUUID();
      const target = { scope: "library" as const, id };
      await s().createAsset({
        id, ownerGmId, kind: "map", objectKey: `${id}.png`, url: `/uploads/${id}.png`,
        name: "Map", width: 768, height: 648, grid: DEFAULT_GRID, createdAt: new Date().toISOString(),
        detectionStatus: "queued", detectionAttempt: 1,
      });
      expect((await s().findDetection(target))?.status).toBe("queued");
      expect(await s().markDetectionRunning(target, 1)).toBe(true);
      expect(await s().markDetectionRunning(target, 1)).toBe(false);
      expect(await s().finishDetection(target, 1, { status: "suggested", candidate })).toBe(true);
      expect((await s().findDetection(target))?.candidate).toEqual(candidate);
      expect(await s().retryDetection(target)).toBeNull();
      expect((await s().findAsset(id, ownerGmId))?.grid).toEqual(DEFAULT_GRID);
      await s().deleteAsset(id, ownerGmId);
      expect(await s().findDetection(target)).toBeNull();
    });

    it("recovers queued room maps, rejects stale attempts, and deletes analysis with the room", async () => {
      const roomId = randomUUID();
      const objectKey = `${randomUUID()}.png`;
      const target = { scope: "room" as const, roomId, objectKey };
      await s().createRoom(roomId, randomUUID().slice(0, 10));
      await s().recordRoomUpload(roomId, objectKey, "map", 768, 648);
      expect((await s().findDetection(target))?.status).toBe("queued");
      expect((await s().recoverDetections()).some((job) => job.target.scope === "room"
        && job.target.roomId === roomId && job.attempt === 1)).toBe(true);
      expect(await s().markDetectionRunning(target, 1)).toBe(true);
      expect(await s().finishDetection(target, 1, { status: "error" })).toBe(true);
      expect((await Promise.all([s().retryDetection(target), s().retryDetection(target)])).filter(Boolean)).toEqual([2]);
      expect(await s().finishDetection(target, 1, { status: "no_grid" })).toBe(false);
      expect(await s().markDetectionRunning(target, 2)).toBe(true);
      expect(await s().finishDetection(target, 2, { status: "no_grid" })).toBe(true);
      expect((await s().findDetection(target))?.status).toBe("no_grid");
      await s().deleteRoom(roomId);
      expect(await s().findDetection(target)).toBeNull();
    });
  });
}
