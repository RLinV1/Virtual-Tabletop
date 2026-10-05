import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChatCircleText, X } from "@phosphor-icons/react";
import { MAX_CHAT_LENGTH, type ChatMessage, type Participant, type RoomState } from "@vtt/shared";
import { useRoomSnapshot, type RoomConnection } from "../net/roomConnection";

/**
 * Messages after the newest one seen, by identity. The log is capped, so a new message can push the
 * oldest out and leave the length unchanged; a seen message that has left the log means everything
 * now in it is newer.
 */
export function unreadCount(chat: readonly { id: string }[], seenId: string | null): number {
  const seenAt = seenId === null ? -1 : chat.findIndex((m) => m.id === seenId);
  return seenAt === -1 ? chat.length : chat.length - 1 - seenAt;
}

/** The committed time in the viewer's locale, or empty when the message has none (KAN-75). */
function timeLabel(at: string | null): string {
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

/**
 * Room chat (KAN-75, ADR 0015): a floating button at the bottom right of the screen that opens a
 * popup with the most recent messages, oldest first, and a box to add one.
 *
 * Message text is rendered as plain React children, never as markup. The input's `maxLength`
 * is only a hint; the server validates the text and sets the sender, so nothing here decides
 * who said what.
 */
export function ChatPanel({
  connection,
  state,
  you: viewer,
  readOnly = false,
}: {
  connection: RoomConnection;
  state: RoomState;
  /** Who is looking, when that is not the connection's own seat: the GM previewing as a player. */
  you?: Participant;
  /** The GM is previewing as a player (gm-view-as-player): messages are shown but cannot be sent. */
  readOnly?: boolean;
}) {
  const { status, you: self } = useRoomSnapshot(connection);
  const you = viewer ?? self;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  /**
   * The newest message seen so far. Unread is counted after it by identity, not by length: the log
   * is capped, so a new message can push the oldest out and leave the length unchanged.
   */
  const [seenId, setSeenId] = useState<string | null>(state.chat.at(-1)?.id ?? null);
  const log = useRef<HTMLUListElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const newest = state.chat.at(-1)?.id;
  const unread = open ? 0 : unreadCount(state.chat, seenId);

  // Keep the newest message in view when one arrives, and on first show.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newest, open]);

  useEffect(() => {
    if (open) setSeenId(newest ?? null);
  }, [open, newest]);

  const online = status === "open";
  const canSend = online && !readOnly && !busy && text.trim() !== "";

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true);
    const result = await connection.command({ type: "chat.send", text });
    setBusy(false);
    if (result.ok) {
      // Only what was sent: anything typed while waiting for the server is the next message.
      setText((current) => (current === text ? "" : current));
      setError(null);
    } else {
      // Keep what was typed so it can be fixed and sent again.
      setError(result.message);
    }
  };

  return (
    <div className="chat-widget" data-tour="chat">
      {open && (
        <section className="chat-popup" aria-label="Chat">
          <header className="chat-popup-header">
            <h2>Chat</h2>
            <button type="button" className="icon-button" aria-label="Close chat"
              onClick={() => {
                setOpen(false);
                // The button unmounts with the popup, so hand focus to the launcher.
                launcher.current?.focus();
              }}
            >
              <X size={16} aria-hidden />
            </button>
          </header>
      {state.chat.length === 0 ? (
        <p className="muted">No messages yet.</p>
      ) : (
        <ul className="plain chat-log" ref={log} aria-label="Chat messages" aria-live="polite" tabIndex={0}>
          {state.chat.map((m) => (
            <ChatRow key={m.id} message={m} mine={m.senderId === you?.id} />
          ))}
        </ul>
      )}
      <form onSubmit={send} className="chat-form">
        <label htmlFor="chat-text" className="sr-only">Message</label>
        <div className="dice-row">
          <input
            id="chat-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            maxLength={MAX_CHAT_LENGTH}
            disabled={readOnly}
            placeholder={readOnly ? "Chat is read-only while previewing" : online ? "Say something…" : "Offline"}
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error ? "chat-error" : undefined}
          />
          <button type="submit" disabled={!canSend}>Send</button>
        </div>
        {error && <p id="chat-error" role="alert" className="error">{error}</p>}
      </form>
        </section>
      )}
      <button
        ref={launcher}
        type="button"
        className="chat-fab"
        aria-label={unread > 0 ? `Chat, ${unread} unread` : "Chat"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChatCircleText size={24} weight="fill" aria-hidden />
        {unread > 0 && <span className="chat-badge" aria-hidden>{unread > 9 ? "9+" : unread}</span>}
      </button>
    </div>
  );
}

function ChatRow({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const time = timeLabel(message.at);
  return (
    <li className={mine ? "chat-message mine" : "chat-message"}>
      <span className="chat-meta">
        <strong className="chat-sender">{message.senderName}</strong>
        {time && <time dateTime={message.at ?? undefined} className="muted">{time}</time>}
      </span>
      <span className="chat-text">{message.text}</span>
    </li>
  );
}
