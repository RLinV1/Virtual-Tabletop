import { describe, expect, it } from "vitest";
import type { LibraryCreature } from "@vtt/shared";
import { creatureDraft, creatureSummary } from "../src/pages/creatureDraft";

const goblin: LibraryCreature = {
  id: "c1", name: "Goblin", size: 1, maxHp: 7, ac: 15,
  imageAssetId: "a1", imageUrl: "/uploads/goblin.webp", createdAt: "2026-09-27T00:00:00.000Z",
};

describe("From creature fills in Add Token (library-creatures, FR-TAC-07)", () => {
  it("starts a full creature at full health with its art", () => {
    expect(creatureDraft(goblin)).toEqual({
      name: "Goblin", size: 1, stats: { hp: 7, maxHp: 7, ac: 15 },
      image: { url: "/uploads/goblin.webp", assetId: "a1" },
    });
  });

  it("tracks no HP when the creature has no Max HP", () => {
    expect(creatureDraft({ ...goblin, maxHp: null, ac: null }).stats).toEqual({ hp: null, maxHp: null, ac: null });
  });

  it("has no image once its art is gone", () => {
    expect(creatureDraft({ ...goblin, imageAssetId: null, imageUrl: null }).image).toBeNull();
  });

  it("summarises only what the creature tracks", () => {
    expect(creatureSummary(goblin)).toBe("Size 1 · AC 15 · 7 HP");
    expect(creatureSummary({ size: 2, maxHp: null, ac: null })).toBe("Size 2");
  });
});
