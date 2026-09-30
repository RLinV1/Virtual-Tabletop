import { describe, expect, it } from "vitest";
import { MAX_LABEL_FONT, MIN_LABEL_FONT, tokenLabelFontSize, tokenLabelStroke } from "../src/board/tokenLabel";

/** Radius the board draws for a token: half its footprint, less the 2px rim. */
const radius = (size: number, cellSize: number) => (size * cellSize) / 2 - 2;

describe("token name label scales with the token (condense-token-editor)", () => {
  it("draws a 2-cell token's label about twice as large as a 1-cell token's", () => {
    const one = tokenLabelFontSize(radius(1, 100));
    const two = tokenLabelFontSize(radius(2, 100));
    expect(two / one).toBeGreaterThan(1.9);
    expect(two / one).toBeLessThan(2.1);
  });

  it("grows with the grid's cell size", () => {
    expect(tokenLabelFontSize(radius(1, 140))).toBeGreaterThan(tokenLabelFontSize(radius(1, 70)));
  });

  it("keeps a tiny token's label at the floor", () => {
    expect(tokenLabelFontSize(radius(0.25, 40))).toBe(MIN_LABEL_FONT);
  });

  it("caps a huge token's label", () => {
    expect(tokenLabelFontSize(radius(10, 300))).toBe(MAX_LABEL_FONT);
  });

  it("thickens the outline with the text", () => {
    expect(tokenLabelStroke(60)).toBeGreaterThan(tokenLabelStroke(14));
  });
});
