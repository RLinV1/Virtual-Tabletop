import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { storeCases } from "./storeHarness";

describe.each(storeCases)("membership store, %s (room-membership, ADR 0017 M1)", (_name, makeStore) => {
  const store = makeStore();
  const newUser = async () =>
    (await store.createUser({ id: randomUUID(), email: `${randomUUID()}@x.com`, displayName: "K", passwordHash: "x" })).id;
  const newRoom = async () => {
    const roomId = randomUUID();
    await store.createRoom(roomId, randomUUID().slice(0, 10));
    return roomId;
  };
  const newSession = async (userId: string) => {
    const tokenHash = randomUUID();
    const now = new Date().toISOString();
    await store.createSession({ tokenHash, userId, createdAt: now, lastSeenAt: now, expiresAt: new Date(Date.now() + 1e9).toISOString() });
    return tokenHash;
  };

  it("keeps one seat per person per room, re-pointing it when they join again", async () => {
    const [kim, roomId] = [await newUser(), await newRoom()];
    const first = randomUUID();
    const second = randomUUID();
    await store.putMember({ roomId, participantId: first, userId: kim });
    expect(await store.findMember(roomId, kim)).toEqual({ roomId, participantId: first, userId: kim });
    await store.putMember({ roomId, participantId: second, userId: kim });
    expect(await store.findMember(roomId, kim)).toEqual({ roomId, participantId: second, userId: kim });
    expect(await store.findMemberByParticipant(roomId, first)).toBeNull();
    expect(await store.listMemberships(kim)).toEqual([{ roomId, participantId: second, userId: kim }]);
  });

  it("removes the room's seats with the room", async () => {
    const [kim, roomId] = [await newUser(), await newRoom()];
    await store.putMember({ roomId, participantId: randomUUID(), userId: kim });
    await store.deleteRoom(roomId);
    expect(await store.listMemberships(kim)).toEqual([]);
  });

  it("keeps a guest seat on the account and binds its credential to the session (M3, M4)", async () => {
    const [kim, roomId] = [await newUser(), await newRoom()];
    const session = await newSession(kim);
    const participantId = randomUUID();
    await store.saveCredential("guest-cred", { roomId, participantId });
    expect(await store.keepSeat({ roomId, participantId, userId: kim }, "guest-cred", session)).toBeNull();
    expect(await store.findMemberByParticipant(roomId, participantId)).toMatchObject({ userId: kim });
    expect((await store.findCredential("guest-cred"))!.sessionHash).toBe(session);
    await store.deleteSession(session);
    expect(await store.findCredential("guest-cred")).toBeNull();
  });

  it("refuses to keep a seat when the account already holds one here, or the seat is someone else's", async () => {
    const [kim, sam, roomId] = [await newUser(), await newUser(), await newRoom()];
    const kimSeat = randomUUID();
    await store.putMember({ roomId, participantId: kimSeat, userId: kim });
    const other = randomUUID();
    await store.saveCredential("other-cred", { roomId, participantId: other });
    expect(await store.keepSeat({ roomId, participantId: other, userId: kim }, "other-cred", await newSession(kim))).toBe(
      "account_has_seat",
    );
    expect(await store.keepSeat({ roomId, participantId: kimSeat, userId: sam }, "other-cred", await newSession(sam))).toBe(
      "seat_taken",
    );
    expect(await store.findMemberByParticipant(roomId, other)).toBeNull();
    expect((await store.findCredential("other-cred"))!.sessionHash ?? null).toBeNull();
  });
});
