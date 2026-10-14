import { describe, expect, it } from "vitest";
import type { Participant } from "@vtt/shared";
import { MAX_MENTION_SUGGESTIONS, applyMention, mentionQuery, mentionSuggestions } from "../src/panels/chatMentionInput";

const p = (id: string, displayName: string, extra: Partial<Participant> = {}): Participant => ({ id, role: "player", displayName, ...extra });
const room = (...list: Participant[]) => Object.fromEntries(list.map((x) => [x.id, x]));
const names = (list: Participant[]) => list.map((x) => x.displayName);

describe("chat mention autocomplete (chat-mentions)", () => {
  describe("mentionQuery", () => {
    it("opens after an @ at the start or after a space or punctuation", () => {
      expect(mentionQuery("@", 1)).toEqual({ start: 0, end: 1, fragment: "" });
      expect(mentionQuery("hi @be", 6)).toEqual({ start: 3, end: 6, fragment: "be" });
      expect(mentionQuery("ok,@b", 5)).toEqual({ start: 3, end: 5, fragment: "b" });
    });
    it("does not open for an @ inside a word, such as an email", () => {
      expect(mentionQuery("aria@", 5)).toBeNull();
      expect(mentionQuery("aria@bea", 8)).toBeNull();
    });
    it("keeps spaces in the fragment, because names can have them", () => {
      expect(mentionQuery("@Sir La", 7)?.fragment).toBe("Sir La");
    });
    it("reads up to the caret, not the end of the text", () => {
      expect(mentionQuery("hi @be there", 6)).toEqual({ start: 3, end: 6, fragment: "be" });
    });
    it("has nothing to offer without an @, or past the longest name", () => {
      expect(mentionQuery("hello", 5)).toBeNull();
      expect(mentionQuery(`@${"x".repeat(41)}`, 42)).toBeNull();
      expect(mentionQuery(`@${"x".repeat(40)}`, 41)?.fragment).toHaveLength(40);
    });
  });

  describe("mentionSuggestions", () => {
    const aria = p("p-aria", "Aria");
    const bea = p("p-bea", "Bea");
    const ben = p("p-ben", "ben");
    const gm = p("p-gm", "Mara", { role: "gm" });
    const cal = p("p-cal", "Cal", { left: true });
    const dee = p("p-dee", "Dee", { revoked: true });
    const participants = room(aria, bea, ben, gm, cal, dee);

    it("offers everyone else who is active, the GM included, sorted by name", () => {
      expect(names(mentionSuggestions(participants, aria.id, ""))).toEqual(["Bea", "ben", "Mara"]);
    });
    it("narrows by what was typed, ignoring case", () => {
      expect(names(mentionSuggestions(participants, aria.id, "BE"))).toEqual(["Bea", "ben"]);
      expect(names(mentionSuggestions(participants, aria.id, "bea"))).toEqual(["Bea"]);
      expect(mentionSuggestions(participants, aria.id, "zz")).toEqual([]);
    });
    it("never offers yourself, or anyone who left or was removed", () => {
      const offered = names(mentionSuggestions(participants, aria.id, ""));
      expect(offered).not.toContain("Aria");
      expect(offered).not.toContain("Cal");
      expect(offered).not.toContain("Dee");
    });
    it("matches names with spaces, and stops once the typed text runs past a name", () => {
      const knight = p("p-knight", "Sir Lancelot");
      expect(names(mentionSuggestions(room(knight), aria.id, "Sir L"))).toEqual(["Sir Lancelot"]);
      expect(mentionSuggestions(room(bea), aria.id, "Bea ")).toEqual([]);
    });
    it("shows at most a handful at once", () => {
      const many = room(...Array.from({ length: 12 }, (_, i) => p(`p${i}`, `Player ${String(i).padStart(2, "0")}`)));
      expect(mentionSuggestions(many, undefined, "")).toHaveLength(MAX_MENTION_SUGGESTIONS);
    });
  });

  describe("applyMention", () => {
    it("replaces the typed fragment with @Name and a space, caret after the space", () => {
      const query = mentionQuery("hi @be", 6)!;
      expect(applyMention("hi @be", query, "Bea")).toEqual({ text: "hi @Bea ", caret: 8 });
    });
    it("keeps the text after the caret, reusing a space that is already there", () => {
      expect(applyMention("hi @be there", mentionQuery("hi @be there", 6)!, "Bea")).toEqual({ text: "hi @Bea there", caret: 8 });
      expect(applyMention("@bthere", mentionQuery("@bthere", 2)!, "Bea")).toEqual({ text: "@Bea there", caret: 5 });
    });
    it("handles names with spaces", () => {
      expect(applyMention("@sir", mentionQuery("@sir", 4)!, "Sir Lancelot")).toEqual({ text: "@Sir Lancelot ", caret: 14 });
    });
  });
});
