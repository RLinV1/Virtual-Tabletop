import { describe, expect, it } from "vitest";
import { isBoolean, isBooleanRecord, readStored, writeStored, type KeyValueStorage } from "../src/ui/usePersistentState";

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

describe("collapse state is client-side only (room-sidebar-layout)", () => {
  it("round-trips a value", () => {
    const s = memoryStorage();
    writeStored(s, "vtt.ui.sections", { dice: true, initiative: false });
    expect(readStored(s, "vtt.ui.sections", {}, isBooleanRecord)).toEqual({ dice: true, initiative: false });
  });

  it("uses the default when nothing is stored", () => {
    expect(readStored(memoryStorage(), "vtt.ui.sidebar", false, isBoolean)).toBe(false);
  });

  it("ignores corrupt JSON", () => {
    const s = memoryStorage();
    s.data.set("vtt.ui.sidebar", "{not json");
    expect(readStored(s, "vtt.ui.sidebar", false, isBoolean)).toBe(false);
  });

  it("ignores a value of the wrong shape", () => {
    const s = memoryStorage();
    s.data.set("vtt.ui.sidebar", JSON.stringify("yes"));
    s.data.set("vtt.ui.sections", JSON.stringify({ dice: "collapsed" }));
    expect(readStored(s, "vtt.ui.sidebar", false, isBoolean)).toBe(false);
    expect(readStored(s, "vtt.ui.sections", {}, isBooleanRecord)).toEqual({});
  });

  it("falls back when storage throws or is unavailable", () => {
    expect(readStored(throwing, "vtt.ui.sidebar", false, isBoolean)).toBe(false);
    expect(() => writeStored(throwing, "vtt.ui.sidebar", true)).not.toThrow();
    expect(readStored(null, "vtt.ui.sidebar", true, isBoolean)).toBe(true);
    expect(() => writeStored(null, "vtt.ui.sidebar", true)).not.toThrow();
  });

  it("rejects arrays and null as section records", () => {
    expect(isBooleanRecord([true])).toBe(false);
    expect(isBooleanRecord(null)).toBe(false);
  });
});
