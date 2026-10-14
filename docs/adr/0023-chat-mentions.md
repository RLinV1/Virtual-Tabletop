# ADR 0023: Chat mentions

**Status:** Proposed - needs review by the Real-Time Architecture owner · **Amends:** `docs/adr/0015-room-chat.md` (`ChatMessage` gains `mentions`)
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/chat-mentions`

## Context

Room chat (ADR 0015) is one public stream. A player can type "@Bea", but nothing tells Bea the line was meant for her: her unread badge looks the same as for any other message. Tagging someone has to keep pointing at the right person after a rename, and must never point at a newcomer who takes the name of someone who left. That means recording people by participant id, which changes an existing shared schema.

## Decision

### The server derives mentions from the text; `chat.send` is unchanged

`chat.send` stays `{ text }` and strict. `decide` reads the trimmed text against the room's active participants and records each one it finds, apart from the sender. The sender is still a candidate, so the longest-name rule sees their name: "Sir Lancelot" writing "@Sir Lancelot" does not tag an active "Sir". A client affects mentions only through what it writes, so a payload carrying its own `mentions` fails validation as `bad_request`, like any other extra field.

A mention is `@` followed by an active participant's current display name:

- The `@` is at the start of the text or follows a code point that is not a letter, digit or combining mark (`\p{L}\p{N}\p{M}`), so an email address is not a mention.
- The name is compared ignoring case, like display-name uniqueness, over a slice of the text the same length as the name (`foldName`: `normalizeName` without the trim, so the slice can't lose a space). Text in another Unicode form than the stored name does not match.
- The name is followed by the end of the text or by a code point that is not a letter, digit or combining mark, so "@Al" does not match inside "@Alice".
- When several names match at the same `@`, the longest wins; ties break on `participantId`, so the result is deterministic.
- At most `MAX_CHAT_MENTIONS` people are recorded, in order of first mention (a room filled before the player cap can hold more active participants).
- The sender's own name, and participants who left or were removed, are never mentions. Text with no mention is an ordinary message, never refused.

The matcher lives in `packages/shared/src/chatMentions.ts`: `findMentions` for `decide`, and `mentionSegments`, which the chat panel uses to find the spans to highlight. The panel passes the recorded mentions plus the sender, whose matches it leaves plain, which is exactly the candidate set that can win at any `@` the server recorded. Server and client use one matcher, so they cannot drift. It uses no regex lookbehind: the module loads on every page, and Safari before 16.4 cannot parse one.

### `ChatMessage.mentions?: ChatMention[]`

`ChatMention` is `{ participantId, displayName }`, where `displayName` is the name at send time, for the same reason the message keeps `senderName`: the client finds the written `@Name` in the text to highlight it, and after a rename the current name no longer appears there. Each participant appears once, in the order of their first mention, at most `MAX_CHAT_MENTIONS` (`MAX_PLAYERS_PER_ROOM + 1`, every active participant).

The field is present only when the message mentions someone (`.min(1)`, so "absent" is the one way to say nobody). A message with no mentions, and every stored event, keeps the shape it has today. `ChatMessageSent.message` is `ChatMessage.omit({ at })`, so the event gains the field with no edit of its own. `reduce` already spreads the message into state, so it needs no change.

### Visibility

Mentions are public, like the rest of chat. They carry only the ids and public display names of participants every viewer already receives, unfiltered, in `state.participants`; a mention never resolves to a token, so a hidden token's name typed after `@` is plain text. Both filters pass chat through unchanged. If `participants` is ever filtered for players, `chat[].mentions` must be filtered with it; a unit test pins the unfiltered list. A whisper would be the feature that needs filtering, not this one.

### Activity log and undo

Unchanged. The text keeps the typed `@Name`, so `"<actor> said: <text>"` reads correctly. `ChatMessageSent` stays non-reversible.

## Consequences

- **Contract change.** `ChatMessage` (and so `ChatMessageSent` and `RoomState.chat`) gains an optional field. `Command` does not change.
- **Deploy order.** Not critical. An older web client keeps the extra field without reading it (`RoomConnection` does not re-parse events) and shows plain text. An older server never emits it.
- **Rollback.** Safe. Older code keeps or strips the unknown field (zod objects strip unknown keys), so events recorded with mentions still parse and read as plain text.
- **Edge cases fail safe.** A rename between typing and sending, or text in a different Unicode normalisation form than the stored name, leaves the written `@Name` as plain text: nothing is refused, and nobody else is tagged.
- **Not covered.** Whispers, group aliases (`@everyone`, `@gm`), sounds, toasts or push notifications, and tagging tokens.

## Alternatives considered

- **The client sends `mentions: Id[]` and `decide` checks each id belongs to the room.** Rejected. Two sources of truth: the text could read "@Bob" while the list tags Carol, or the list could tag people the text never names. Preventing that needs the same text scan anyway, and it would change the command schema.
- **Inline tokens such as `<@participant-id>` in the text.** Rejected. The text stops being readable in the activity log, on older clients and in exports, the composer has to translate both ways, and an unresolved token needs a rule of its own.
- **Structured message parts.** Rejected. Replacing `text` with parts breaks every reader of chat.
- **Character offsets (`{ participantId, start, end }`).** Rejected. An offset contract in UTF-16 units that `reduce` would have to trust or check; the shared matcher finds the same spans from `displayName`.
- **`Id[]` without the name.** Rejected. After a rename the client cannot find the span to highlight.
