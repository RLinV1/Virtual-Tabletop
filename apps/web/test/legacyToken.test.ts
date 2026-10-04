import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/net/api";
import { legacyOffer } from "../src/net/legacy";

const STORED = "stored-gm-token-0123456789abcdef";

function installStorage() {
  const data = new Map<string, string>([["vtt.gm", STORED]]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
  return data;
}

/** Only what `legacyOffer` may call: the summary. No identify, no retry, no claim. */
function client(answer: () => Promise<unknown>) {
  const summary = vi.fn(answer);
  const claim = vi.fn();
  return { calls: { summary, claim }, legacy: { summary, claim } as never };
}

describe("a legacy GM token the server doesn't know is forgotten (gm-identity-recovery)", () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = installStorage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forgets an unrecognised token without registering, retrying or replacing it", async () => {
    const c = client(() => Promise.reject(new ApiError("Unknown device identity", 401)));
    expect(await legacyOffer(c)).toBeNull();
    expect(storage.has("vtt.gm")).toBe(false);
    expect(c.calls.summary).toHaveBeenCalledTimes(1);
    expect(c.calls.claim).not.toHaveBeenCalled();
  });

  it("keeps the token through any other failure", async () => {
    for (const err of [new ApiError("Internal error", 500), new ApiError("Not found", 404), new TypeError("offline")]) {
      const c = client(() => Promise.reject(err));
      expect(await legacyOffer(c)).toBeNull();
      expect(storage.get("vtt.gm")).toBe(STORED);
    }
  });

  it("forgets a token that owns nothing, and offers one that owns something", async () => {
    const empty = client(() => Promise.resolve({ rooms: 0, assets: 0, creatures: 0, diceLooks: 0 }));
    expect(await legacyOffer(empty)).toBeNull();
    expect(storage.has("vtt.gm")).toBe(false);

    storage.set("vtt.gm", STORED);
    const owns = client(() => Promise.resolve({ rooms: 2, assets: 3, creatures: 0, diceLooks: 0 }));
    expect(await legacyOffer(owns)).toEqual({ token: STORED, summary: { rooms: 2, assets: 3, creatures: 0, diceLooks: 0 } });
    expect(storage.get("vtt.gm")).toBe(STORED);
  });
});
