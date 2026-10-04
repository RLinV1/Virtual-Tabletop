import { describe, expect, it } from "vitest";
import { PING_MS, pingPulse } from "../src/board/ping";

describe("ping pulse (KAN-34, FR-TAC-05)", () => {
  it("grows and fades, then expires within 1.5 s", () => {
    const start = pingPulse(0, false)!;
    const mid = pingPulse(0.5, false)!;
    expect(mid.radiusCells).toBeGreaterThan(start.radiusCells);
    expect(mid.alpha).toBeLessThan(start.alpha);
    expect(pingPulse(1, false)).toBeNull();
    expect(PING_MS).toBeLessThanOrEqual(1500);
  });

  it("keeps one size under reduced motion and only fades", () => {
    const start = pingPulse(0, true)!;
    const late = pingPulse(0.9, true)!;
    expect(late.radiusCells).toBe(start.radiusCells);
    expect(late.alpha).toBeLessThan(start.alpha);
    expect(pingPulse(1, true)).toBeNull();
  });

  it("treats a frame just before the ping as its start", () => {
    expect(pingPulse(-0.01, false)).toEqual(pingPulse(0, false));
  });
});
