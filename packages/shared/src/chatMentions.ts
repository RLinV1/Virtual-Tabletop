import { foldName } from "./names";
import type { ChatMention } from "./state";

/** A mention found in chat text: who, under which name, and where (UTF-16 offsets, `@` included). */
export interface MentionMatch extends ChatMention {
  start: number;
  end: number;
}

/** A piece of a chat message as the panel draws it: plain text, or a highlighted mention. */
export type ChatSegment = { kind: "text"; text: string } | { kind: "mention"; text: string; participantId: string };

// No lookbehind: this module loads on every page, and Safari before 16.4 can't parse one.
/** Text ending in part of a word: an `@` right after it is not a mention ("aria@Bea"). */
const WORD_END = /[\p{L}\p{N}\p{M}]$/u;
/** Text starting with part of a word: a name must not run on into it ("@Al" in "@Alice"). */
const WORD_START = /^[\p{L}\p{N}\p{M}]/u;

/**
 * Every mention of `candidates` in `text`, in order (ADR 0035). A mention is an `@` at the start
 * of the text or after anything that is not a letter, digit or combining mark, followed by a
 * candidate's name, compared ignoring case (`foldName`) and not followed by a letter, digit or
 * combining mark. When several names match at one `@` the longest wins, ties broken by id, so the
 * same input always gives the same result. Text in another Unicode form than the stored name does
 * not match. The same person can appear more than once; callers that record mentions dedupe.
 *
 * `decide` passes the room's active participants; the chat panel passes a message's recorded
 * mentions plus its sender, so both find the same spans with one matcher.
 */
export function findMentions(text: string, candidates: readonly ChatMention[]): MentionMatch[] {
  if (candidates.length === 0 || !text.includes("@")) return [];
  const ordered = candidates
    .map((c) => ({ ...c, key: foldName(c.displayName) }))
    .sort((a, b) => b.displayName.length - a.displayName.length || compare(a.participantId, b.participantId));
  const found: MentionMatch[] = [];
  for (let start = text.indexOf("@"); start !== -1; start = text.indexOf("@", start + 1)) {
    if (WORD_END.test(text.slice(Math.max(0, start - 2), start))) continue;
    const hit = ordered.find((c) => {
      const end = start + 1 + c.displayName.length;
      return end <= text.length
        && foldName(text.slice(start + 1, end)) === c.key
        && !WORD_START.test(text.slice(end, end + 2));
    });
    if (!hit) continue;
    const end = start + 1 + hit.displayName.length;
    found.push({ participantId: hit.participantId, displayName: hit.displayName, start, end });
    // Resume after the name, so its own characters are never read as another mention.
    start = end - 1;
  }
  return found;
}

/**
 * `text` split into plain and mention segments for drawing, using the names the message recorded
 * (ADR 0035). `sender` is matched too and left plain, as `decide` did: when Sir Lancelot writes
 * "@Sir Lancelot", the "@Sir" inside it is not a mention of Sir. Mention segments keep the text
 * exactly as written, so joining every segment gives back `text`. A message with no recorded
 * mentions is one plain segment, whatever it says.
 */
export function mentionSegments(text: string, mentions: readonly ChatMention[] = [], sender?: ChatMention): ChatSegment[] {
  if (mentions.length === 0) return [{ kind: "text", text }];
  const candidates = sender && !mentions.some((m) => m.participantId === sender.participantId) ? [...mentions, sender] : mentions;
  const segments: ChatSegment[] = [];
  let last = 0;
  for (const m of findMentions(text, candidates)) {
    if (m.participantId === sender?.participantId) continue;
    if (m.start > last) segments.push({ kind: "text", text: text.slice(last, m.start) });
    segments.push({ kind: "mention", text: text.slice(m.start, m.end), participantId: m.participantId });
    last = m.end;
  }
  if (last < text.length || segments.length === 0) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
