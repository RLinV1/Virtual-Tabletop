import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@vtt/shared";
import { launcherLabel, unreadCount, unreadMentionCount } from "../src/panels/ChatPanel";

const log = (...ids: string[]) => ids.map((id) => ({ id }));

describe("chat unread count (KAN-75)", () => {
  it("counts messages after the newest one seen", () => {
    expect(unreadCount(log("a", "b", "c"), "a")).toBe(2);
    expect(unreadCount(log("a", "b", "c"), "c")).toBe(0);
  });

  it("counts everything in an empty-then-filled log", () => {
    expect(unreadCount(log("a", "b"), null)).toBe(2);
    expect(unreadCount([], null)).toBe(0);
  });

  it("still sees a new message when the capped log drops the oldest and keeps its length", () => {
    // Seen "c"; the log was [a, b, c] and is now [b, c, d] — same length, one new message.
    expect(unreadCount(log("b", "c", "d"), "c")).toBe(1);
  });

  it("treats everything as unread when the seen message has left the log", () => {
    expect(unreadCount(log("x", "y", "z"), "a")).toBe(3);
  });
});

describe("chat unread mentions (chat-mentions)", () => {
  const msg = (id: string, senderId: string, mentioned: string[] = []): ChatMessage => ({
    id, senderId, senderName: senderId, text: "hi", at: null,
    ...(mentioned.length > 0 && { mentions: mentioned.map((participantId) => ({ participantId, displayName: participantId })) }),
  });

  it("counts unread messages that mention the viewer, after the newest one seen", () => {
    const chat = [msg("a", "aria", ["bea"]), msg("b", "aria", ["bea"]), msg("c", "cid"), msg("d", "cid", ["aria"])];
    expect(unreadMentionCount(chat, "a", "bea")).toBe(1);
    expect(unreadMentionCount(chat, null, "bea")).toBe(2);
    expect(unreadMentionCount(chat, "d", "bea")).toBe(0);
  });

  it("ignores messages without mentions and mentions of other people", () => {
    expect(unreadMentionCount([msg("a", "cid"), msg("b", "cid", ["aria"])], null, "bea")).toBe(0);
  });

  it("never counts your own messages", () => {
    expect(unreadMentionCount([msg("a", "bea", ["bea"])], null, "bea")).toBe(0);
  });

  it("still counts a new mention when the capped log drops the oldest and keeps its length", () => {
    expect(unreadMentionCount([msg("b", "cid"), msg("c", "cid"), msg("d", "aria", ["bea"])], "c", "bea")).toBe(1);
    expect(unreadMentionCount([msg("x", "aria", ["bea"])], "gone", "bea")).toBe(1);
  });

  it("counts nothing without a viewer", () => {
    expect(unreadMentionCount([msg("a", "aria", ["bea"])], null, undefined)).toBe(0);
  });

  it("names the unread and mention counts on the launcher", () => {
    expect(launcherLabel(0, 0)).toBe("Chat");
    expect(launcherLabel(1, 0)).toBe("Chat, 1 unread");
    expect(launcherLabel(2, 1)).toBe("Chat, 2 unread, 1 mentions you");
    expect(launcherLabel(3, 2)).toBe("Chat, 3 unread, 2 mention you");
  });
});
