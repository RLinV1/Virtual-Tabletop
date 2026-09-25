import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresRoomStore } from "../src/store/postgresRoomStore";
import { SeqConflictError } from "../src/store/roomStore";

/**
 * Exercises the real Postgres store. Skipped unless DATABASE_URL is set, so a checkout
 * with no containers running still gets a green `pnpm test`:
 *
 *   docker compose up -d postgres
 *   DATABASE_URL=postgres://vtt:vtt@localhost:5432/vtt pnpm --filter @vtt/server test
 */
const url = process.env.DATABASE_URL;
const store = url ? await PostgresRoomStore.connect(url) : null;

afterAll(async () => {
  await store?.close();
});

describe.skipIf(!store)("PostgresRoomStore (docs/adr/0001-event-model.md)", () => {
  const newRoom = async () => {
    const roomId = randomUUID();
    await store!.createRoom(roomId, randomUUID().slice(0, 10));
    return roomId;
  };

  it("assigns consecutive seqs and reads them back in order (FR-SYNC-04)", async () => {
    const roomId = await newRoom();
    const committed = await store!.append(roomId, 0, [
      { actorId: null, event: { type: "RoomCreated", name: "One" } },
      { actorId: null, event: { type: "RoomCreated", name: "Two" } },
    ]);

    expect(committed.map((c) => c.seq)).toEqual([1, 2]);
    const loaded = await store!.loadEvents(roomId);
    expect(loaded.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("rejects an append whose expected last seq is stale, writing nothing", async () => {
    const roomId = await newRoom();
    await store!.append(roomId, 0, [{ actorId: null, event: { type: "RoomCreated", name: "One" } }]);

    await expect(
      store!.append(roomId, 0, [{ actorId: null, event: { type: "RoomCreated", name: "Clash" } }]),
    ).rejects.toBeInstanceOf(SeqConflictError);

    // The whole append is one transaction, so the losing writer leaves no partial rows.
    expect((await store!.loadEvents(roomId)).map((e) => e.seq)).toEqual([1]);
  });

  it("resolves a credential by hash and treats a revoked one as absent (FR-GM-20)", async () => {
    const roomId = await newRoom();
    const participantId = randomUUID();
    const hash = randomUUID().replace(/-/g, "");

    await store!.saveCredential(hash, { roomId, participantId });
    expect(await store!.findCredential(hash)).toEqual({ roomId, participantId });
    expect(await store!.findCredential("unknown")).toBeNull();
    expect(await store!.findRevokedCredential(hash)).toBeNull();

    await store!.revokeCredentials(roomId, participantId);
    expect(await store!.findCredential(hash)).toBeNull();
    expect(await store!.findRevokedCredential(hash)).toEqual({ roomId, participantId });
  });

  it("replaces a room's invite code; the old one stops resolving (FR-GM-20)", async () => {
    const roomId = randomUUID();
    const oldCode = randomUUID().slice(0, 10);
    await store!.createRoom(roomId, oldCode);
    expect(await store!.getInviteCode(roomId)).toBe(oldCode);

    // A colliding code is retried: the first candidate belongs to another room.
    const taken = randomUUID().slice(0, 10);
    await store!.createRoom(randomUUID(), taken);
    const fresh = randomUUID().slice(0, 10);
    const candidates = [taken, fresh];
    expect(await store!.setInviteCode(roomId, () => candidates.shift()!)).toBe(fresh);

    expect(await store!.findRoomByInvite(oldCode)).toBeNull();
    expect(await store!.findRoomByInvite(fresh)).toBe(roomId);
    expect(await store!.getInviteCode(roomId)).toBe(fresh);
  });
});
