import { describe, expect, it } from "vitest";
import {
  CHAT_LOG_LIMIT,
  Command,
  DomainEvent,
  emptyRoomState,
  eventMeta,
  filterEventForViewer,
  filterStateForViewer,
  formatActivity,
  reduce,
  reduceCommitted,
  reduceReceived,
  type CommittedEvent,
  type Participant,
  type RoomState,
} from "../src";
import { alice, attempt, baseRoom, bob, gm, run } from "./fixtures";

const AT = "2026-09-24T12:00:00.000Z";
const say = (state: RoomState, actor: Participant = alice, text = "hello") => run(state, actor, { type: "chat.send", text });
const committed = (event: DomainEvent, seq = 1, commandId?: string): CommittedEvent =>
  ({ seq, at: AT, actorId: alice.id, event, ...(commandId && { commandId }) });

describe("chat.send validation (KAN-75)", () => {
  const parse = (text: string) => Command.safeParse({ type: "chat.send", text });

  it("trims surrounding whitespace", () => {
    expect(parse("  hello  ")).toMatchObject({ success: true, data: { text: "hello" } });
  });
  it("accepts 500 characters and refuses 501", () => {
    expect(parse("a".repeat(500)).success).toBe(true);
    expect(parse("a".repeat(501)).success).toBe(false);
  });
  it.each([
    ["empty", ""],
    ["whitespace only", "   \t "],
    ["a line break", "one\ntwo"],
    ["a carriage return", "one\rtwo"],
    ["a tab inside", "one\ttwo"],
    ["a NUL character", "one\u0000two"],
    ["a right-to-left override", "safe‮gnp.exe"],
    ["a zero-width space", "zero​width"],
    ["a lone surrogate", "broken\ud800text"],
    ["only a Hangul filler", "\u3164"],
    ["only Braille blanks", "\u2800\u2800"],
    ["only joiners", "\u200d\u200c"],
    ["only a combining grapheme joiner", "\u034f"],
  ])("refuses %s", (_name, text) => {
    expect(parse(text).success).toBe(false);
  });
  it("allows joiners inside emoji sequences and scripts that need them", () => {
    expect(parse("\u{1F469}\u200d\u{1F52C} ready").success).toBe(true);
    expect(parse("\u0645\u06cc\u200c\u062e\u0648\u0627\u0645").success).toBe(true);
  });
  it("refuses a forged sender field instead of ignoring it", () => {
    expect(Command.safeParse({ type: "chat.send", text: "hi", senderId: bob.id }).success).toBe(false);
    expect(Command.safeParse({ type: "chat.send", text: "hi", senderName: "GM" }).success).toBe(false);
  });
  it("keeps markup as plain text", () => {
    expect(parse("<img src=x onerror=alert(1)>")).toMatchObject({ success: true, data: { text: "<img src=x onerror=alert(1)>" } });
  });
});

describe("chat.send decision (KAN-75)", () => {
  it("emits one ChatMessageSent from the actor, with an id from the context", () => {
    const { events } = say(baseRoom());
    expect(events).toEqual([
      { type: "ChatMessageSent", message: { id: expect.stringMatching(/^id-/), senderId: alice.id, senderName: "Alice", text: "hello" } },
    ]);
    expect(DomainEvent.safeParse(events[0]).success).toBe(true);
  });
  it("lets the GM talk too", () => {
    expect(say(baseRoom(), gm).events[0]).toMatchObject({ message: { senderId: gm.id, senderName: "GM" } });
  });
  it("keeps the name the sender had at send time after a rename", () => {
    let { state } = say(baseRoom(), alice, "first");
    state = run(state, alice, { type: "participant.rename", displayName: "Ari" }).state;
    state = say(state, state.participants[alice.id]!, "second").state;
    expect(state.chat.map((m) => m.senderName)).toEqual(["Alice", "Ari"]);
    expect(state.chat.map((m) => m.senderId)).toEqual([alice.id, alice.id]);
  });
  it.each([
    ["left", { left: true }],
    ["revoked", { revoked: true }],
  ])("refuses a participant who has %s", (_name, flag) => {
    expect(attempt(baseRoom(), { ...alice, ...flag }, { type: "chat.send", text: "hi" })).toMatchObject({ ok: false, code: "forbidden" });
  });
});

