import { describe, expect, it } from "vitest";
import {
  Command,
  CreateRoomRequest,
  decide,
  DEFAULT_PRESET_ID,
  emptyRoomState,
  filterStateForViewer,
  GAME_PRESETS,
  GamePresetId,
  presetFromLog,
  presetOf,
  reduceAll,
  tableForPreset,
  type CommandInput,
  type DomainEvent,
  type Participant,
  type RoomState,
} from "../src";
import { alice, ctx, gm } from "./fixtures";

/** A room created with `preset`, holding a GM, Alice and Alice's Fighter. */
function room(preset?: string) {
  const events: DomainEvent[] = [
    { type: "RoomCreated", name: "Test", ...(preset && { preset }) },
    { type: "ParticipantJoined", participant: gm },
    { type: "ParticipantJoined", participant: alice },
    {
      type: "TokenCreated",
      token: {
        id: "f1", name: "Fighter", position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null,
        assetId: null, ownerIds: [alice.id], hidden: false, stats: { hp: 10, maxHp: 10, ac: null }, conditions: [],
      },
    },
    {
      type: "TokenCreated",
      token: {
        id: "g1", name: "Goblin", position: { x: 175, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null,
        assetId: null, ownerIds: [], hidden: false, stats: { hp: 7, maxHp: 7, ac: null }, conditions: [],
      },
    },
  ];
  return reduceAll(emptyRoomState("r1"), events);
}

const attempt = (state: RoomState, actor: Participant, input: CommandInput) => decide(state, actor, Command.parse(input), ctx);

describe("Game preset registry (KAN-63)", () => {
  it("offers D&D first and Free Mode, in registry order", () => {
    expect(GAME_PRESETS.map((p) => [p.id, p.name])).toEqual([
      ["dnd5e", "Dungeons & Dragons 5th Edition"],
      ["free", "Free Mode"],
    ]);
    expect(DEFAULT_PRESET_ID).toBe("dnd5e");
  });

  it("accepts known ids and rejects unknown ones, in the create-room request too", () => {
    expect(GamePresetId.safeParse("free").success).toBe(true);
    expect(GamePresetId.safeParse("chess").success).toBe(false);
    const base = { roomName: "R", displayName: "GM", guestToken: "x".repeat(32) };
    expect(CreateRoomRequest.safeParse({ ...base, preset: "free" }).success).toBe(true);
    expect(CreateRoomRequest.safeParse({ ...base, preset: "chess" }).success).toBe(false);
    expect(CreateRoomRequest.safeParse(base).success).toBe(true);
  });

  it("picks up a newly registered preset without other changes", () => {
    const registry = GAME_PRESETS as unknown as { push: (p: unknown) => void; pop: () => void };
    registry.push({ ...GAME_PRESETS[1], id: "test-game", name: "Test Game" });
    try {
      expect(GamePresetId.safeParse("test-game").success).toBe(true);
      expect(presetOf({ preset: "test-game" }).name).toBe("Test Game");
    } finally {
      registry.pop();
    }
  });
});

describe("Preset is saved with the room (KAN-63)", () => {
  it("is recorded by RoomCreated, and an old room without it is D&D", () => {
    expect(room("free").preset).toBe("free");
    expect(room().preset).toBe("dnd5e");
    expect(presetFromLog({ type: "RoomCreated", preset: "free" })).toBe("free");
    expect(presetFromLog({ type: "RoomCreated" })).toBe("dnd5e");
    expect(presetFromLog(undefined)).toBe("dnd5e");
  });

  it("is public: players see which game the room is", () => {
    expect(filterStateForViewer(room("free"), alice).preset).toBe("free");
  });
});

describe("Server enforces the preset (KAN-63, FR-GM-15)", () => {
  const free = room("free");

  it("rejects attack rolls, rulings and damage in Free Mode", () => {
    expect(attempt(free, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: "f1", targetTokenId: "g1" } }))
      .toMatchObject({ ok: false, code: "invalid", message: "Attack rolls are off in Free Mode." });
    expect(attempt(free, gm, { type: "roll.rule", rollId: "r1", verdict: "hit" })).toMatchObject({ ok: false, code: "invalid" });
    expect(attempt(free, gm, { type: "roll.applyDamage", rollId: "r1" })).toMatchObject({ ok: false, code: "invalid" });
  });

  it("still lets everyone roll plain dice in Free Mode", () => {
    expect(attempt(free, alice, { type: "dice.roll", expression: "2d6" })).toMatchObject({ ok: true });
  });

  it("rejects conditions and AC in Free Mode, through every command that sets them", () => {
    const refused = [
      { type: "token.setConditions", tokenId: "g1", conditions: ["poisoned"] },
      { type: "token.configure", tokenId: "g1", changes: { conditions: ["prone"] } },
      { type: "token.configure", tokenId: "g1", changes: { stats: { hp: 5, maxHp: 7, ac: 12 } } },
      { type: "token.setStats", tokenId: "g1", stats: { hp: 5, maxHp: 7, ac: 12 } },
      { type: "token.create", name: "Orc", position: { x: 35, y: 105 }, conditions: ["prone"] },
      { type: "token.create", name: "Orc", position: { x: 35, y: 105 }, stats: { hp: 15, maxHp: 15, ac: 13 } },
      { type: "token.create", name: "Orc", position: { x: 35, y: 105 }, attacks: [{ name: "Axe", toHit: null, damage: { count: 1, sides: 12, modifier: 3 } }] },
    ] satisfies CommandInput[];
    for (const input of refused) expect(attempt(free, gm, input)).toMatchObject({ ok: false, code: "invalid" });
  });

  it("allows HP and clearing conditions in Free Mode", () => {
    expect(attempt(free, gm, { type: "token.setStats", tokenId: "g1", stats: { hp: 3, maxHp: 7, ac: null } })).toMatchObject({ ok: true });
    expect(attempt(free, gm, { type: "token.setConditions", tokenId: "g1", conditions: [] })).toMatchObject({ ok: true });
  });

  it("answers a player's forbidden command as forbidden, not as a preset refusal", () => {
    expect(attempt(free, alice, { type: "roll.rule", rollId: "r1", verdict: "hit" })).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("keeps D&D rooms as before", () => {
    const dnd = room();
    expect(attempt(dnd, gm, { type: "token.setConditions", tokenId: "g1", conditions: ["poisoned"] })).toMatchObject({ ok: true });
    expect(attempt(dnd, alice, { type: "dice.roll", expression: "1d20", attack: { actorTokenId: "f1", targetTokenId: "g1" } })).toMatchObject({ ok: true });
  });
});

describe("Templates from another game (KAN-63)", () => {
  it("drops conditions, attacks and AC for Free Mode, and changes nothing for D&D", () => {
    const table = {
      scene: room().scene,
      tokens: {
        g1: {
          id: "g1", name: "Goblin", position: { x: 35, y: 35 }, size: 1, rotation: 0, color: "#336699", imageUrl: null,
          ownerIds: [], hidden: false, stats: { hp: 7, maxHp: 7, ac: 15 }, conditions: ["poisoned" as const],
          attacks: [{ name: "Scimitar", toHit: { count: 1, sides: 20, modifier: 4 }, damage: null }],
        },
      },
      templates: {},
      fog: {},
      initiative: null,
    };
    const freeTable = tableForPreset(table, presetOf({ preset: "free" }));
    expect(freeTable.tokens.g1).toMatchObject({ conditions: [], stats: { hp: 7, maxHp: 7, ac: null } });
    expect(freeTable.tokens.g1!.attacks).toBeUndefined();
    expect(tableForPreset(table, presetOf({ preset: "dnd5e" }))).toBe(table);
  });
});
