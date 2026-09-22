import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "../net/api";
import { newGuestToken, saveCredentials } from "../net/identity";
import { navigate } from "../router";
import { SiteChrome } from "./SiteChrome";

/**
 * The home page (DESIGN.md §11.5). The origin of every journey and the only page a
 * stranger ever sees.
 *
 * Two actions, deliberately unequal: Play is primary and takes you to a table; Log in and
 * Sign up sit quietly in the top bar for people who have been here before.
 *
 * NOTE: §13.1 requires the copy "Free account required to host; players join without one"
 * beside Play, and a signed-out Play to route through login with a return intent. Neither
 * is implemented because authentication does not exist yet (KAN-7) — and printing that
 * sentence today would be false, since creation is currently open to anyone. Play works as
 * it does on main; the gating arrives with KAN-7.
 */
export function HomePage() {
  return (
    <SiteChrome>
      <main className="home">
        <section className="hero">
          <div className="hero-copy">
            <h1>Upload a map. Start playing.</h1>
            <p className="lede">
              A battle map becomes a playable encounter in minutes. Players join from a link
              — no account, no download.
            </p>
            <PlayForm />
          </div>
          <div className="hero-art" aria-hidden="true">
            <BoardSketch />
          </div>
        </section>

        <Chapter
          title="Prepare in one pass"
          body="Drop in a map, set the grid, place tokens and hand out an invite. Preparation
                stays yours until you publish it."
        >
          <StepStrip steps={["Map", "Grid", "Tokens", "Invite"]} />
        </Chapter>

        <Chapter
          title="Two views of one table"
          body="The GM sees hidden tokens and unrevealed geometry. Players never receive
                them — filtering happens on the server, so there is nothing to find in the
                browser."
        >
          <TwoViews />
        </Chapter>

        <Chapter
          title="Nothing is unrecoverable"
          body="Every change is an event. The log reads back in plain language, and undo
                appends a correction rather than erasing history."
        >
          <LogSketch />
        </Chapter>

        <section className="closer">
          <h2>Ready when you are</h2>
          <PlayForm compact />
        </section>
      </main>
    </SiteChrome>
  );
}

/**
 * Play. Creates a room and opens its table.
 *
 * It asks for two names rather than none: a room with no name is unfindable in a list
 * later, and the GM's display name is what every other participant sees. Both are one
 * keystroke each and the form submits on Enter.
 */
function PlayForm({ compact = false }: { compact?: boolean }) {
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = compact ? "closer" : "hero";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const guestToken = newGuestToken();
      const created = await api.createRoom({ roomName, displayName, guestToken });
      saveCredentials({ ...created, guestToken, name: roomName });
      navigate(`/r/${created.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the room");
      setBusy(false);
    }
  }

  return (
    <form className="play-form" onSubmit={onSubmit}>
      <div className="play-fields">
        <label htmlFor={`${id}-room`}>
          Room name
          <input
            id={`${id}-room`}
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            placeholder="Goblin Ambush"
            required
            maxLength={80}
          />
        </label>
        <label htmlFor={`${id}-name`}>
          Your name
          <input
            id={`${id}-name`}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Mira"
            required
            maxLength={40}
          />
        </label>
      </div>
      <button className="play" type="submit" disabled={busy}>
        {busy ? "Opening your table…" : "Play"}
      </button>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </form>
  );
}

function Chapter({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <section className="chapter">
      <div className="chapter-copy">
        <h2>{title}</h2>
        <p>{body}</p>
      </div>
      <div className="chapter-art">{children}</div>
    </section>
  );
}

/* Drawn rather than photographed: these are diagrams of the real interface, not stock
   imagery or a screenshot that would go stale the moment the UI changes. */

function BoardSketch() {
  return (
    <svg viewBox="0 0 320 220" className="sketch" role="presentation">
      <rect x="0" y="0" width="320" height="220" rx="8" className="sk-ground" />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2="220" className="sk-grid" />
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <line key={`h${i}`} x1="0" y1={i * 40} x2="320" y2={i * 40} className="sk-grid" />
      ))}
      <rect x="60" y="50" width="120" height="90" rx="4" className="sk-room" />
      <rect x="200" y="90" width="80" height="80" rx="4" className="sk-room" />
      <circle cx="100" cy="95" r="14" className="sk-token-a" />
      <circle cx="145" cy="110" r="14" className="sk-token-b" />
      <circle cx="235" cy="130" r="14" className="sk-token-c" />
    </svg>
  );
}

function StepStrip({ steps }: { steps: string[] }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={s}>
          <span className="step-n">{i + 1}</span>
          {s}
        </li>
      ))}
    </ol>
  );
}

function TwoViews() {
  return (
    <div className="two-views">
      <figure>
        <svg viewBox="0 0 160 110" className="sketch" role="presentation">
          <rect x="0" y="0" width="160" height="110" rx="6" className="sk-ground" />
          <circle cx="50" cy="55" r="12" className="sk-token-a" />
          <circle cx="105" cy="45" r="12" className="sk-token-hidden" />
          <circle cx="105" cy="45" r="12" className="sk-token-hidden-ring" />
        </svg>
        <figcaption>GM — sees the ambusher</figcaption>
      </figure>
      <figure>
        <svg viewBox="0 0 160 110" className="sketch" role="presentation">
          <rect x="0" y="0" width="160" height="110" rx="6" className="sk-ground" />
          <circle cx="50" cy="55" r="12" className="sk-token-a" />
        </svg>
        <figcaption>Player — never receives it</figcaption>
      </figure>
    </div>
  );
}

function LogSketch() {
  const rows = [
    "Mira moved Rogue to F7",
    "Tomas rolled 2d6+3 — 12",
    "GM revealed Ambusher",
  ];
  return (
    <ul className="log-sketch">
      {rows.map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  );
}
