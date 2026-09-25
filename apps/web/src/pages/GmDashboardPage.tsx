import { useEffect, useState, type FormEvent } from "react";
import type { GmRoomSummary } from "@vtt/shared";
import { Link } from "../Link";
import { api } from "../net/api";
import { getGmToken } from "../net/gm";
import { isRecognised, loadGmToken, newGuestToken, saveCredentials } from "../net/identity";
import { navigate } from "../router";
import { AccountMenu } from "./AccountPages";

/**
 * The GM's place outside a room (gm-dashboard): create a room, reopen one, reach the
 * library. Every way in is a plain link here, and this page applies the one entry rule, so
 * a bookmark and the home page's button cannot disagree.
 */
export function GmDashboardPage() {
  const [recognised] = useState(isRecognised);

  useEffect(() => {
    // Replace, not push: Back from sign-in must not land on this redirect again.
    if (!recognised) navigate("/signin", { replace: true });
  }, [recognised]);

  if (!recognised) return null;

  return (
    <main className="home gm-dashboard">
      <header className="home-header">
        <Link href="/" className="brand">
          Virtual Tabletop
        </Link>
        <nav className="home-nav">
          <Link href="/library">Asset library</Link>
          <AccountMenu />
        </nav>
      </header>
      <h1>GM dashboard</h1>
      <div className="home-grid">
        <CreateRoomCard />
        <YourRoomsCard />
      </div>
    </main>
  );
}

/** Creating a room is a GM write, so this is where a guest's GM identity is created. */
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
    <form className="card" aria-labelledby="create-room-heading" onSubmit={onSubmit}>
      <h2 id="create-room-heading">Create a room</h2>
      <label>
        Room name
        <input
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          required
          maxLength={80}
          placeholder="The Broken Span"
        />
      </label>
      <label>
        Your name
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          maxLength={40}
          placeholder="Your name"
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy}>
        {busy ? "Creating…" : "Create room"}
      </button>
    </form>
  );
}

type RoomsState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "loaded"; rooms: GmRoomSummary[] }
  | { status: "failed" };

/** Rooms this browser's GM identity owns. No identity yet means nothing to ask for. */
function YourRoomsCard() {
  const [gmToken] = useState(loadGmToken);
  const [state, setState] = useState<RoomsState>(gmToken ? { status: "loading" } : { status: "none" });

  useEffect(() => {
    if (!gmToken) return;
    let live = true;
    api.gm.rooms(gmToken).then(
      (rooms) => live && setState({ status: "loaded", rooms }),
      () => live && setState({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [gmToken]);

  return (
    <section className="card" aria-labelledby="your-rooms-heading">
      <h2 id="your-rooms-heading">Your rooms</h2>
      {state.status === "loading" && (
        <p className="muted" aria-busy="true">
          Loading…
        </p>
      )}
      {state.status === "failed" && (
        <p role="alert" className="error">
          Your rooms could not be loaded. You can still create a room.
        </p>
      )}
      {(state.status === "none" || (state.status === "loaded" && state.rooms.length === 0)) && (
        <p className="muted">No rooms yet. Create your first one and send your players the link.</p>
      )}
      {state.status === "loaded" && state.rooms.length > 0 && (
        <ul className="plain room-list">
          {state.rooms.map((room) => (
            <li key={room.id}>
              <div>
                <strong>{room.name || "Untitled room"}</strong>
                <span className="muted"> · active {formatRelative(room.lastActiveAt)}</span>
              </div>
              <button type="button" className="secondary small" onClick={() => navigate(`/r/${room.id}`)}>
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small-print">Saved in this browser until accounts arrive.</p>
    </section>
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
