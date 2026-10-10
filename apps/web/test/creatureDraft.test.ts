import { describe, expect, it } from "vitest";
import type { LibraryCreature, Token } from "@vtt/shared";
import { creatureDraft, creatureFromToken, creatureSummary } from "../src/pages/creatureDraft";

const goblin: LibraryCreature = {
  id: "c1", name: "Goblin", size: 1, maxHp: 7, ac: 15, color: "#2e7d32", conditions: ["prone"],
  imageAssetId: "a1", imageUrl: "/uploads/goblin.webp", createdAt: "2026-09-27T00:00:00.000Z",
};

describe("From creature fills in Add Token (library-creatures, FR-TAC-07)", () => {
  it("starts a full creature at full health with its art", () => {
    expect(creatureDraft(goblin)).toEqual({
      name: "Goblin", size: 1, stats: { hp: 7, maxHp: 7, ac: 15 },
      color: "#2e7d32", conditions: ["prone"],
      attacks: [],
      image: { url: "/uploads/goblin.webp", assetId: "a1" },
    });
  });

  it("tracks no HP when the creature has no Max HP", () => {
    expect(creatureDraft({ ...goblin, maxHp: null, ac: null }).stats).toEqual({ hp: null, maxHp: null, ac: null });
  });

  it("has no image once its art is gone", () => {
    expect(creatureDraft({ ...goblin, imageAssetId: null, imageUrl: null }).image).toBeNull();
  });

  it("copies wounded, zero and negative starting HP rather than refilling it (KAN-70)", () => {
    for (const hp of [3, 0, -4]) {
      expect(creatureDraft({ ...goblin, hp }).stats).toEqual({ hp, maxHp: 7, ac: 15 });
    }
    expect(creatureDraft({ ...goblin, hp: null }).stats.hp).toBe(7);
  });

  it("summarises only what the creature tracks", () => {
    expect(creatureSummary(goblin)).toBe("Size 1 · AC 15 · 7 HP");
    expect(creatureSummary({ size: 2, maxHp: null, ac: null })).toBe("Size 2");
    expect(creatureSummary({ ...goblin, hp: 0 })).toBe("Size 1 · AC 15 · 0/7 HP");
  });
});

describe("Save as creature (KAN-70)", () => {
  const ogre: Token = {
    id: "t1", name: "Ogre", position: { x: 0, y: 0 }, size: 2, rotation: 0, color: "#6d4c41",
    imageUrl: "/uploads/ogre.webp", assetId: "art-1", ownerIds: [], hidden: false,
    stats: { hp: 30, maxHp: 59, ac: 11 }, conditions: ["prone"],
  };

  it("fills the form from the token, with its art when the art is the GM's own", () => {
    expect(creatureFromToken(ogre, [{ id: "art-1", url: "/uploads/ogre.webp", kind: "token" }])).toEqual({
      name: "Ogre", size: 2, hp: 30, maxHp: 59, ac: 11, color: "#6d4c41", conditions: ["prone"],
      attacks: [],
      imageAssetId: "art-1", imageUrl: "/uploads/ogre.webp",
    });
  });

  it("starts without art when the image isn't the GM's own token art", () => {
    expect(creatureFromToken(ogre, []).imageAssetId).toBeNull();
    expect(creatureFromToken({ ...ogre, assetId: "builtin:ogre" }, [{ id: "art-1", url: "/x", kind: "token" }]).imageAssetId).toBeNull();
    expect(creatureFromToken(ogre, [{ id: "art-1", url: "/x", kind: "map" }]).imageAssetId).toBeNull();
  });
});
