import { describe, expect, it } from "vitest";
import { initiativeEntries, initiativeFieldValue, invalidInitiative } from "../src/panels/initiativeFields";

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

  it("flags scores the server would refuse instead of dropping them silently", () => {
    const tokens = [{ id: "a", initiative: null, name: "Aria" }, { id: "b", initiative: 4, name: "Bram" }, { id: "c", initiative: null, name: "Cole" }];
    expect(invalidInitiative({ a: "1.5", c: "5000" }, tokens).map((t) => t.name)).toEqual(["Aria", "Cole"]);
    expect(invalidInitiative({ a: "-99", c: "999" }, tokens)).toEqual([]);
    expect(initiativeEntries({ a: "1.5", c: "999" }, tokens)).toEqual([{ tokenId: "b", score: 4 }, { tokenId: "c", score: 999 }]);
  });
});
