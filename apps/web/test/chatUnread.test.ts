import { describe, expect, it } from "vitest";
import { unreadCount } from "../src/panels/ChatPanel";

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
