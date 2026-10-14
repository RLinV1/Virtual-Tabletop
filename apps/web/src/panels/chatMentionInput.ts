import { isActive, type Participant } from "@vtt/shared";

/** Longest display name: a fragment longer than any name can't be a mention being typed. */
const MAX_NAME_LENGTH = 40;
/** Most names the list shows at once; typing more letters narrows it. */
export const MAX_MENTION_SUGGESTIONS = 8;

/** The mention being typed: where its `@` is, where the caret is, and what is between them. */
export interface MentionQuery {
  start: number;
  end: number;
  fragment: string;
}

/**
 * The mention being typed at `caret` (chat-mentions), or null. Like the server's rule, the `@`
 * must start the text or follow something that is not part of a word, so "aria@" in an email
 * never opens the list. The fragment may hold spaces, because names can.
 */
export function mentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1 || caret - at - 1 > MAX_NAME_LENGTH) return null;
  if (/[\p{L}\p{N}\p{M}]$/u.test(before.slice(0, at))) return null;
  return { start: at, end: caret, fragment: before.slice(at + 1) };
}

/**
 * Who to offer for `fragment`: the room's active participants other than the viewer, whose names
 * start with it ignoring case, sorted by name. Surrounding spaces count here (unlike the server's
 * name comparison), so "@Bea " after a pick doesn't reopen the list.
 */
export function mentionSuggestions(participants: Record<string, Participant>, viewerId: string | undefined, fragment: string): Participant[] {
  const key = fold(fragment);
  return Object.values(participants)
    .filter((p) => isActive(p) && p.id !== viewerId && fold(p.displayName).startsWith(key))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, MAX_MENTION_SUGGESTIONS);
}

/**
 * `text` with the typed `@fragment` replaced by `@Name ` and the caret after the space. A space
 * already after the caret is reused rather than doubled.
 */
export function applyMention(text: string, query: MentionQuery, displayName: string): { text: string; caret: number } {
  const rest = text.slice(query.end);
  const head = `${text.slice(0, query.start)}@${displayName}`;
  return rest.startsWith(" ")
    ? { text: head + rest, caret: head.length + 1 }
    : { text: `${head} ${rest}`, caret: head.length + 1 };
}

const fold = (s: string) => s.normalize("NFC").toLocaleLowerCase("en-US");
