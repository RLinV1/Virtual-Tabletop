import { useState, type FormEvent } from "react";
import { api } from "../net/api";
import { saveCredentials } from "../net/identity";
import { navigate } from "../router";

export function HomePage() {
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api.createRoom({ roomName, displayName });
      saveCredentials(created);
      navigate(`/r/${created.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room");
      setBusy(false);
    }
  }

  return (
    <main className="centered">
      <form className="card" onSubmit={onSubmit}>
        <h1>Virtual Tabletop</h1>
        <p className="muted">Create a room and invite your players with a link.</p>
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
    </main>
  );
}
