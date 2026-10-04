import { describe, expect, it } from "vitest";
import { initiativeEntries, initiativeFieldValue } from "../src/panels/initiativeFields";

const goblin = { id: "g", initiative: 12 };
const aria = { id: "a", initiative: null };
const fresh = { id: "f" };

describe("Start encounter fields (ADR 0022)", () => {
  it("pre-fills a token's saved score and leaves new tokens empty", () => {
    expect(initiativeFieldValue({}, goblin)).toBe("12");
    expect(initiativeFieldValue({}, aria)).toBe("");
    expect(initiativeFieldValue({}, fresh)).toBe("");
  });

  it("shows what the GM typed over the saved score, including a cleared field", () => {
    expect(initiativeFieldValue({ g: "8" }, goblin)).toBe("8");
    expect(initiativeFieldValue({ g: "" }, goblin)).toBe("");
  });

  it("sends saved and typed scores, and omits cleared or empty fields", () => {
    const tokens = [goblin, aria, fresh, { id: "x", initiative: 5 }];
    expect(initiativeEntries({ a: "17", x: "" }, tokens)).toEqual([
      { tokenId: "g", score: 12 },
      { tokenId: "a", score: 17 },
    ]);
  });
});
