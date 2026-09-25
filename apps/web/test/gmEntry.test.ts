import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyValueStorage } from "../src/ui/usePersistentState";

type Identity = typeof import("../src/net/identity");

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

const throwing: KeyValueStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("GM dashboard entry rule (gm-dashboard)", () => {
  let identity: Identity;

  beforeEach(async () => {
    // The guest choice has a per-page fallback, so each test gets a fresh module.
    vi.resetModules();
    identity = await import("../src/net/identity");
  });

  it("sends a browser with a GM identity straight to the dashboard", () => {
    expect(identity.entryTarget({ hasToken: true, guest: false })).toBe("/gm-dashboard");
  });

  it("sends a browser that chose guest straight to the dashboard", () => {
    expect(identity.entryTarget({ hasToken: false, guest: true })).toBe("/gm-dashboard");
  });

  it("sends a browser with both straight to the dashboard", () => {
    expect(identity.entryTarget({ hasToken: true, guest: true })).toBe("/gm-dashboard");
  });

  it("sends an unrecognised browser to sign-in first", () => {
    expect(identity.entryTarget({ hasToken: false, guest: false })).toBe("/signin");
  });

  it("remembers the guest choice in storage without creating a GM token", () => {
    const s = memoryStorage();
    expect(identity.isGuest(s)).toBe(false);
    identity.markGuest(s);
    expect(s.data.get("vtt.gmGuest")).toBe("1");
    expect(s.data.has("vtt.gm")).toBe(false);
  });

  it("reads a guest choice stored by an earlier page load", () => {
    const s = memoryStorage();
    s.data.set("vtt.gmGuest", "1");
    expect(identity.isGuest(s)).toBe(true);
  });

  it("keeps the choice for this page when storage refuses it", () => {
    identity.markGuest(throwing);
    expect(identity.isGuest(throwing)).toBe(true);
  });

  it("treats unreadable storage as no guest choice", () => {
    expect(identity.isGuest(throwing)).toBe(false);
  });
});
