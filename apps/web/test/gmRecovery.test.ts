import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GM_TOKEN_HEADER } from "@vtt/shared";
import { api } from "../src/net/api";
import { getGmToken } from "../src/net/gm";

/** A browser that already holds a GM token from before the server's store was wiped. */
const STORED = "stored-gm-token-0123456789abcdef";

interface Sent {
  url: string;
  gmHeader: string | undefined;
  body: unknown;
}

/**
 * Stands in for the server's GM routes. It starts knowing no tokens, like a fresh
 * Postgres after `docker compose down -v`. `forget` makes identify a no-op, for the
 * still-rejected case.
 */
function fakeServer(opts: { forget?: boolean; status?: number } = {}) {
  const registered = new Set<string>();
  const sent: Sent[] = [];
  const fetch = vi.fn(async (input: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    sent.push({ url: input, gmHeader: headers[GM_TOKEN_HEADER], body });
    // Yield so concurrent callers interleave the way real network calls do.
    await Promise.resolve();
    if (input === "/api/gm/identify") {
      if (!opts.forget) registered.add((body as { gmToken: string }).gmToken);
      return new Response(null, { status: 204 });
    }
    if (opts.status) return Response.json({ error: "Asset not found" }, { status: opts.status });
    const token = headers[GM_TOKEN_HEADER];
    if (!token || !registered.has(token)) {
      return Response.json({ error: "GM identity required" }, { status: 401 });
    }
    return Response.json([]);
  });
  const identifies = () => sent.filter((s) => s.url === "/api/gm/identify");
  return { fetch, sent, identifies };
}

function fakeStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage({ "vtt.gm": STORED });
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GM token recovery (gm-identity-recovery)", () => {
  it("re-registers a stored but unregistered token and retries with it", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.fetch);

    const token = await getGmToken();
    expect(token).toBe(STORED);
    await expect(api.library.list(token)).resolves.toEqual([]);

    expect(server.sent.map((s) => s.url)).toEqual(["/api/library", "/api/gm/identify", "/api/library"]);
    expect(server.identifies()[0]?.body).toEqual({ gmToken: STORED });
    const gmCalls = server.sent.filter((s) => s.url !== "/api/gm/identify");
    expect(gmCalls.every((s) => s.gmHeader === STORED)).toBe(true);

    // Recovered: the dashboard's rooms call goes straight through with the same token.
    await expect(api.gm.rooms(token)).resolves.toEqual([]);
    expect(server.identifies()).toHaveLength(1);
  });

  it("never mints a replacement token", async () => {
    vi.stubGlobal("fetch", fakeServer().fetch);
    await api.gm.rooms(STORED);
    expect(storage.getItem("vtt.gm")).toBe(STORED);
    expect(await getGmToken()).toBe(STORED);
  });

  it("gives up after one re-registration if the server still rejects", async () => {
    const server = fakeServer({ forget: true });
    vi.stubGlobal("fetch", server.fetch);
    await expect(api.library.list(STORED)).rejects.toThrow("GM identity required");
    expect(server.identifies()).toHaveLength(1);
    expect(server.sent).toHaveLength(3);
  });

  it("does not re-register on errors other than 401", async () => {
    const server = fakeServer({ status: 404 });
    vi.stubGlobal("fetch", server.fetch);
    await expect(api.library.usage(STORED, "a")).rejects.toThrow("Asset not found");
    expect(server.identifies()).toHaveLength(0);
  });

  it("shares one re-registration between concurrent rejected requests", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.fetch);
    await Promise.all([api.library.list(STORED), api.gm.rooms(STORED)]);
    expect(server.identifies()).toHaveLength(1);
    expect(server.sent.filter((s) => s.url !== "/api/gm/identify")).toHaveLength(4);
  });
});
