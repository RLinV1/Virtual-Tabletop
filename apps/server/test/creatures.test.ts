import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type LibraryAsset, type LibraryCreature, type LibraryUsageResponse } from "@vtt/shared";
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

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const IMAGE_REJECTED = "Image must be your own token art";

/** A signed-in GM: the value tests pass around is the account's session cookie. */
async function newGm() {
  return (await server.signUp()).cookie;
}

const gmFetch = (cookie: string | null, url: string, init: { method?: string; body?: unknown } = {}) =>
  fetch(server.base + url, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });

async function upload(cookie: string, kind: "map" | "token", name: string) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("name", name);
  form.append("width", "256");
  form.append("height", "256");
  form.append("file", new Blob([PNG], { type: "image/png" }), "a.png");
  const res = await fetch(`${server.base}/api/library`, { method: "POST", headers: { cookie }, body: form });
  return (await res.json()) as LibraryAsset;
}

const create = (gm: string, body: object) => gmFetch(gm, "/api/library/creatures", { method: "POST", body });
const list = async (gm: string) => (await (await gmFetch(gm, "/api/library/creatures")).json()) as LibraryCreature[];

describe("library creatures (library-creatures, FR-TAC-07)", () => {
  it("creates, lists, edits and deletes a creature", async () => {
    const gm = await newGm();
    const art = await upload(gm, "token", "Goblin art");
    const res = await create(gm, { name: "Goblin", maxHp: 7, ac: 15, imageAssetId: art.id });
    expect(res.status).toBe(201);
    const goblin = (await res.json()) as LibraryCreature;
    expect(goblin).toMatchObject({ name: "Goblin", size: 1, maxHp: 7, ac: 15, imageAssetId: art.id, imageUrl: art.url });
    expect(JSON.stringify(goblin)).not.toContain("ownerGmId");

    const rubble = (await (await create(gm, { name: "Rubble" })).json()) as LibraryCreature;
    expect(rubble).toMatchObject({ size: 1, maxHp: null, ac: null, imageAssetId: null, imageUrl: null });
    expect((await list(gm)).map((c) => c.name).sort()).toEqual(["Goblin", "Rubble"]);

    const edited = await gmFetch(gm, `/api/library/creatures/${goblin.id}`, { method: "PATCH", body: { maxHp: 9, size: 2 } });
    expect(await edited.json()).toMatchObject({ name: "Goblin", maxHp: 9, size: 2, ac: 15 });

    expect((await gmFetch(gm, `/api/library/creatures/${goblin.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await list(gm)).map((c) => c.name)).toEqual(["Rubble"]);
  });

  it("rejects out-of-range values and stores nothing", async () => {
    const gm = await newGm();
    for (const bad of [{ name: "" }, { name: "Ogre", maxHp: 0 }, { name: "Ogre", ac: 120 }, { name: "Ogre", size: 11 }, {}]) {
      expect((await create(gm, bad)).status).toBe(400);
    }
    const ok = (await (await create(gm, { name: "Ogre" })).json()) as LibraryCreature;
    expect((await gmFetch(gm, `/api/library/creatures/${ok.id}`, { method: "PATCH", body: {} })).status).toBe(400);
    expect((await gmFetch(gm, `/api/library/creatures/${ok.id}`, { method: "PATCH", body: { maxHp: -3 } })).status).toBe(400);
    expect(await list(gm)).toHaveLength(1);
  });

  it("answers 401 to a guest credential and 404 to another GM", async () => {
    const guest = await fetch(`${server.base}/api/library/creatures`, { headers: { authorization: `Bearer ${newGuestToken()}` } });
    expect(guest.status).toBe(401);
    expect((await gmFetch(null, "/api/library/creatures", { method: "POST", body: { name: "x" } })).status).toBe(401);

    const gmA = await newGm();
    const gmB = await newGm();
    const mine = (await (await create(gmA, { name: "Goblin" })).json()) as LibraryCreature;
    expect(await list(gmB)).toEqual([]);
    expect((await gmFetch(gmB, `/api/library/creatures/${mine.id}`, { method: "PATCH", body: { name: "Stolen" } })).status).toBe(404);
    expect((await gmFetch(gmB, `/api/library/creatures/${mine.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await gmFetch(gmB, "/api/library/creatures/not-a-uuid", { method: "DELETE" })).status).toBe(404);
    expect((await list(gmA))[0]?.name).toBe("Goblin");
  });

  it("gives the same 400 for another GM's art, a map, and an unknown id", async () => {
    const gmA = await newGm();
    const gmB = await newGm();
    const theirs = await upload(gmB, "token", "Theirs");
    const map = await upload(gmA, "map", "Cave");
    const mine = (await (await create(gmA, { name: "Goblin" })).json()) as LibraryCreature;

    for (const imageAssetId of [theirs.id, map.id, randomUUID()]) {
      const created = await create(gmA, { name: "Thief", imageAssetId });
      expect(created.status).toBe(400);
      expect(await created.json()).toEqual({ error: IMAGE_REJECTED });
      const patched = await gmFetch(gmA, `/api/library/creatures/${mine.id}`, { method: "PATCH", body: { imageAssetId } });
      expect(patched.status).toBe(400);
      expect(await patched.json()).toEqual({ error: IMAGE_REJECTED });
    }
    expect((await list(gmA)).map((c) => [c.name, c.imageAssetId])).toEqual([["Goblin", null]]);
  });

  it("lists creatures in the art's usage, then keeps them without it when the art is deleted", async () => {
    const gm = await newGm();
    const art = await upload(gm, "token", "Goblin art");
    const goblin = (await (await create(gm, { name: "Goblin", maxHp: 7, imageAssetId: art.id })).json()) as LibraryCreature;
    const boss = (await (await create(gm, { name: "Goblin Boss", maxHp: 21, imageAssetId: art.id })).json()) as LibraryCreature;

    const usage = (await (await gmFetch(gm, `/api/library/${art.id}/usage`)).json()) as LibraryUsageResponse;
    expect(usage.rooms).toEqual([]);
    expect(usage.creatures.map((c) => c.id).sort()).toEqual([goblin.id, boss.id].sort());

    expect((await gmFetch(gm, `/api/library/${art.id}`, { method: "DELETE" })).status).toBe(204);
    const after = await list(gm);
    const byName = [...after].sort((x, y) => x.name.localeCompare(y.name));
    expect(byName.map((c) => [c.name, c.maxHp, c.imageAssetId, c.imageUrl])).toEqual([
      ["Goblin", 7, null, null],
      ["Goblin Boss", 21, null, null],
    ]);
  });

  it("places as an ordinary token that carries the art's id and no creature id", async () => {
    const gm = await newGm();
    const art = await upload(gm, "token", "Goblin art");
    const goblin = (await (await create(gm, { name: "Goblin", maxHp: 7, ac: 15, imageAssetId: art.id })).json()) as LibraryCreature;
    const creds = await server.createRoom("GM", { cookie: gm, roomName: "Cave" });
    const client = await server.connect(creds);
    clients.push(client);

    // What Add Token sends after "From creature": the creature's values, HP starting full.
    let seq = 0;
    for (let i = 0; i < 3; i++) {
      const placed = await client.command({
        type: "token.create", name: goblin.name, position: { x: 35 + i * 70, y: 35 }, size: goblin.size,
        stats: { hp: goblin.maxHp, maxHp: goblin.maxHp, ac: goblin.ac },
        imageUrl: goblin.imageUrl, assetId: goblin.imageAssetId,
      });
      expect(placed.type).toBe("ack");
      seq = (placed as { seq: number }).seq;
    }
    await client.waitForSeq(seq);

    const tokens = Object.values(client.state.tokens);
    expect(tokens.map((t) => t.name).sort()).toEqual(["Goblin", "Goblin 2", "Goblin 3"]);
    expect(tokens[0]).toMatchObject({ size: 1, stats: { hp: 7, maxHp: 7, ac: 15 }, imageUrl: art.url, assetId: art.id });
    expect(client.rawLog.join("\n")).not.toContain(goblin.id);

    const usage = (await (await gmFetch(gm, `/api/library/${art.id}/usage`)).json()) as LibraryUsageResponse;
    expect(usage.rooms.map((r) => r.name)).toEqual(["Cave"]);
  });
});
