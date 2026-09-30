import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listJoinedRooms, rememberRoomName, saveCredentials, loadCredentials } from "../src/net/identity";

/** A localStorage stand-in with the key enumeration `listJoinedRooms` needs. */
function memoryStorage(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  return {
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  };
}

const seat = (roomId: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ roomId, participantId: `p-${roomId}`, guestToken: `t-${roomId}`, ...extra });

describe("joined rooms list (KAN-64, FR-PL-02)", () => {
  it("lists guest seats, named rooms first by name", () => {
    const storage = memoryStorage({
      "vtt.credentials.r1": seat("r1", { roomName: "Zeta Keep" }),
      "vtt.credentials.r2": seat("r2"),
      "vtt.credentials.r3": seat("r3", { roomName: "Amber Vault" }),
      "vtt.invite.abc": "r1",
      "vtt.gm": "gm-token",
    });
    expect(listJoinedRooms(storage)).toEqual([
      { roomId: "r3", roomName: "Amber Vault" },
      { roomId: "r1", roomName: "Zeta Keep" },
      { roomId: "r2", roomName: null },
    ]);
  });

  it("leaves out this browser's GM seats, which the dashboard lists", () => {
    const storage = memoryStorage({
      "vtt.credentials.gm": seat("gm", { inviteCode: "abc123", roomName: "My Room" }),
      "vtt.credentials.g": seat("g", { roomName: "Their Room" }),
    });
    expect(listJoinedRooms(storage).map((r) => r.roomId)).toEqual(["g"]);
  });

  it("skips malformed entries", () => {
    const storage = memoryStorage({
      "vtt.credentials.bad": "{not json",
      "vtt.credentials.empty": "null",
      "vtt.credentials.partial": JSON.stringify({ roomId: "partial" }),
      "vtt.credentials.blank": JSON.stringify({ roomId: "", guestToken: "t" }),
      "vtt.credentials.typed": JSON.stringify({ roomId: "typed", guestToken: "t", roomName: 42 }),
      "vtt.credentials.ok": seat("ok"),
    });
    expect(listJoinedRooms(storage).map((r) => r.roomId)).toEqual(["ok"]);
  });

  it("returns nothing when storage throws (private browsing)", () => {
    const throwing = {
      get length(): number {
        throw new Error("SecurityError");
      },
      key: () => null,
      getItem: () => null,
    };
    expect(listJoinedRooms(throwing)).toEqual([]);
    // A read that fails partway hides the whole list rather than showing some rooms.
    const failingRead = memoryStorage({ "vtt.credentials.a": seat("a"), "vtt.credentials.b": seat("b") });
    const flaky = { ...failingRead, length: 2, getItem: (k: string) => {
      if (k === "vtt.credentials.b") throw new Error("SecurityError");
      return failingRead.getItem(k);
    } };
    expect(listJoinedRooms(flaky)).toEqual([]);
    expect(listJoinedRooms(null)).toEqual([]);
  });
});

describe("recording a seat's room name (KAN-64)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores the room name, follows a rename, and ignores rooms with no seat", () => {
    saveCredentials({ roomId: "r", participantId: "p", guestToken: "t" });
    rememberRoomName("r", "Goblin Caves");
    expect(loadCredentials("r")?.roomName).toBe("Goblin Caves");
    rememberRoomName("r", "Goblin Caves II");
    expect(loadCredentials("r")?.roomName).toBe("Goblin Caves II");
    rememberRoomName("other", "Nope");
    expect(loadCredentials("other")).toBeNull();
  });
});
