import { describe, expect, it } from "vitest";
import { guideSteps, placeCard } from "../src/ui/guide";

const GM_ONLY = ["share", "gm-map", "gm-grid", "gm-add-token", "tab-gm", "activity-log"];

describe("guided tour on demand (room-sidebar-layout)", () => {
  it("gives the GM the setup steps", () => {
    const targets = guideSteps("gm").map((s) => s.target);
    for (const t of GM_ONLY) expect(targets).toContain(t);
    expect(targets.at(-1)).toBe("guide");
  });

  it("walks through every panel tab for the role, and the GM's activity log", () => {
    expect(guideSteps("gm").map((s) => s.target).filter((t) => t.startsWith("tab-") || t === "activity-log")).toEqual([
      "tab-play", "tab-tokens", "tab-dice", "tab-gm", "activity-log",
    ]);
    expect(guideSteps("player").map((s) => s.target).filter((t) => t.startsWith("tab-") || t === "activity-log")).toEqual([
      "tab-play", "tab-tokens", "tab-dice",
    ]);
  });

  it("gives players no GM-only step, but their tokens and dice", () => {
    const steps = guideSteps("player");
    const targets = steps.map((s) => s.target);
    for (const t of GM_ONLY) expect(targets).not.toContain(t);
    expect(targets).toContain("my-tokens");
    expect(targets).toContain("dice");
    expect(steps.find((s) => s.target === "dice")!.body).not.toMatch(/privately/);
  });

  it("lets only the step that asks for a click through to its target (room-ui-refinements)", () => {
    for (const role of ["gm", "player"] as const) {
      const interactive = guideSteps(role).filter((s) => s.interactive).map((s) => s.target);
      expect(interactive).toEqual(["sidebar-handle"]);
    }
  });

  it("uses no em or en dashes in the copy", () => {
    for (const role of ["gm", "player"] as const)
      for (const s of guideSteps(role)) expect(`${s.title} ${s.body}`).not.toMatch(/[–—]/);
  });

  describe("card placement", () => {
    const viewport = { width: 1400, height: 800 };
    const card = { width: 300, height: 160 };
    const inside = (p: { left: number; top: number }) =>
      p.left >= 0 && p.top >= 0 && p.left + card.width <= viewport.width && p.top + card.height <= viewport.height;

    it("goes left of a sidebar section on the right edge", () => {
      const p = placeCard({ left: 1080, top: 300, width: 300, height: 120 }, card, viewport);
      expect(p.left + card.width).toBeLessThanOrEqual(1080);
      expect(inside(p)).toBe(true);
    });

    it("goes right of a small top-left control", () => {
      const p = placeCard({ left: 12, top: 12, width: 60, height: 32 }, card, viewport);
      expect(p.left).toBeGreaterThanOrEqual(72);
      expect(inside(p)).toBe(true);
    });

    it("stays on screen for a target that fills the viewport", () => {
      expect(inside(placeCard({ left: 0, top: 0, width: 1400, height: 800 }, card, viewport))).toBe(true);
    });

    it("stays on screen on a phone", () => {
      const phone = { width: 390, height: 780 };
      const p = placeCard({ left: 0, top: 0, width: 390, height: 360 }, { width: 340, height: 180 }, phone);
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.left + 340).toBeLessThanOrEqual(390);
      expect(p.top + 180).toBeLessThanOrEqual(780);
    });
  });
});
