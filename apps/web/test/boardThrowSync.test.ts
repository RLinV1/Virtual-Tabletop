import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "@vtt/shared";
import { rollCommand } from "../src/panels/DicePanel";
import { canAnimateDice } from "../src/ui/Die3D";

describe("a throw onto the board stays on the thrower's screen (throw-dice-on-board, FR-TAC-09)", () => {
  it("sends the same command as Roll, with no position in it", () => {
    const command = rollCommand("2d6+1", "public");
    expect(command).toEqual({ type: "dice.roll", expression: "2d6+1", visibility: "public" });
    // Nothing the server doesn't already take: the command parses as an ordinary roll.
    expect(Command.parse(command)).toEqual(command);
  });
});

describe("board throws fall back to the tray (throw-dice-on-board, FR-TAC-09)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const reducedMotion = (reduce: boolean) =>
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q }));
  const animatable = { animate: () => ({}) } as unknown as Element;

  it("animates when the browser can and the viewer hasn't asked for less motion", () => {
    reducedMotion(false);
    expect(canAnimateDice(animatable)).toBe(true);
  });

  it("doesn't under reduced motion", () => {
    reducedMotion(true);
    expect(canAnimateDice(animatable)).toBe(false);
  });

  it("doesn't without the Web Animations API or an element", () => {
    reducedMotion(false);
    expect(canAnimateDice({} as Element)).toBe(false);
    expect(canAnimateDice(null)).toBe(false);
  });
});
