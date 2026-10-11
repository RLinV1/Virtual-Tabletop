import { describe, expect, it } from "vitest";
import { MAX_WALLS_PER_ADD, type FogRegion, type Wall } from "@vtt/shared";
import { applyToDraft, draftDirty, planDraftSave, withDetectedWalls, type MapDraft } from "../src/pages/mapEditor/mapDraft";

const wall = (id: string, x0: number, y0: number, x1: number, y1: number): Wall => ({ id, a: { x: x0, y: y0 }, b: { x: x1, y: y1 } });
const rect = (id: string, x0: number, y0: number, x1: number, y1: number): FogRegion => ({
  id, shape: "rect", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
});

const room = { walls: { w1: wall("w1", 0, 0, 100, 0), w2: wall("w2", 0, 0, 0, 100) }, fog: { f1: rect("f1", 0, 0, 70, 70) } };
const fresh = (): MapDraft => ({ mapUrl: "/uploads/map.png", ...room });
let n = 0;
const newId = () => `draft:${++n}`;

describe("map editor drafts (map-editor-drafts)", () => {
  it("has nothing to save until the draft changes", () => {
    expect(planDraftSave(room, fresh())).toEqual([]);
    expect(draftDirty(room, fresh())).toBe(false);
  });

  it("hides new fog first, then changes walls, and reveals fog last", () => {
    let draft = fresh();
    draft = applyToDraft(draft, { type: "fog.remove", regionId: "f1" }, newId)!;
    draft = applyToDraft(draft, { type: "fog.add", region: { shape: "rect", from: { x: 140, y: 140 }, to: { x: 70, y: 70 } } }, newId)!;
    draft = applyToDraft(draft, { type: "wall.remove", wallIds: ["w1"] }, newId)!;
    draft = applyToDraft(draft, { type: "wall.add", walls: [{ a: { x: 5, y: 5 }, b: { x: 5, y: 50 } }, { a: { x: 9, y: 9 }, b: { x: 9, y: 90 } }] }, newId)!;
    expect(planDraftSave(room, draft)).toEqual([
      { type: "fog.add", region: { shape: "rect", from: { x: 70, y: 70 }, to: { x: 140, y: 140 } } },
      { type: "wall.remove", wallIds: ["w1"] },
      { type: "wall.add", walls: [{ a: { x: 5, y: 5 }, b: { x: 5, y: 50 } }, { a: { x: 9, y: 9 }, b: { x: 9, y: 90 } }] },
      { type: "fog.remove", regionId: "f1" },
    ]);
  });

  it("matches walls by geometry, either way round, so a detection keeps existing walls", () => {
    const detected = [{ a: { x: 100, y: 0 }, b: { x: 0, y: 0 } }, { a: { x: 0, y: 0 }, b: { x: 0, y: 100 } }];
    expect(planDraftSave(room, withDetectedWalls(fresh(), detected, newId))).toEqual([]);
  });

  it("clears with one command when every wall goes", () => {
    expect(planDraftSave(room, applyToDraft(fresh(), { type: "wall.clear" }, newId)!)).toEqual([{ type: "wall.clear" }]);
  });

  it("sends a big detection in batches within the per-command limit", () => {
    const detected = Array.from({ length: MAX_WALLS_PER_ADD * 2 + 3 }, (_, i) => ({ a: { x: i, y: 200 }, b: { x: i, y: 300 } }));
    const plan = planDraftSave({ walls: {}, fog: room.fog }, withDetectedWalls(fresh(), detected, newId));
    expect(plan.map((c) => (c.type === "wall.add" ? c.walls.length : 0))).toEqual([MAX_WALLS_PER_ADD, MAX_WALLS_PER_ADD, 3]);
  });

  it("agrees with the room again once a save has reached it, whatever ids the room gave", () => {
    const draft = applyToDraft(fresh(), { type: "fog.add", region: { shape: "rect", from: { x: 0, y: 140 }, to: { x: 70, y: 210 } } }, newId)!;
    const saved = { ...room, fog: { ...room.fog, f9: rect("f9", 0, 140, 70, 210) } };
    expect(planDraftSave(saved, draft)).toEqual([]);
  });
});
