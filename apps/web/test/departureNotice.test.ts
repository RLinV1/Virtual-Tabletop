import { describe, expect, it } from "vitest";
import type { Participant, RoomState } from "@vtt/shared";
import { departureNews } from "../src/ui/DepartureNotice";
import { awayParticipants } from "../src/ui/ParticipantsButton";

const person = (id: string, extra: Partial<Participant> = {}): Participant => ({
  id,
  role: id === "gm" ? "gm" : "player",
  displayName: id.toUpperCase(),
  ...extra,
});
const table = (...people: Participant[]): RoomState["participants"] => Object.fromEntries(people.map((p) => [p.id, p]));

describe("who is marked AFK (FR-PL-06, KAN-58, KAN-73)", () => {
  it("lists a player who left, not one the GM removed or one still here", () => {
    const state = { participants: table(person("gm"), person("sam", { left: true }), person("kim", { revoked: true }), person("lee")) } as RoomState;
    expect(awayParticipants(state).map((p) => p.id)).toEqual(["sam"]);
  });
});

describe("who is told about a departure (FR-PL-06, KAN-58, KAN-73)", () => {
  const here = table(person("gm"), person("sam"), person("kim"));

  it("announces a player who leaves after the first snapshot, once", () => {
    const first = departureNews(null, here);
    expect(first.shown).toEqual([]);
    const left = { ...here, sam: person("sam", { left: true }) };
    const second = departureNews(first.known, left);
    expect(second.shown).toEqual(["sam"]);
    expect(departureNews(second.known, left).shown).toEqual([]);
  });

  it("does not replay a departure that happened before this page loaded", () => {
    const earlier = table(person("gm"), person("sam", { left: true }), person("kim"));
    const first = departureNews(null, earlier);
    expect(first.shown).toEqual([]);
    expect(departureNews(first.known, earlier).shown).toEqual([]);
  });

  it("does not announce a removal", () => {
    const first = departureNews(null, here);
    const removed = { ...here, sam: person("sam", { revoked: true }) };
    expect(departureNews(first.known, removed).shown).toEqual([]);
  });

  it("announces two simultaneous departures once each", () => {
    const first = departureNews(null, here);
    const both = { ...here, sam: person("sam", { left: true }), kim: person("kim", { left: true }) };
    expect(departureNews(first.known, both).shown).toEqual(["sam", "kim"]);
  });
});
