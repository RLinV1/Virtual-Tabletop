import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatMessage } from "@vtt/shared";
import { ChatRow } from "../src/panels/ChatPanel";

const message: ChatMessage = {
  id: "m1", senderId: "p-aria", senderName: "Aria", text: "@Bea and @cid, flank left", at: null,
  mentions: [{ participantId: "p-bea", displayName: "Bea" }, { participantId: "p-cid", displayName: "Cid" }],
};
const row = (m: ChatMessage, viewerId: string | undefined) =>
  renderToStaticMarkup(<ChatRow message={m} mine={m.senderId === viewerId} viewerId={viewerId} />);
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("chat mention highlighting (chat-mentions)", () => {
  it("highlights the viewer's mention and marks the line in words for them", () => {
    const html = row(message, "p-bea");
    expect(html).toContain(`<span class="chat-mention you">@Bea</span>`);
    expect(html).toContain(`<span class="chat-mention">@cid</span>`);
    expect(html).toContain(`class="chat-message mentions-you"`);
    expect(html).toContain("Mentions you");
  });

  it("shows neutral highlights to someone who is not mentioned, such as the GM", () => {
    const html = row(message, "p-gm");
    expect(html).toContain(`<span class="chat-mention">@Bea</span>`);
    expect(html).not.toContain("chat-mention you");
    expect(html).not.toContain("mentions-you");
    expect(html).not.toContain("Mentions you");
  });

  it("keeps the text exactly as written around the highlights", () => {
    expect(text(row(message, "p-gm"))).toContain("Aria@Bea and @cid, flank left");
  });

  it("does not highlight a shorter name inside the sender's own name", () => {
    const knight: ChatMessage = {
      id: "m3", senderId: "p-lance", senderName: "Sir Lancelot", text: "@Sir Lancelot reporting, @Sir go", at: null,
      mentions: [{ participantId: "p-sir", displayName: "Sir" }],
    };
    const html = row(knight, "p-sir");
    expect(html.match(/class="chat-mention[ "]/g)).toHaveLength(1);
    expect(html).toContain(`@Sir Lancelot reporting, <span class="chat-mention you">@Sir</span> go`);
  });

  it("does not mark the sender's own line even if it names them", () => {
    const own: ChatMessage = { ...message, senderId: "p-bea", senderName: "Bea" };
    expect(row(own, "p-bea")).not.toContain("mentions-you");
  });

  it("highlights nothing in a message without recorded mentions, whatever the text says", () => {
    const plain: ChatMessage = { id: "m2", senderId: "p-aria", senderName: "Aria", text: "@Bea look", at: null };
    const html = row(plain, "p-bea");
    expect(html).not.toContain("chat-mention");
    expect(text(html)).toContain("@Bea look");
  });

  it("shows markup in a mentioning message literally", () => {
    const markup: ChatMessage = { ...message, text: "<img src=x onerror=alert(1)> @Bea" };
    const html = row(markup, "p-bea");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; ");
    expect(html).toContain(`<span class="chat-mention you">@Bea</span>`);
  });
});
