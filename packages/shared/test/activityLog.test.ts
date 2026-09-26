import { describe, expect, it } from "vitest";
import { activityHistory, DomainEvent, filterEventForViewer, formatActivity, HistoryQuery, HistoryResponse,
  type CommittedEvent, type DomainEventType } from "../src";
import { alice, baseRoom, gm, withToken } from "./fixtures";

const { state, token } = withToken(baseRoom(), { name: "Goblin" });
const initiative = { order: [token.id], activeIndex: 0, round: 1 };
const roll = { id: "roll", expression: "1d20", byParticipantId: alice.id, dice: [15], modifier: 0, total: 15, visibility: "public" as const };
const areaTemplate = { id: "t1", shape: "cone" as const, origin: { x: 70, y: 70 }, toward: { x: 210, y: 70 }, size: 20, ownerId: alice.id, gmOnly: false };
const committed = (event: DomainEvent, seq = 1, actorId: string | null = gm.id): CommittedEvent =>
  ({ seq, actorId, at: "2026-09-24T12:00:00.000Z", event });

describe("Human-readable activity formatter (FR-REC-01)", () => {
  const cases: Record<DomainEventType, [DomainEvent, string]> = {
    RoomCreated: [{ type: "RoomCreated", name: "Dungeon" }, "Mara created room Dungeon"],
    ParticipantJoined: [{ type: "ParticipantJoined", participant: alice }, "Mara joined the room as a player"],
    ParticipantLeft: [{ type: "ParticipantLeft", participant: alice }, "Alice left the table"],
    ParticipantRevoked: [{ type: "ParticipantRevoked", participant: alice }, "Mara removed Alice from the room"],
    ParticipantRenamed: [{ type: "ParticipantRenamed", participantId: alice.id, previous: "Alice", displayName: "Tomas" }, "Mara renamed Alice to Tomas"],
    MapSet: [{ type: "MapSet", map: { url: "/map.png", width: 100, height: 100 }, previous: null }, "Mara set the map"],
    GridSet: [{ type: "GridSet", grid: state.scene.grid, previous: state.scene.grid }, "Mara updated the grid"],
    TokenCreated: [{ type: "TokenCreated", token }, "Mara created Goblin"],
    TokenMoved: [{ type: "TokenMoved", tokenId: token.id, from: { x: 35, y: 35 }, to: { x: 105, y: 35 } }, "Mara moved Goblin from (35, 35) to (105, 35)"],
    TokenDeleted: [{ type: "TokenDeleted", token }, "Mara deleted Goblin"],
    TokenOwnersSet: [{ type: "TokenOwnersSet", tokenId: token.id, ownerIds: [alice.id], previous: [] }, "Mara assigned Goblin to Alice"],
    TokenHiddenSet: [{ type: "TokenHiddenSet", tokenId: token.id, hidden: true, previous: false }, "Mara hid Goblin"],
    TokenStatsSet: [{ type: "TokenStatsSet", tokenId: token.id, stats: { hp: 4, maxHp: 10, ac: 12 }, previous: token.stats }, "Mara updated Goblin's stats: HP 4/10, AC 12"],
    TokenConditionsSet: [{ type: "TokenConditionsSet", tokenId: token.id, conditions: ["prone"], previous: [] }, "Mara set Goblin's conditions to prone"],
    InitiativeStarted: [{ type: "InitiativeStarted", initiative, previous: null }, "Mara started initiative: Goblin"],
    InitiativeAdvanced: [{ type: "InitiativeAdvanced", initiative: { ...initiative, round: 2 }, previous: initiative }, "Mara advanced to round 2, Goblin's turn"],
    InitiativeEnded: [{ type: "InitiativeEnded", previous: initiative }, "Mara ended initiative"],
    DiceRolled: [{ type: "DiceRolled", roll }, "Mara rolled 1d20: 15"],
    TemplatePlaced: [{ type: "TemplatePlaced", template: areaTemplate }, "Mara placed a 20 ft cone"],
    TemplateRemoved: [{ type: "TemplateRemoved", template: { ...areaTemplate, gmOnly: true } }, "Mara removed a 20 ft cone (GM only)"],
  };
  it.each(Object.entries(cases))("formats %s", (_type, [event, sentence]) => {
    expect(DomainEvent.safeParse(event).success).toBe(true);
    expect(formatActivity(event, "Mara", state)).toBe(sentence);
  });
  it("describes private rolls, cleared fields and missing entities", () => {
    expect(formatActivity({ type: "DiceRolled", roll: { ...roll, visibility: "gm" } }, "Tomas", state)).toBe("Tomas rolled 1d20: 15 (GM only)");
    expect(formatActivity({ type: "TokenConditionsSet", tokenId: "missing", conditions: [], previous: [] }, "System", state)).toBe("System set an unknown token's conditions to none");
    expect(formatActivity({ type: "TokenOwnersSet", tokenId: token.id, ownerIds: [], previous: [] }, "Mara", state)).toBe("Mara assigned Goblin to no players");
  });
  it("rounds move coordinates to at most 2 decimal places", () => {
    const moved: DomainEvent = { type: "TokenMoved", tokenId: token.id, from: { x: 1987.9, y: 829.1000000000001 }, to: { x: 2057.3456, y: 829.1000000000001 } };
    expect(formatActivity(moved, "Mara", state)).toBe("Mara moved Goblin from (1987.9, 829.1) to (2057.35, 829.1)");
  });
});

