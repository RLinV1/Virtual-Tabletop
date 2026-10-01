import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_CHAT_LENGTH, type ChatMessage, type RoomState } from "@vtt/shared";
import { useRoomSnapshot, type RoomConnection } from "../net/roomConnection";
import { PanelSection } from "../ui/PanelSection";

/** The committed time in the viewer's locale, or empty when the message has none (KAN-75). */
function timeLabel(at: string | null): string {
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

/**
 * Room chat (KAN-75, ADR 0015): the most recent messages, oldest first, and a box to add one.
 *
 * Message text is rendered as plain React children, never as markup. The input's `maxLength`
 * is only a hint; the server validates the text and sets the sender, so nothing here decides
 * who said what.
 */
export function ChatPanel({ connection, state }: { connection: RoomConnection; state: RoomState }) {
  const { status, you } = useRoomSnapshot(connection);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLUListElement>(null);
  const newest = state.chat.at(-1)?.id;

  // Keep the newest message in view when one arrives, and on first show.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [newest]);

  const online = status === "open";
  const canSend = online && !busy && text.trim() !== "";

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    setBusy(true);
    const result = await connection.command({ type: "chat.send", text });
    setBusy(false);
    if (result.ok) {
      setText("");
      setError(null);
    } else {
      // Keep what was typed so it can be fixed and sent again.
      setError(result.message);
    }
  };

  return (
    <PanelSection id="chat" title="Chat">
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
            placeholder={online ? "Say something…" : "Offline"}
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error ? "chat-error" : undefined}
          />
          <button type="submit" disabled={!canSend}>Send</button>
        </div>
        {error && <p id="chat-error" role="alert" className="error">{error}</p>}
      </form>
    </PanelSection>
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
