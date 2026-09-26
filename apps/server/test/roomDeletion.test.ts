import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GM_TOKEN_HEADER,
  type GmRoomSummary,
  type LibraryAsset,
  type LibraryUsageResponse,
  type UploadResponse,
} from "@vtt/shared";
import { buildApp } from "../src/app";
import { MemoryRoomStore } from "../src/store/memoryRoomStore";
import { newGuestToken, startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

/** 1x1 transparent PNG. The server checks the declared type; bytes just need to exist. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

async function newGm() {
  const gmToken = newGuestToken();
  const res = await fetch(`${server.base}/api/gm/identify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gmToken }),
  });
  expect(res.status).toBe(204);
  return gmToken;
}

const gmFetch = (gmToken: string | null, url: string, init: RequestInit = {}) =>
  fetch(server.base + url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), ...(gmToken ? { [GM_TOKEN_HEADER]: gmToken } : {}) },
  });

const deleteRoom = (gmToken: string | null, roomId: string, headers: Record<string, string> = {}) =>
  gmFetch(gmToken, `/api/rooms/${roomId}`, { method: "DELETE", headers });

const imageForm = (fields: Record<string, string> = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([PNG], { type: "image/png" }), "art.png");
  return form;
};

/** A room owned by `gmToken`, with its GM connected. */
async function gmRoom(gmToken: string, roomName: string) {
  const room = await server.createRoom("GM", { gmToken, roomName });
  const client = await server.connect(room);
  clients.push(client);
  return { ...room, client };
}

describe("room deletion: authorization (KAN-72, FR-GM-15)", () => {
  it("lets the owning GM delete the room", async () => {
    const gm = await newGm();
    const room = await gmRoom(gm, "Crypt");
    expect((await deleteRoom(gm, room.roomId)).status).toBe(204);
    const rooms = (await (await gmFetch(gm, "/api/gm/rooms")).json()) as GmRoomSummary[];
    expect(rooms).toEqual([]);
  });

  it("answers another GM with 404, the same as for a missing room, and deletes nothing", async () => {
    const owner = await newGm();
    const other = await newGm();
    const room = await gmRoom(owner, "Crypt");

    const theirs = await deleteRoom(other, room.roomId);
    const missing = await deleteRoom(other, "00000000-0000-4000-8000-000000000000");
    expect(theirs.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await theirs.json()).toEqual(await missing.json());
    expect(await server.store.roomExists(room.roomId)).toBe(true);
  });

  it("refuses a request with no GM identity, or only the room's own GM guest credential", async () => {
    const gm = await newGm();
    const room = await gmRoom(gm, "Crypt");
    expect((await deleteRoom(null, room.roomId)).status).toBe(401);
    expect((await deleteRoom(newGuestToken(), room.roomId)).status).toBe(401);
    expect((await deleteRoom(null, room.roomId, { authorization: `Bearer ${room.guestToken}` })).status).toBe(401);
    expect(await server.store.roomExists(room.roomId)).toBe(true);
  });

  it("answers a second delete, and a malformed id, with 404", async () => {
    const gm = await newGm();
    const room = await gmRoom(gm, "Crypt");
    expect((await deleteRoom(gm, room.roomId)).status).toBe(204);
    expect((await deleteRoom(gm, room.roomId)).status).toBe(404);
    expect((await deleteRoom(gm, "not-a-uuid")).status).toBe(404);
  });

  it("does not delete a room that has no owner", async () => {
    const gm = await newGm();
    const room = await server.createRoom("GM", { roomName: "Unowned" });
    expect((await deleteRoom(gm, room.roomId)).status).toBe(404);
    expect(await server.store.roomExists(room.roomId)).toBe(true);
  });
});

describe("room deletion: what is removed and what is kept (KAN-72)", () => {
  it("removes the room's data and uploads, and keeps library assets and the GM's other rooms", async () => {
    const gm = await newGm();
    const crypt = await gmRoom(gm, "Crypt");
    const keep = await gmRoom(gm, "Keep");
    const player = await server.join(crypt.inviteCode, "Alice");

    const mapRes = await gmFetch(gm, "/api/library", {
      method: "POST",
      body: imageForm({ kind: "map", name: "Cave", width: "100", height: "100" }),
    });
    expect(mapRes.status).toBe(201);
    const map = (await mapRes.json()) as LibraryAsset;
    for (const { client } of [crypt, keep]) {
      await client.command({
        type: "scene.setMap",
        map: { url: map.url, width: map.width, height: map.height, assetId: map.id },
        grid: map.grid!,
      });
    }

    const uploadRes = await fetch(`${server.base}/api/uploads`, {
      method: "POST",
      headers: { authorization: `Bearer ${crypt.guestToken}` },
      body: imageForm(),
    });
    expect(uploadRes.status).toBe(200);
    const { url: tokenUrl } = (await uploadRes.json()) as UploadResponse;
    expect((await fetch(server.base + tokenUrl)).status).toBe(200);
    const created = await crypt.client.command({
      type: "token.create", name: "Goblin", position: { x: 0, y: 0 }, imageUrl: tokenUrl,
    });
    expect(created.type).toBe("ack");
    const usage = async () =>
      ((await (await gmFetch(gm, `/api/library/${map.id}/usage`)).json()) as LibraryUsageResponse).rooms;
    expect((await usage()).map((r) => r.name).sort()).toEqual(["Crypt", "Keep"]);

    expect((await deleteRoom(gm, crypt.roomId)).status).toBe(204);

    // Gone: the room, its history, its uploaded image, its invite and its credentials.
    expect(await server.store.roomExists(crypt.roomId)).toBe(false);
    expect(await server.store.loadEvents(crypt.roomId)).toEqual([]);
    const history = await fetch(`${server.base}/api/rooms/${crypt.roomId}/history`, {
      headers: { authorization: `Bearer ${crypt.guestToken}` },
    });
    expect(history.status).toBe(403);
    expect((await fetch(server.base + tokenUrl)).status).toBe(404);
    expect((await server.tryJoin(crypt.inviteCode, "Bob")).status).toBe(404);
    await expect(server.connect({ roomId: crypt.roomId, guestToken: player.guestToken })).rejects.toThrow("unauthorized");

    // Kept: the library asset (still served) and the GM's other room.
    const library = (await (await gmFetch(gm, "/api/library")).json()) as LibraryAsset[];
    expect(library.map((a) => a.id)).toEqual([map.id]);
    expect((await fetch(server.base + map.url)).status).toBe(200);
    expect(await usage()).toEqual([{ id: keep.roomId, name: "Keep" }]);
    const rooms = (await (await gmFetch(gm, "/api/gm/rooms")).json()) as GmRoomSummary[];
    expect(rooms.map((r) => r.id)).toEqual([keep.roomId]);
    expect(keep.client.state.scene.map?.assetId).toBe(map.id);
    expect((await server.tryJoin(keep.inviteCode, "Bob")).status).toBe(200);
  });
});

describe("room deletion: people in the room (KAN-72)", () => {
  it("ends every connected session with `deleted` and refuses a reconnect", async () => {
    const gm = await newGm();
    const room = await gmRoom(gm, "Crypt");
    const player = await server.join(room.inviteCode, "Alice");
    const alice = await server.connect({ roomId: room.roomId, guestToken: player.guestToken });
    clients.push(alice);

    expect((await deleteRoom(gm, room.roomId)).status).toBe(204);

    for (const client of [room.client, alice]) {
      expect(await client.waitFor((m) => m.type === "sessionEnded")).toEqual({ type: "sessionEnded", reason: "deleted" });
      expect(await client.disconnected).toBe("io server disconnect");
    }
    await expect(server.connect({ roomId: room.roomId, guestToken: room.guestToken })).rejects.toThrow("unauthorized");
  });

  it("does not commit a command sent after deletion has begun", async () => {
    const gm = await newGm();
    const room = await gmRoom(gm, "Crypt");
    const deleting = deleteRoom(gm, room.roomId);
    const late = room.client.command({ type: "token.create", name: "Late", position: { x: 0, y: 0 } });

    expect((await deleting).status).toBe(204);
    // Queued before the close: it commits, then the delete erases it. Queued after: refused.
    // Or the socket closed first and no reply came. In every case nothing survives.
    await late.then((reply) => expect(["ack", "rejected"]).toContain(reply.type), () => undefined);
    expect(await server.store.loadEvents(room.roomId)).toEqual([]);
  });
});

describe("room deletion: uploads racing the delete (KAN-72)", () => {
  it("removes a stored upload whose room record could not be written", async () => {
    /** As when the room is deleted between the upload's auth check and its record. */
    class RoomGoneStore extends MemoryRoomStore {
      override async recordRoomUpload(): Promise<void> {
        throw new Error("room deleted");
      }
    }
    const uploadDir = await mkdtemp(path.join(tmpdir(), "vtt-uploads-"));
    const app = await buildApp({ store: new RoomGoneStore(), uploadDir, clientOrigin: "*" });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    if (!addr || typeof addr === "string") throw new Error("no address");
    const base = `http://127.0.0.1:${addr.port}`;
    try {
      const guestToken = newGuestToken();
      const created = await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomName: "Crypt", displayName: "GM", guestToken }),
      });
      expect(created.status).toBe(200);

      const res = await fetch(`${base}/api/uploads`, {
        method: "POST",
        headers: { authorization: `Bearer ${guestToken}` },
        body: imageForm(),
      });
      expect(res.status).toBe(500);
      expect(await readdir(uploadDir)).toEqual([]);
    } finally {
      await app.close();
    }
  });
});
