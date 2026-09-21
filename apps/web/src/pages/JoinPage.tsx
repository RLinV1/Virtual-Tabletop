import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../net/api";
import { gmRoomForInvite, guestRoomForInvite, newGuestToken, rememberInvite, saveCredentials } from "../net/identity";
import { navigate } from "../router";

/** Guest join from a shareable link (FR-PL-01). Returning guests skip straight to the room (FR-PL-02). */
export function JoinPage({ inviteCode }: { inviteCode: string }) {
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const gmRoomId = useMemo(() => gmRoomForInvite(inviteCode), [inviteCode]);

  useEffect(() => {
    const existing = guestRoomForInvite(inviteCode);
    if (existing) navigate(`/r/${existing}`, { replace: true });
  }, [inviteCode]);

  if (gmRoomId) {
    return (
      <main className="centered">
        <div className="card">
          <h1>You're the GM of this room</h1>
          <p className="muted">
            This browser is signed in as the room's GM, so it can't also join as a player. Share this
            link with your players. To test as a player yourself, open it in a private window, another
            browser, or another device.
          </p>
          <button type="button" onClick={() => navigate(`/r/${gmRoomId}`, { replace: true })}>
            Back to GM view
          </button>
        </div>
      </main>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const guestToken = newGuestToken();
      const joined = await api.joinRoom(inviteCode, { displayName, guestToken });
      saveCredentials({ ...joined, guestToken });
      rememberInvite(inviteCode, joined.roomId);
      navigate(`/r/${joined.roomId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
      setBusy(false);
    }
  }

  return (
    <main className="centered">
      <form className="card" onSubmit={onSubmit}>
        <h1>Join the table</h1>
        <label>
          Your name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={40}
            autoFocus
            autoComplete="nickname"
          />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Joining…" : "Join"}
        </button>
      </form>
    </main>
  );
}
