import { describe, expect, it } from "vitest";
import {
  CHAT_LOG_LIMIT,
  Command,
  MAX_CHAT_MENTIONS,
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

describe("chat.send mentions (chat-mentions)", () => {
  const join = (state: RoomState, participant: Participant) => reduce(state, { type: "ParticipantJoined", participant });
  const message = (state: RoomState, actor: Participant, text: string) => {
    const event = say(state, actor, text).events[0];
    if (event?.type !== "ChatMessageSent") throw new Error("expected ChatMessageSent");
    return event.message;
  };

  it("records who the text mentions, with their name at send time, and leaves the text alone", () => {
    const { events, state } = say(baseRoom(), alice, "@Bob watch the door");
    expect(events).toEqual([{
      type: "ChatMessageSent",
      message: {
        id: expect.stringMatching(/^id-/), senderId: alice.id, senderName: "Alice", text: "@Bob watch the door",
        mentions: [{ participantId: bob.id, displayName: "Bob" }],
      },
    }]);
    expect(DomainEvent.safeParse(events[0]).success).toBe(true);
    expect(state.chat[0]?.mentions).toEqual([{ participantId: bob.id, displayName: "Bob" }]);
  });
  it("ignores letter case and finds names with a space", () => {
    expect(message(baseRoom(), alice, "@bob, you're up").mentions).toEqual([{ participantId: bob.id, displayName: "Bob" }]);
    const knight: Participant = { id: "p-knight", role: "player", displayName: "Sir Lancelot" };
    expect(message(join(baseRoom(), knight), alice, "@Sir Lancelot hold the bridge").mentions)
      .toEqual([{ participantId: knight.id, displayName: "Sir Lancelot" }]);
  });
  it("lets the GM be mentioned, and records each person once in order of first mention", () => {
    expect(message(baseRoom(), alice, "@Bob @GM then @Bob again").mentions).toEqual([
      { participantId: bob.id, displayName: "Bob" },
      { participantId: gm.id, displayName: "GM" },
    ]);
  });
  it("never mentions the sender, or anyone who left or was removed", () => {
    let state = join(baseRoom(), { id: "p-cal", role: "player", displayName: "Cal", left: true });
    state = join(state, { id: "p-dee", role: "player", displayName: "Dee", revoked: true });
    const sent = message(state, alice, "@Cal @Dee @Alice hello");
    expect(sent.text).toBe("@Cal @Dee @Alice hello");
    expect(sent).not.toHaveProperty("mentions");
  });
  it("lets the sender's longer name win, so it does not tag a shorter name inside it", () => {
    const sir: Participant = { id: "p-sir", role: "player", displayName: "Sir" };
    const knight: Participant = { id: "p-knight", role: "player", displayName: "Sir Lancelot" };
    const state = join(join(baseRoom(), sir), knight);
    expect(message(state, knight, "@Sir Lancelot reporting")).not.toHaveProperty("mentions");
    expect(message(state, knight, "@Sir go").mentions).toEqual([{ participantId: sir.id, displayName: "Sir" }]);
  });
  it("records at most MAX_CHAT_MENTIONS people, in order, even in a room filled before the player cap", () => {
    let state = baseRoom();
    const crowd = Array.from({ length: MAX_CHAT_MENTIONS + 4 }, (_, i): Participant => ({ id: `p-${i}`, role: "player", displayName: `P${String(i).padStart(2, "0")}` }));
    for (const p of crowd) state = join(state, p);
    const sent = message(state, alice, crowd.map((p) => `@${p.displayName}`).join(" "));
    expect(sent.mentions).toHaveLength(MAX_CHAT_MENTIONS);
    expect(sent.mentions?.map((m) => m.participantId)).toEqual(crowd.slice(0, MAX_CHAT_MENTIONS).map((p) => p.id));
    expect(DomainEvent.safeParse({ type: "ChatMessageSent", message: sent }).success).toBe(true);
  });
  it("records a plain message exactly as before, with no mentions field", () => {
    expect(message(baseRoom(), alice, "hello")).not.toHaveProperty("mentions");
    expect(message(baseRoom(), alice, "@Nobody hi")).not.toHaveProperty("mentions");
    expect(message(baseRoom(), alice, "mail alice@Bob.example")).not.toHaveProperty("mentions");
  });
  it("keeps pointing at the same person, under the written name, after a rename", () => {
    let { state } = say(baseRoom(), alice, "@Bob look");
    state = run(state, bob, { type: "participant.rename", displayName: "Bee" }).state;
    expect(state.chat[0]?.mentions).toEqual([{ participantId: bob.id, displayName: "Bob" }]);
    // The new name is what a new mention needs.
    expect(message(state, alice, "@Bee look").mentions).toEqual([{ participantId: bob.id, displayName: "Bee" }]);
    expect(message(state, alice, "@Bob look")).not.toHaveProperty("mentions");
  });
  it("does not hand an earlier mention to a newcomer who takes the same name", () => {
    let { state } = say(baseRoom(), alice, "@Bob look");
    state = run(state, bob, { type: "participant.leave" }).state;
    const newBob: Participant = { id: "p-bob-2", role: "player", displayName: "Bob" };
    state = join(state, newBob);
    expect(state.chat[0]?.mentions).toEqual([{ participantId: bob.id, displayName: "Bob" }]);
    expect(message(state, alice, "@Bob hi").mentions).toEqual([{ participantId: newBob.id, displayName: "Bob" }]);
  });
  it("refuses a client-chosen mention list instead of ignoring it", () => {
    const forged = { type: "chat.send", text: "hello", mentions: [{ participantId: bob.id, displayName: "Bob" }] };
    expect(Command.safeParse(forged).success).toBe(false);
  });
  it("keeps mentions through reduce, the 200-message cap and replay, deterministically", () => {
    const mentioned = (n: number): DomainEvent => ({
      type: "ChatMessageSent",
      message: { id: `m${n}`, senderId: alice.id, senderName: "Alice", text: `@Bob ${n}`, mentions: [{ participantId: bob.id, displayName: "Bob" }] },
    });
    let state = baseRoom();
    for (let i = 1; i <= CHAT_LOG_LIMIT + 5; i++) state = reduce(state, mentioned(i), { at: AT });
    expect(state.chat).toHaveLength(CHAT_LOG_LIMIT);
    expect(state.chat.every((m) => m.mentions?.[0]?.participantId === bob.id)).toBe(true);
    const log = [committed(mentioned(1), 1, "a"), committed(mentioned(2), 2, "b")];
    const fold = () => log.reduce(reduceCommitted, baseRoom());
    expect(fold()).toEqual(fold());
    expect(fold().chat.map((m) => m.mentions)).toEqual([[{ participantId: bob.id, displayName: "Bob" }], [{ participantId: bob.id, displayName: "Bob" }]]);
  });
  it("decides the same mentions every time", () => {
    const decideOnce = () => message(baseRoom(), alice, "@GM @bob @Bob");
    expect({ ...decideOnce(), id: "" }).toEqual({ ...decideOnce(), id: "" });
  });
});

describe("chat mention visibility and activity log (chat-mentions)", () => {
  const event: DomainEvent = {
    type: "ChatMessageSent",
    message: { id: "m1", senderId: alice.id, senderName: "Alice", text: "@Bob watch the door", mentions: [{ participantId: bob.id, displayName: "Bob" }] },
  };

  it("delivers the mentions to every viewer unchanged, in events and in state", () => {
    const c = committed(event, 1, "cmd-1");
    const { commandId: _id, ...expected } = c;
    expect(filterEventForViewer(c, baseRoom(), bob)).toEqual({ kind: "event", committed: expected });
    expect(filterEventForViewer(c, baseRoom(), gm)).toEqual({ kind: "event", committed: c });
    const state = reduce(baseRoom(), event, { at: AT });
    expect(filterStateForViewer(state, bob).chat[0]?.mentions).toEqual([{ participantId: bob.id, displayName: "Bob" }]);
    expect(filterStateForViewer(state, gm).chat).toEqual(state.chat);
  });
  it("relies on players already having every participant: their filtered state keeps the list whole", () => {
    // Mentions carry participant ids. If players ever get a filtered participant list, the
    // mentions in `chat` must be filtered with it (ADR 0035).
    let state = reduce(baseRoom(), { type: "ParticipantJoined", participant: { id: "p-cal", role: "player", displayName: "Cal", left: true } });
    state = reduce(state, event, { at: AT });
    expect(filterStateForViewer(state, bob).participants).toEqual(state.participants);
  });
  it("reads as the text was written", () => {
    expect(formatActivity(event, "Alice", baseRoom())).toBe("Alice said: @Bob watch the door");
  });
});