describe("History projection and visibility (FR-REC-01)", () => {
  const log = [
    committed({ type: "RoomCreated", name: "Dungeon" }, 1),
    committed({ type: "ParticipantJoined", participant: gm }, 2),
    committed({ type: "ParticipantJoined", participant: alice }, 3, alice.id),
    committed({ type: "TokenCreated", token }, 4),
    committed({ type: "TokenMoved", tokenId: token.id, from: token.position, to: { x: 1, y: 2 } }, 5, alice.id),
    committed({ type: "ParticipantRenamed", participantId: alice.id, previous: "Alice", displayName: "Tomas" }, 6, alice.id),
    committed({ type: "TokenDeleted", token }, 7),
    committed({ type: "DiceRolled", roll: { ...roll, visibility: "gm" } }, 8),
    committed({ type: "DiceRolled", roll }, 9, alice.id),
    committed({ type: "GridSet", grid: state.scene.grid, previous: state.scene.grid }, 10, null),
  ];
  it("keeps historical actor/token names and searches before pagination", () => {
    const result = activityHistory("room", log, gm, HistoryQuery.parse({ player: " ALi " }));
    expect(result.entries.map((e) => e.committed.seq)).toEqual([6, 5, 3]);
    expect(result.entries[1]?.sentence).toBe("Alice moved Goblin from (35, 35) to (1, 2)");
    expect(activityHistory("room", log, gm, HistoryQuery.parse({ player: "tomas" })).entries[0]?.sentence).toBe("Tomas rolled 1d20: 15");
    const full = activityHistory("room", log, gm, HistoryQuery.parse({}));
    expect(full.entries.at(-1)?.actorName).toBe("GM");
    expect(full.entries[0]?.actorName).toBe("System");
    expect(HistoryResponse.safeParse(full).success).toBe(true);
  });
  it("returns exclusive newest-first pages and a terminal null cursor", () => {
    const page = activityHistory("room", log, gm, HistoryQuery.parse({ limit: "3" }));
    expect(page.entries.map((e) => e.committed.seq)).toEqual([10, 9, 8]);
    expect(page.nextBefore).toBe(8);
    const next = activityHistory("room", log, gm, HistoryQuery.parse({ before: "8" }));
    expect(next.entries.map((e) => e.committed.seq)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(next.nextBefore).toBeNull();
    expect(activityHistory("room", log, gm, HistoryQuery.parse({ before: "1" })).entries).toEqual([]);
  });
  it("denies player projection entirely and filters hidden/private events", () => {
    expect(activityHistory("room", log, alice, HistoryQuery.parse({}))).toEqual({ entries: [], nextBefore: null });
    const hidden = { ...token, hidden: true };
    const hiddenState = { ...state, tokens: { [token.id]: hidden } };
    const privateEvents: DomainEvent[] = [
      { type: "TokenCreated", token: hidden }, { type: "TokenDeleted", token: hidden },
      { type: "TokenMoved", tokenId: token.id, from: token.position, to: { x: 2, y: 3 } },
      { type: "DiceRolled", roll: { ...roll, visibility: "gm" } },
    ];
    for (const event of privateEvents) {
      expect(filterEventForViewer(committed(event), hiddenState, alice).kind).toBe("redacted");
      expect(filterEventForViewer(committed(event), hiddenState, gm).kind).toBe("event");
    }
    expect(filterEventForViewer(committed({ type: "TokenHiddenSet", tokenId: token.id, hidden: false, previous: true }), hiddenState, alice).kind).toBe("resync");
  });
  it("does not mutate its inputs and supplies an unknown-actor fallback", () => {
    const original = structuredClone(log);
    activityHistory("room", log, gm, HistoryQuery.parse({}));
    expect(log).toEqual(original);
    expect(activityHistory("room", [committed({ type: "RoomCreated", name: "Test" }, 1, "absent")], gm, HistoryQuery.parse({})).entries[0]?.actorName).toBe("Unknown participant");
  });
});

describe("History query validation (FR-REC-01)", () => {
  it.each([{ limit: "0" }, { limit: "101" }, { limit: "2.5" }, { before: "-1" }, { before: "9007199254740992" }, { limit: ["1", "2"] }, { player: "a".repeat(41) }, { role: "gm" }])("rejects %j", (query) => {
    expect(HistoryQuery.safeParse(query).success).toBe(false);
  });
  it("defaults to a bounded page", () => expect(HistoryQuery.parse({})).toEqual({ limit: 50, player: "" }));
});
