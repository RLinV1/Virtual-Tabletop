import { describe, expect, it } from "vitest";
import { initialLanding, landingPhase, landingReducer, type Landing, type LandingAction } from "../src/panels/diceLanding";

const run = (s: Landing, ...actions: LandingAction[]) => actions.reduce(landingReducer, s);

describe("Dice panel landing state (FR-TAC-09, throw-dice-on-board)", () => {
  it("does not replay rolls already on the table", () => {
    expect(landingPhase(initialLanding("r1"), "r1")).toBe("landed");
  });

  it("throws a new roll in the tray, then lands it", () => {
    const s = initialLanding("r1");
    expect(landingPhase(s, "r2")).toBe("tray");
    const after = run(s, { type: "landed", rollId: "r2", latestId: "r2" });
    expect(landingPhase(after, "r2")).toBe("landed");
    expect(after.thrown).toBe(true);
  });

  it("holds a roll while a board throw waits for it, then plays it on the board", () => {
    let s = run(initialLanding("r1"), { type: "await", latestId: "r1" });
    expect(landingPhase(s, "r2")).toBe("held");
    s = run(s, { type: "matched", rollId: "r2", onBoard: true, latestId: "r2" });
    expect(landingPhase(s, "r2")).toBe("board");
    s = run(s, { type: "landed", rollId: "r2", latestId: "r2" });
    expect(landingPhase(s, "r2")).toBe("landed");
    expect(s.board).toBeNull();
  });

  it("shows the roll at rest at once when it can't play on the board", () => {
    const s = run(initialLanding("r1"), { type: "await", latestId: "r1" }, { type: "matched", rollId: "r2", onBoard: false, latestId: "r2" });
    expect(landingPhase(s, "r2")).toBe("landed");
    expect(s.thrown).toBe(false);
  });

  it("shows the latest roll at rest when the throw can't be matched to it", () => {
    const s = run(initialLanding("r1"), { type: "await", latestId: "r1" }, { type: "matched", rollId: null, onBoard: true, latestId: "r2" });
    expect(landingPhase(s, "r2")).toBe("landed");
  });

  it("goes back to normal when the throw fails", () => {
    const s = run(initialLanding("r1"), { type: "await", latestId: "r1" }, { type: "failed" });
    expect(landingPhase(s, "r1")).toBe("landed");
    expect(landingPhase(s, "r2")).toBe("tray");
  });

  it("keeps throwing a roll already in the tray when a die leaves the hand", () => {
    // r2 (someone else's) is in the air in the tray; the viewer throws on the board.
    const s = run(initialLanding("r1"), { type: "await", latestId: "r2" });
    expect(landingPhase(s, "r2")).toBe("tray");
    expect(landingPhase(s, "r3")).toBe("held");
  });

  it("does not let an older board roll landing replace a newer latest roll", () => {
    let s = run(initialLanding("r1"), { type: "await", latestId: "r1" }, { type: "matched", rollId: "r2", onBoard: true, latestId: "r2" });
    // Someone else rolls while r2 is still in the air on the board.
    expect(landingPhase(s, "r3")).toBe("tray");
    s = run(s, { type: "landed", rollId: "r3", latestId: "r3" }, { type: "landed", rollId: "r2", latestId: "r3" });
    expect(landingPhase(s, "r3")).toBe("landed");
    expect(s.landed).toBe("r3");
    expect(s.board).toBeNull();
  });
});
