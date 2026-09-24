import { useEffect, useState, type FormEvent } from "react";
import type { GmRoomSummary } from "@vtt/shared";
import { Link } from "../Link";
import { api } from "../net/api";
import { getGmToken } from "../net/gm";
import { loadGmToken, newGuestToken, saveCredentials } from "../net/identity";
import { navigate } from "../router";
import { AccountMenu } from "./AccountPages";

/** Landing for newcomers; the GM dashboard once this browser has a GM identity (gm-home). */
export function HomePage() {
  const [gmToken] = useState(loadGmToken);
  return gmToken ? <Dashboard gmToken={gmToken} /> : <Landing />;
}

function Landing() {
  return (
    <main className="home">
      <header className="home-header">
        <span className="brand">Virtual Tabletop</span>
        <nav className="home-nav">
          <Link href="/signin">Sign in</Link>
          <Link href="/signup">Create account</Link>
        </nav>
      </header>
      <section className="hero">
        <h1>From battle map to table in minutes.</h1>
        <p className="muted">
          Upload a map, line up the grid, place your tokens and send your players a link. They join from any
          browser, with no account and nothing to install.
        </p>
      </section>
      <div className="home-grid">
        <CreateRoomCard />
        <div className="stack">
          <JoinByInviteCard />
          <section className="card">
            <h2>Prepare ahead</h2>
            <p className="muted">Keep your maps (with their grids) and token art in one place, ready for any room.</p>
            <Link href="/library">Open the asset library</Link>
          </section>
        </div>
      </div>
    </main>
  );
}

function Dashboard({ gmToken }: { gmToken: string }) {
  const [rooms, setRooms] = useState<GmRoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.gm.rooms(gmToken).then(setRooms, (err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not load your rooms"),
    );
  }, [gmToken]);

  return (
    <main className="home">
      <header className="home-header">
        <span className="brand">Virtual Tabletop</span>
        <nav className="home-nav">
          <Link href="/library">Asset library</Link>
          <AccountMenu />
        </nav>
      </header>
      <div className="home-grid">
        <section className="card wide">
          <h1>My rooms</h1>
          {error && <p role="alert" className="error">{error}</p>}
          {!rooms && !error && <p className="muted" aria-busy="true">Loading…</p>}
          {rooms?.length === 0 && <p className="muted">No rooms yet. Create one to get started.</p>}
          {rooms && rooms.length > 0 && (
            <ul className="plain room-list">
              {rooms.map((room) => (
                <li key={room.id}>
                  <div>
                    <strong>{room.name || "Untitled room"}</strong>
                    <span className="muted"> · active {formatRelative(room.lastActiveAt)}</span>
                  </div>
                  <button type="button" className="small" onClick={() => navigate(`/r/${room.id}`)}>
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="stack">
          <CreateRoomCard />
          <JoinByInviteCard />
        </div>
      </div>
    </main>
  );
}

function CreateRoomCard() {
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const gmToken = await getGmToken();
      const guestToken = newGuestToken();
      const created = await api.createRoom({ roomName, displayName, guestToken, gmToken });
      saveCredentials({ ...created, guestToken });
      navigate(`/r/${created.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room");
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>New room</h2>
      <label>
        Room name
        <input value={roomName} onChange={(e) => setRoomName(e.target.value)} required maxLength={80} />
      </label>
      <label>
        Your name (GM)
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={40} />
      </label>
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create room"}
      </button>
    </form>
  );
}

/** Accepts a full invite link or a bare code. */
export function inviteCodeFrom(input: string): string | null {
  const trimmed = input.trim();
  const fromLink = trimmed.match(/\/join\/([^/?#\s]+)/);
  if (fromLink) return decodeURIComponent(fromLink[1]!);
  return /^[a-z0-9]{4,32}$/i.test(trimmed) ? trimmed : null;
}

function JoinByInviteCard() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        const code = inviteCodeFrom(value);
        if (!code) return setError("That doesn't look like an invite link or code.");
        navigate(`/join/${encodeURIComponent(code)}`);
      }}
    >
      <h2>Have an invite?</h2>
      <label>
        Invite link or code
        <input value={value} onChange={(e) => setValue(e.target.value)} required placeholder="https://…/join/abc123" />
      </label>
      {error && <p role="alert" className="error">{error}</p>}
      <button type="submit" className="secondary">
        Join
      </button>
    </form>
  );
}

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString();
}
