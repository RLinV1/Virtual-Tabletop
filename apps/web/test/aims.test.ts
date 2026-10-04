import { describe, expect, it } from "vitest";
import { AIM_TTL_MS, aimExpiry, expiredAims } from "../src/board/aims";

describe("other players' aims expire (KAN-35)", () => {
  it("keeps an aim for a second after its last update, then lets it go", () => {
    const aims = new Map([["alice", { expires: aimExpiry(1000) }], ["bob", { expires: aimExpiry(1500) }]]);
    expect(expiredAims(aims, 1000 + AIM_TTL_MS)).toEqual([]);
    expect(expiredAims(aims, 1000 + AIM_TTL_MS + 1)).toEqual(["alice"]);
    expect(expiredAims(aims, 1500 + AIM_TTL_MS + 1)).toEqual(["alice", "bob"]);
  });

  it("an update pushes the expiry back", () => {
    const aims = new Map([["alice", { expires: aimExpiry(1000) }]]);
    aims.set("alice", { expires: aimExpiry(1900) });
    expect(expiredAims(aims, 2500)).toEqual([]);
  });
});
