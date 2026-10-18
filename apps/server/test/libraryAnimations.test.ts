import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_LIBRARY_ANIMATIONS, type AnimationDef, type LibraryAnimation } from "@vtt/shared";
import { newGuestToken, startServer } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  await server.close();
});

const slash: AnimationDef = { shape: "slash", duration: 0.8, primary: "#ff8800", secondary: "#ffd27a", size: 1, particles: 40, glow: 0.6, shake: 0.3, flash: 0.2 };

const newGm = async () => (await server.signUp()).cookie;

const gmFetch = (cookie: string | null, url: string, init: { method?: string; body?: unknown } = {}) =>
  fetch(server.base + url, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });

const create = (gm: string, body: object) => gmFetch(gm, "/api/library/animations", { method: "POST", body });
const list = async (gm: string) => (await (await gmFetch(gm, "/api/library/animations")).json()) as LibraryAnimation[];

describe("library animations (library-animations, ADR 0038)", () => {
  it("creates, lists, edits and deletes an animation", async () => {
    const gm = await newGm();
    const res = await create(gm, { name: "Fire blade", def: slash });
    expect(res.status).toBe(201);
    const fire = (await res.json()) as LibraryAnimation;
    expect(fire).toMatchObject({ name: "Fire blade", def: { shape: "slash", particles: 40 } });
    expect(JSON.stringify(fire)).not.toContain("ownerGmId");
    expect((await list(gm)).map((a) => a.name)).toEqual(["Fire blade"]);

    const edited = await gmFetch(gm, `/api/library/animations/${fire.id}`, { method: "PATCH", body: { name: "Ice blade", def: { ...slash, primary: "#44aaff" } } });
    expect(await edited.json()).toMatchObject({ name: "Ice blade", def: { primary: "#44aaff" } });

    expect((await gmFetch(gm, `/api/library/animations/${fire.id}`, { method: "DELETE" })).status).toBe(204);
    expect(await list(gm)).toEqual([]);
  });

  it("rejects out-of-range definitions and stores nothing", async () => {
    const gm = await newGm();
    for (const def of [
      { ...slash, particles: 500 },
      { ...slash, duration: 60 },
      { ...slash, primary: "red" },
      { ...slash, shape: "laser" },
    ]) {
      expect((await create(gm, { name: "Bad", def })).status).toBe(400);
    }
    expect((await create(gm, { name: "", def: slash })).status).toBe(400);
    const ok = (await (await create(gm, { name: "Ok", def: slash })).json()) as LibraryAnimation;
    expect((await gmFetch(gm, `/api/library/animations/${ok.id}`, { method: "PATCH", body: {} })).status).toBe(400);
    expect((await gmFetch(gm, `/api/library/animations/${ok.id}`, { method: "PATCH", body: { def: { ...slash, glow: 3 } } })).status).toBe(400);
    expect(await list(gm)).toHaveLength(1);
  });

  it("answers 401 to a guest credential and 404 to another GM", async () => {
    const guest = await fetch(`${server.base}/api/library/animations`, { headers: { authorization: `Bearer ${newGuestToken()}` } });
    expect(guest.status).toBe(401);
    expect((await create(null as never, { name: "x", def: slash })).status).toBe(401);

    const gmA = await newGm();
    const gmB = await newGm();
    const mine = (await (await create(gmA, { name: "Mine", def: slash })).json()) as LibraryAnimation;
    expect(await list(gmB)).toEqual([]);
    expect((await gmFetch(gmB, `/api/library/animations/${mine.id}`, { method: "PATCH", body: { name: "Stolen" } })).status).toBe(404);
    expect((await gmFetch(gmB, `/api/library/animations/${mine.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await gmFetch(gmB, "/api/library/animations/not-a-uuid", { method: "DELETE" })).status).toBe(404);
    expect((await list(gmA))[0]?.name).toBe("Mine");
  });

  it("holds at most the per-GM limit", async () => {
    const gm = await newGm();
    for (let i = 0; i < MAX_LIBRARY_ANIMATIONS; i++) {
      expect((await create(gm, { name: `A${i}`, def: slash })).status).toBe(201);
    }
    expect((await create(gm, { name: "One too many", def: slash })).status).toBe(400);
    expect(await list(gm)).toHaveLength(MAX_LIBRARY_ANIMATIONS);
  });
});