describe("chat reduce (KAN-75)", () => {
  const sent = (n: number): DomainEvent => ({ type: "ChatMessageSent", message: { id: `m${n}`, senderId: alice.id, senderName: "Alice", text: `msg ${n}` } });

  it("appends oldest first and stamps the time from metadata", () => {
    let state = reduce(baseRoom(), sent(1), { at: AT });
    state = reduce(state, sent(2), { at: "2026-09-24T12:00:05.000Z" });
    expect(state.chat).toEqual([
      { id: "m1", senderId: alice.id, senderName: "Alice", text: "msg 1", at: AT },
      { id: "m2", senderId: alice.id, senderName: "Alice", text: "msg 2", at: "2026-09-24T12:00:05.000Z" },
    ]);
  });
  it("stamps the time the same way for a received player event and a GM event", () => {
    const player = reduceReceived(baseRoom(), committed(sent(1)));
    const gmView = reduceReceived(baseRoom(), committed(sent(1), 1, "cmd-1"));
    expect(player.chat).toEqual(gmView.chat);
    expect(player.chat[0]?.at).toBe(AT);
    expect(player.undo).toEqual([]);
  });
  it("leaves the time null without metadata", () => {
    expect(reduce(baseRoom(), sent(1)).chat[0]?.at).toBeNull();
  });
  it("stamps the time on a committed event, and a time-only meta records no undo history", () => {
    expect(reduceCommitted(baseRoom(), committed(sent(1), 1, "cmd-1")).chat[0]?.at).toBe(AT);
    expect(eventMeta(committed(sent(1), 1, "cmd-1")).at).toBe(AT);
    expect(reduce(baseRoom(), sent(1), { at: AT }).undo).toEqual([]);
  });
  it("keeps only the newest 200 messages, oldest first", () => {
    let state = baseRoom();
    for (let i = 1; i <= CHAT_LOG_LIMIT + 5; i++) state = reduce(state, sent(i), { at: AT });
    expect(state.chat).toHaveLength(CHAT_LOG_LIMIT);
    expect(state.chat[0]?.text).toBe("msg 6");
    expect(state.chat.at(-1)?.text).toBe(`msg ${CHAT_LOG_LIMIT + 5}`);
  });
  it("is deterministic: the same committed events always give the same state", () => {
    const log = [committed(sent(1), 1, "a"), committed(sent(2), 2, "b")];
    const fold = () => log.reduce(reduceCommitted, baseRoom());
    expect(fold()).toEqual(fold());
  });
  it("starts empty, and is not undoable", () => {
    expect(emptyRoomState("r").chat).toEqual([]);
    const state = reduceCommitted(baseRoom(), committed(sent(1), 1, "cmd-1"));
    expect(attempt(state, gm, { type: "history.undo", commandId: "cmd-1" })).toMatchObject({ ok: false, code: "invalid" });
  });
});

describe("chat visibility and activity log (KAN-75)", () => {
  const event: DomainEvent = { type: "ChatMessageSent", message: { id: "m1", senderId: alice.id, senderName: "Alice", text: "Watch the door" } };

  it("delivers the event to a player unchanged, without the commandId", () => {
    const c = committed(event, 1, "cmd-1");
    const { commandId: _id, ...expected } = c;
    expect(filterEventForViewer(c, baseRoom(), bob)).toEqual({ kind: "event", committed: expected });
    expect(filterEventForViewer(c, baseRoom(), gm)).toEqual({ kind: "event", committed: c });
  });
  it("keeps chat in a player's filtered state", () => {
    const state = reduce(baseRoom(), event, { at: AT });
    expect(filterStateForViewer(state, bob).chat).toEqual(state.chat);
    expect(filterStateForViewer(state, gm).chat).toEqual(state.chat);
  });
  it("reads as a sentence, truncated at 80 characters", () => {
    expect(formatActivity(event, "Alice", baseRoom())).toBe("Alice said: Watch the door");
    const long = { ...event, message: { ...event.message, text: "x".repeat(200) } };
    const sentence = formatActivity(long, "Alice", baseRoom());
    expect(sentence).toBe(`Alice said: ${"x".repeat(79)}…`);
    expect(sentence.length - "Alice said: ".length).toBe(80);
    const exact = { ...event, message: { ...event.message, text: "y".repeat(80) } };
    expect(formatActivity(exact, "Alice", baseRoom())).toBe(`Alice said: ${"y".repeat(80)}`);
  });
});
