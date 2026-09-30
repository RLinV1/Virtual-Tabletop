import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CHAT_LOG_LIMIT } from "@vtt/shared";
import { startServer, type TestClient } from "./helpers";

let server: Awaited<ReturnType<typeof startServer>>;
const clients: TestClient[] = [];

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  clients.splice(0).forEach((c) => c.close());
  await server.close();
});

async function setup() {
  const gmCreds = await server.createRoom("Mara");
  const aliceCreds = await server.join(gmCreds.inviteCode, "Alice");
  const bobCreds = await server.join(gmCreds.inviteCode, "Bob");
  const gm = await server.connect(gmCreds);
  const alice = await server.connect(aliceCreds);
  const bob = await server.connect(bobCreds);
  // A second, unrelated room with its own GM.
  const otherCreds = await server.createRoom("Other GM", { roomName: "Elsewhere" });
  const other = await server.connect(otherCreds);
  clients.push(gm, alice, bob, other);
  return { gmCreds, gm, alice, bob, other };
}

const seqOf = (reply: unknown) => (reply as { seq: number }).seq;
const texts = (c: TestClient) => c.state.chat.map((m) => m.text);
/** Sends a command the typed client would never build, such as a forged payload. */
const forged = (payload: unknown) => payload as Parameters<TestClient["command"]>[0];

describe("room chat over the wire (KAN-75)", () => {
  it("delivers a player's message to the GM and every player in the room", async () => {
    const { gm, alice, bob } = await setup();
    const sent = await alice.command({ type: "chat.send", text: "  Watch the door  " });
    expect(sent).toMatchObject({ type: "ack" });
    await Promise.all([gm, alice, bob].map((c) => c.waitForSeq(seqOf(sent))));

    for (const c of [gm, alice, bob]) {
      expect(c.state.chat).toEqual([
        { id: expect.any(String), senderId: alice.participantId, senderName: "Alice", text: "Watch the door", at: expect.any(String) },
      ]);
    }
    // Every client stamped the same committed time, including the players (no commandId).
    expect(new Set([gm, alice, bob].map((c) => c.state.chat[0]?.at)).size).toBe(1);
    expect(bob.state.undo).toEqual([]);
  });

  it("never delivers the message to another room", async () => {
    const { alice, other } = await setup();
    const before = other.seq;
    const sent = await alice.command({ type: "chat.send", text: "secret plans" });
    await alice.waitForSeq(seqOf(sent));
    // A later command in the other room proves the socket was live and had nothing in between.
    const ping = await other.command({ type: "chat.send", text: "hello from elsewhere" });
    await other.waitForSeq(seqOf(ping));
    expect(seqOf(ping)).toBe(before + 1);
    expect(texts(other)).toEqual(["hello from elsewhere"]);
    expect(other.rawLog.join("")).not.toContain("secret plans");
  });

  it("sends messages in order and gives a late joiner the history with times", async () => {
    const { gm, alice, bob, gmCreds } = await setup();
    await alice.command({ type: "chat.send", text: "one" });
    await bob.command({ type: "chat.send", text: "two" });
    const last = await gm.command({ type: "chat.send", text: "three" });
    await Promise.all([alice, bob].map((c) => c.waitForSeq(seqOf(last))));

    const carol = await server.connect(await server.join(gmCreds.inviteCode, "Carol"));
    clients.push(carol);
    expect(carol.state.chat.map((m) => [m.senderName, m.text])).toEqual([["Alice", "one"], ["Bob", "two"], ["Mara", "three"]]);
    expect(carol.state.chat.every((m) => typeof m.at === "string")).toBe(true);
    expect(carol.state.chat).toEqual(gm.state.chat);

    // A reload (fresh connection, same credentials) sees the same thing.
    const reloaded = await server.connect({ roomId: gmCreds.roomId, guestToken: gmCreds.guestToken });
    clients.push(reloaded);
    expect(reloaded.state.chat).toEqual(gm.state.chat);
  });

  it("rejects at validation: empty, whitespace-only and over-length messages and records nothing", async () => {
    const { gm, alice } = await setup();
    const before = alice.seq;
    for (const text of ["", "   ", "x".repeat(501), "two\nlines", "flip‮this"]) {
      expect(await alice.command({ type: "chat.send", text })).toMatchObject({ type: "rejected", code: "bad_request" });
    }
    expect(alice.seq).toBe(before);
    expect(alice.state.chat).toEqual([]);
    expect(gm.state.chat).toEqual([]);
    expect(await alice.command({ type: "chat.send", text: "x".repeat(500) })).toMatchObject({ type: "ack" });
  });

  it("rejects a forged sender and records nothing", async () => {
    const { gm, alice, bob } = await setup();
    const before = alice.seq;
    const reply = await alice.command(forged({ type: "chat.send", text: "I am the GM", senderId: gm.participantId, senderName: "Mara" }));
    expect(reply).toMatchObject({ type: "rejected", code: "bad_request" });
    expect(alice.seq).toBe(before);
    expect(gm.state.chat).toEqual([]);

    // The honest message is attributed to the real connection, whatever the client believes.
    const sent = await alice.command({ type: "chat.send", text: "just Alice" });
    await bob.waitForSeq(seqOf(sent));
    expect(bob.state.chat[0]).toMatchObject({ senderId: alice.participantId, senderName: "Alice" });
  });

  it("keeps markup verbatim as text", async () => {
    const { gm, alice } = await setup();
    const markup = "<img src=x onerror=alert(1)>";
    const sent = await alice.command({ type: "chat.send", text: markup });
    await gm.waitForSeq(seqOf(sent));
    expect(gm.state.chat[0]?.text).toBe(markup);
  });

  it("keeps the newest 200 messages in state", async () => {
    const { gm, alice } = await setup();
    let last = 0;
    for (let i = 1; i <= CHAT_LOG_LIMIT + 3; i++) last = seqOf(await alice.command({ type: "chat.send", text: `m${i}` }));
    await gm.waitForSeq(last);
    expect(gm.state.chat).toHaveLength(CHAT_LOG_LIMIT);
    expect(gm.state.chat[0]?.text).toBe("m4");
    expect(gm.state.chat.at(-1)?.text).toBe(`m${CHAT_LOG_LIMIT + 3}`);
  });
});
