import { describe, expect, it } from "vitest";
import { Command, decide, emptyRoomState, filterEventForViewer, filterStateForViewer, reduceCommitted, replayTo, referencedAssetIds, tableOf, type CommittedEvent, type Participant } from "../src";
import { gm, alice } from "./fixtures";

function room() {
  let state = emptyRoomState("room-1");
  let id = 0;
  const log: CommittedEvent[] = [];
  state.participants = { [gm.id]: gm, [alice.id]: alice };
  const attempt = (input: unknown, actor: Participant = gm) => decide(state, actor, Command.parse(input), { newId: () => `scene-id-${++id}`, lastSeq: log.length });
  const run = (input: unknown, actor: Participant = gm) => {
    const result = attempt(input, actor);
    if (!result.ok) throw new Error(result.message);
    for (const event of result.events) {
      const committed = { event, actorId: actor.id, seq: log.length + 1, at: "2026-11-01T12:00:00Z", commandId: `cmd-${log.length + 1}` };
      log.push(committed);
      state = reduceCommitted(state, committed);
    }
    return result.events;
  };
  return { get state() { return state; }, log, run, attempt };
}

describe("persistent scene switching", () => {
  it("refuses stale same-map editor commands after a scene switch", () => {
    const r = room();
    r.run({ type: "scene.create", name: "Cellar" });
    const grid = r.state.scene.grid;
    for (const input of [
      { type: "wall.clear", expectedSceneId: "initial" },
      { type: "scene.setLineOfSight", expectedSceneId: "initial", enabled: true },
      { type: "scene.setGrid", expectedSceneId: "initial", grid },
      { type: "scene.setMap", expectedSceneId: "initial", map: { url: "/a.png", width: 500, height: 500 } },
    ]) expect(r.attempt(input)).toMatchObject({ ok: false, code: "invalid" });
  });
  it("preserves each board, token identities, owners, stats, fog, groups and initiative", () => {
    const r = room();
    r.run({ type: "scene.setMap", map: { url: "/a.png", width: 1000, height: 800, assetId: "map-a" } });
    r.run({ type: "token.create", name: "Rogue", position: { x: 35, y: 35 }, ownerIds: [alice.id], stats: { hp: 3, maxHp: 10, ac: null } });
    const tokenId = Object.keys(r.state.tokens)[0]!;
    r.run({ type: "fog.add", region: { shape: "rect", from: { x: 600, y: 600 }, to: { x: 700, y: 700 } } });
    r.run({ type: "group.create", name: "Party" });
    r.run({ type: "group.assign", groupId: Object.keys(r.state.groups)[0]!, tokenIds: [tokenId] });
    r.run({ type: "initiative.start", entries: [{ tokenId, score: 12 }] });
    const first = tableOf(r.state);
    const groups = r.state.groups;
    const assignments = r.state.tokenGroups;
    r.run({ type: "scene.create", name: "Cellar" });
    const firstId = Object.keys(r.state.savedScenes!)[0]!;
    const cellarId = r.state.activeSceneId!;
    expect(r.state.tokens).toEqual({});
    expect(r.state.scene.map).toBeNull();
    expect(referencedAssetIds(r.state).has("map-a")).toBe(true);
    r.run({ type: "token.create", name: "Rat", position: { x: 35, y: 35 } });
    const cellar = tableOf(r.state);
    r.run({ type: "scene.switch", sceneId: firstId });
    expect(tableOf(r.state)).toEqual(first);
    expect(r.state.groups).toEqual(groups);
    expect(r.state.tokenGroups).toEqual(assignments);
    expect(r.state.tokens[tokenId]!.stats.hp).toBe(3);
    r.run({ type: "scene.switch", sceneId: cellarId });
    expect(tableOf(r.state)).toEqual(cellar);
    expect(r.state.undo.every((entry) => entry.events.every((e) => e.type === "RollRuled"))).toBe(true);
  });

  it("never sends inactive boards or scene names to players", () => {
    const r = room();
    r.run({ type: "token.create", name: "Secret monster", position: { x: 35, y: 35 }, hidden: true });
    const before = r.state;
    r.run({ type: "scene.create", name: "Secret cellar" });
    const filtered = filterStateForViewer(r.state, alice);
    expect(filtered.savedScenes).toEqual({});
    expect(filtered.sceneNames).toEqual({});
    expect(JSON.stringify(filtered)).not.toContain("Secret");
    const last = r.log.at(-1)!;
    expect(filterEventForViewer(last, before, alice).kind).toBe("resync");
  });

  it("rejects player scene management, duplicate names and deletion of the active scene", () => {
    const r = room();
    for (const input of [{ type: "scene.create", name: "Cellar" }, { type: "scene.switch", sceneId: "missing" }, { type: "scene.rename", sceneId: "missing", name: "New" }, { type: "scene.delete", sceneId: "missing" }]) {
      expect(r.attempt(input, alice)).toMatchObject({ ok: false, code: "forbidden" });
    }
    r.run({ type: "scene.create", name: "Cellar" });
    expect(r.attempt({ type: "scene.create", name: " cellar " })).toMatchObject({ ok: false });
    expect(r.attempt({ type: "scene.delete", sceneId: r.state.activeSceneId })).toMatchObject({ ok: false });
    expect(r.attempt({ type: "scene.switch", sceneId: "missing" })).toMatchObject({ ok: false });
    const inactive = Object.keys(r.state.savedScenes!)[0]!;
    r.run({ type: "scene.rename", sceneId: inactive, name: "Tavern" });
    expect(r.state.sceneNames![inactive]).toBe("Tavern");
    r.run({ type: "scene.delete", sceneId: inactive });
    expect(r.state.savedScenes![inactive]).toBeUndefined();
    expect(r.state.sceneNames![inactive]).toBeUndefined();
    expect(Command.safeParse({ type: "scene.create", name: "  " }).success).toBe(false);
  });

  it("caps scenes and rebuilds saved scenes from the event log", () => {
    const r = room();
    for (let n = 1; n < 20; n++) r.run({ type: "scene.create", name: `Room ${n}` });
    expect(r.attempt({ type: "scene.create", name: "Too many" })).toMatchObject({ ok: false });
    const replayed = replayTo("room-1", r.log, r.log.length);
    expect(replayed.activeSceneId).toBe(r.state.activeSceneId);
    expect(replayed.savedScenes).toEqual(r.state.savedScenes);
    expect(replayed.sceneNames).toEqual(r.state.sceneNames);
  });
});
