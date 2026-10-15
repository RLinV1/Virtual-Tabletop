import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LibraryAsset } from "@vtt/shared";
import { startServer } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.close();
});

/** 1x1 transparent PNG. The server checks the declared type; bytes just need to exist. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const newGm = async () => (await server.signUp()).cookie;

const gmFetch = (cookie: string, url: string, init: RequestInit = {}) =>
  fetch(server.base + url, { ...init, headers: { ...(init.headers as Record<string, string>), cookie } });

async function uploadOk(cookie: string, kind: "map" | "token", name: string, width: number, height: number) {
  const form = new FormData();
  form.append("kind", kind);
  form.append("name", name);
  form.append("width", String(width));
  form.append("height", String(height));
  form.append("file", new Blob([PNG], { type: "image/png" }), "a.png");
  const res = await gmFetch(cookie, "/api/library", { method: "POST", body: form });
  expect(res.status).toBe(201);
  return (await res.json()) as LibraryAsset;
}

const board = {
  walls: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, { a: { x: 100, y: 0 }, b: { x: 100, y: 100 }, portal: { kind: "door", state: "closed" } }],
  fog: [{ shape: "rect", points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }, { x: 0, y: 50 }] }],
};

const put = (cookie: string, id: string, body: unknown) =>
  gmFetch(cookie, `/api/library/${id}/board`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

describe("walls and fog prepared on a library map (asset-library, ADR 0037)", () => {
  it("starts empty, saves, and reads back, without the board riding on the asset", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, "map", "Cave", 1000, 800);
    expect(await (await gmFetch(gm, `/api/library/${map.id}/board`)).json()).toEqual({ walls: [], fog: [] });
    expect((await put(gm, map.id, board)).status).toBe(200);
    expect(await (await gmFetch(gm, `/api/library/${map.id}/board`)).json()).toEqual(board);
    expect(JSON.stringify(await (await gmFetch(gm, "/api/library")).json())).not.toContain("walls");
  });

  it("refuses a board that does not fit the map or is malformed, and keeps the saved one", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, "map", "Cave", 1000, 800);
    expect((await put(gm, map.id, board)).status).toBe(200);
    expect((await put(gm, map.id, { walls: [{ a: { x: 0, y: 0 }, b: { x: 5000, y: 0 } }], fog: [] })).status).toBe(400);
    expect((await put(gm, map.id, { walls: [], fog: [], extra: true })).status).toBe(400);
    expect(await (await gmFetch(gm, `/api/library/${map.id}/board`)).json()).toEqual(board);
  });

  it("accepts a board larger than the 64 kB default body limit", async () => {
    const gm = await newGm();
    const map = await uploadOk(gm, "map", "Cave", 4000, 4000);
    const walls = Array.from({ length: 1500 }, (_, i) => ({ a: { x: i, y: 0 }, b: { x: i, y: 3000.123456 } }));
    expect((await put(gm, map.id, { walls, fog: [] })).status).toBe(200);
  });

  it("answers 404 for another account, a token, or an unknown id", async () => {
    const [a, b] = [await newGm(), await newGm()];
    const map = await uploadOk(a, "map", "Cave", 1000, 800);
    const token = await uploadOk(a, "token", "Orc", 256, 256);
    expect((await gmFetch(b, `/api/library/${map.id}/board`)).status).toBe(404);
    expect((await put(b, map.id, board)).status).toBe(404);
    expect((await gmFetch(a, `/api/library/${token.id}/board`)).status).toBe(404);
    expect((await put(a, token.id, board)).status).toBe(404);
    expect((await put(a, "11111111-1111-4111-8111-111111111111", board)).status).toBe(404);
  });
});
