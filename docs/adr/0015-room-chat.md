# ADR 0015: Room chat

**Status:** Proposed — needs review by the Real-Time Architecture owner · **Amends:** `docs/adr/0001-event-model.md` (new command and event, `reduce` metadata), `docs/adr/0013-undo.md` (`EventMeta` fields become optional)
**Owner:** Real-Time Architecture (Raymond) · **Changes:** `openspec/changes/room-chat` · **Ticket:** KAN-75

## Context

Players and the GM have no way to talk inside a room, so a table leans on a separate voice or text app. A small chat keeps table talk next to the board and in the room's history. It has to go through the normal pipeline (`Command → decide → events → append → reduce → broadcast`), so three things need a decision: who the sender is, what text is acceptable, and how `reduce` can show a time when it may not read a clock.

## Decision

### `chat.send { text }`

Any active participant, GM or player, may send. The command is a **strict** zod object, so a payload with an extra field such as `senderId` or `senderName` fails validation instead of being silently stripped. A forgery attempt is refused, visible and testable. Schema failures reach the client as `bad_request`, like any other malformed command.

`ChatText` is trimmed, 1 to 500 characters (`MAX_CHAT_LENGTH`), and may not contain any `\p{Cc}` character (control characters, so no line breaks, tabs inside the text or NUL) or any `\p{Cf}` character (invisible formatting, such as the right-to-left override U+202E or zero-width characters that could make text read differently from what it is), except the zero-width joiner and non-joiner, which emoji sequences and Persian and Indic scripts need. Lone surrogates (`\p{Cs}`) are refused because Postgres `jsonb` cannot store them. The text must show at least one visible character, so a message of only blanks such as U+3164 or U+2800 is refused. Trimming happens first, so a trailing newline is dropped rather than refused. Markup is ordinary text and is stored verbatim; rendering it safely is the client's job.

`decide` refuses a `left` or `revoked` actor as `forbidden`. The socket layer already refuses ended seats, but `decide` is the authority (invariant 7).

### `ChatMessageSent { message: { id, senderId, senderName, text } }`

`id` comes from `DecideContext.newId`. `senderId` and `senderName` are taken from the actor in `decide`, never from the payload. The name is the one the actor had when sending, so the log reads correctly after a rename. The event replaces nothing, so there is no `previous` (invariant 6). It is not reversible: `undo.ts` treats it as any non-reversible event, and an action containing it is never undoable.

### `RoomState.chat`

`chat: ChatMessage[]`, where `ChatMessage` is the event's message plus `at: string | null`. Oldest first, capped at `CHAT_LOG_LIMIT = 200`, newest kept, like `rolls` and `ROLL_LOG_LIMIT`. Older messages stay in the event log (invariant 5). Snapshots carry `chat`, so a reload or a late join shows earlier messages with no extra read path. `emptyRoomState` has `chat: []`, and a replay of an older log, which has no chat events, ends with `chat: []`. No migration is needed.

### The time: `EventMeta.at`

`reduce` cannot read a clock (invariant 2), but messages need a time. `CommittedEvent.at` already holds the server's commit time, so `EventMeta` gains `at`, filled by `eventMeta`, and `reduce` stamps `message.at = meta?.at ?? null`. The same committed event always gives the same state.

Players' clients get events without a `commandId` (ADR 0013), so they call `reduce` with no undo meta. To give them times without an undo history, every `EventMeta` field is now optional, and `reduce` records undo only when `meta.commandId` is present. A client passes `{ at }` alone. `RoomConnection` does this for events with no `commandId`. `recordUndo` is unchanged for the GM, who still passes the full meta through `reduceCommitted`.

### Visibility

Chat is public to everyone in the room. `filterEventForViewer` has an explicit `ChatMessageSent` case that passes the event (with `commandId` stripped, like every player event), and `filterStateForViewer` leaves `chat` in the snapshot. Nothing in a message names a hidden token or a GM-only roll. The Socket.IO broadcast is per room, so another room never receives it.

### Activity log

`"<actor> said: <text>"`, with the text cut to 80 characters and an ellipsis when longer. The activity log is GM-only, so the GM can search what was said by player name.

### Chat panel

A section in the Play tab of `RoomPanel`. It lists messages oldest first with the sender and local time, scrolls to the newest, sends on Enter, clears on success, shows the server's reason and keeps the text on refusal, and cannot send while empty or offline. The input has `maxLength=500` as a hint only. Text is rendered as React children: no `dangerouslySetInnerHTML`, no markup, no links.

## Consequences

- **Contract change.** `Command` (`chat.send`), `DomainEvent` (`ChatMessageSent`), `RoomState` (`chat`), and `EventMeta`/`reduce` change. All additions are optional or defaulted, and existing logs replay unchanged.
- **Deploy web and server together.** An older reducer's `assertNever` throws on the new event and the client would resync in a loop, as with every earlier event addition.
- **Rollback.** Rolling the code back after chat has been used would leave `ChatMessageSent` rows an older reducer cannot read; those rooms would need the rows handled by hand.
- **Spam.** The length cap and the 200-message state cap bound memory. Each connection may send at most 10 chat messages per 10 seconds (checked in `ws/socket.ts` before the command reaches the room queue, refused as `invalid`), which bounds how fast one seat can grow the event log. A participant with several tabs gets that allowance per tab; a per-participant limit across connections is a follow-up.
- **Not covered.** Whispers or GM-only messages (they would need visibility filters), dice in chat, edit or delete, reactions, markdown and links.

## Alternatives considered

- **Strip unknown fields silently.** Rejected. Explicit rejection makes forgery attempts visible and testable.
- **A REST history endpoint.** Rejected. A second read path that also needs filtering, for no gain at this size.
- **Client-side timestamps.** Rejected. A client clock is neither authoritative nor the same for everyone.
- **Give players a `commandId` so `reduceCommitted` works for them.** Rejected. An id shared with a redacted event would reveal that a hidden change was part of the same action (ADR 0013).
- **A separate `at` argument to `reduce`.** Rejected in favour of making `EventMeta` fields optional: a smaller change, and `reduceCommitted` already supplies the meta on the server.
