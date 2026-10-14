import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findMentions, mentionSegments, type ChatMention } from "../src";

const bea: ChatMention = { participantId: "p-bea", displayName: "Bea" };
const cid: ChatMention = { participantId: "p-cid", displayName: "Cid" };
const al: ChatMention = { participantId: "p-al", displayName: "Al" };
const sir: ChatMention = { participantId: "p-sir", displayName: "Sir" };
const lancelot: ChatMention = { participantId: "p-lance", displayName: "Sir Lancelot" };
const who = (text: string, candidates: ChatMention[]) => findMentions(text, candidates).map((m) => m.participantId);

describe("chat mentions matcher (chat-mentions)", () => {
  it("finds @ followed by a name, with where it is", () => {
    expect(findMentions("@Bea watch the door", [bea, cid])).toEqual([{ ...bea, start: 0, end: 4 }]);
    expect(findMentions("ok @Cid", [bea, cid])).toEqual([{ ...cid, start: 3, end: 7 }]);
  });

  it("ignores letter case, and keeps the recorded name", () => {
    expect(findMentions("@bea, you're up", [bea])).toEqual([{ ...bea, start: 0, end: 4 }]);
    expect(who("@BEA!", [bea])).toEqual(["p-bea"]);
  });

  it("matches names with a space", () => {
    expect(who("@Sir Lancelot hold the bridge", [lancelot])).toEqual(["p-lance"]);
  });

  it("takes the longest name at one @, whatever order the candidates come in", () => {
    expect(who("@Sir Lancelot go", [sir, lancelot])).toEqual(["p-lance"]);
    expect(who("@Sir Lancelot go", [lancelot, sir])).toEqual(["p-lance"]);
    expect(who("@Sir go", [lancelot, sir])).toEqual(["p-sir"]);
  });

  it("does not match a name inside a longer word", () => {
    expect(who("@Alice is not here", [al])).toEqual([]);
    expect(who("@Al1", [al])).toEqual([]);
  });

  it("does not treat @ inside a word as a mention", () => {
    expect(who("write to me at aria@Bea.example", [bea])).toEqual([]);
    expect(who("x@Bea", [bea])).toEqual([]);
  });

  it("allows punctuation after the name, and an @ after punctuation", () => {
    expect(who("@Bea, then @Bea's turn (@Cid)", [bea, cid])).toEqual(["p-bea", "p-bea", "p-cid"]);
    expect(who("hey,@Bea", [bea])).toEqual(["p-bea"]);
  });

  it("does not match when a combining mark follows the name", () => {
    expect(who("@Beá", [bea])).toEqual([]);
  });

  it("reports every occurrence, in order", () => {
    expect(who("@Bea @Cid then @Bea again", [bea, cid])).toEqual(["p-bea", "p-cid", "p-bea"]);
  });

  it("never reads a matched name's own characters as another mention", () => {
    const team: ChatMention = { participantId: "p-team", displayName: "Team @Cid" };
    expect(who("@Team @Cid go", [team, cid])).toEqual(["p-team"]);
    expect(who("@Team @Cid go @Cid", [team, cid])).toEqual(["p-team", "p-cid"]);
  });

  it("does not match text in another Unicode normalisation form than the name", () => {
    const zoe: ChatMention = { participantId: "p-zoe", displayName: "Zoë" };
    expect(who("@Zoë", [zoe])).toEqual(["p-zoe"]);
    expect(who("@Zoë", [zoe])).toEqual([]);
  });

  it("compares the same-length slice without trimming it, so a decomposed name never swallows a space", () => {
    const jose: ChatMention = { participantId: "p-jose", displayName: "Jose\u0301" };
    expect(who("@Jos\u00e9 hi", [jose])).toEqual([]);
    expect(who("@Jos\u00e9  hi", [jose])).toEqual([]);
    expect(findMentions("@Jose\u0301 hi", [jose])).toEqual([{ ...jose, start: 0, end: 6 }]);
  });

  it("finds nothing without candidates or without an @", () => {
    expect(findMentions("@Bea", [])).toEqual([]);
    expect(findMentions("Bea", [bea])).toEqual([]);
    expect(findMentions("@Nobody hi", [bea])).toEqual([]);
  });

  it("is deterministic", () => {
    const twin: ChatMention = { participantId: "p-aaa", displayName: "BEA" };
    expect(findMentions("@bea", [bea, twin])).toEqual(findMentions("@bea", [twin, bea]));
    expect(who("@bea", [bea, twin])).toEqual(["p-aaa"]);
  });
});

describe("chat mention segments (chat-mentions)", () => {
  const join = (text: string, mentions: ChatMention[]) => mentionSegments(text, mentions).map((s) => s.text).join("");

  it("splits text into plain and mention segments, keeping the text as written", () => {
    expect(mentionSegments("@bea and @Cid, flank left", [bea, cid])).toEqual([
      { kind: "mention", text: "@bea", participantId: "p-bea" },
      { kind: "text", text: " and " },
      { kind: "mention", text: "@Cid", participantId: "p-cid" },
      { kind: "text", text: ", flank left" },
    ]);
  });

  it("gives back the original text when the segments are joined", () => {
    for (const text of ["@Bea", "hi @Bea", "@Bea hi", "a @Bea b @Cid c", "<img src=x onerror=alert(1)> @Bea"]) {
      expect(join(text, [bea, cid])).toBe(text);
    }
  });

  it("is one plain segment without recorded mentions, even if the text holds @Name", () => {
    expect(mentionSegments("@Bea look", [])).toEqual([{ kind: "text", text: "@Bea look" }]);
    expect(mentionSegments("@Bea look")).toEqual([{ kind: "text", text: "@Bea look" }]);
  });

  it("leaves a shorter name inside the sender's own name plain, as decide did", () => {
    // Sir Lancelot wrote this; decide recorded only Sir, for the second @.
    const segments = mentionSegments("@Sir Lancelot reporting, @Sir go", [sir], lancelot);
    expect(segments).toEqual([
      { kind: "text", text: "@Sir Lancelot reporting, " },
      { kind: "mention", text: "@Sir", participantId: "p-sir" },
      { kind: "text", text: " go" },
    ]);
  });

  it("uses the recorded name, so a later rename changes nothing", () => {
    expect(mentionSegments("@Bea look", [bea])[0]).toEqual({ kind: "mention", text: "@Bea", participantId: "p-bea" });
  });
});

describe("shared code stays parseable by older Safari (chat-mentions)", () => {
  it("uses no regex lookbehind, which Safari before 16.4 can't parse", () => {
    const dir = new URL("../src/", import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      expect(readFileSync(new URL(file, dir), "utf8"), file).not.toMatch(/\(\?<[!=]/);
    }
  });
});
