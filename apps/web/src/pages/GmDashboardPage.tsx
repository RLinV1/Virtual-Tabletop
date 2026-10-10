import { useEffect, useRef, useState, type FormEvent } from "react";
import { DEFAULT_PRESET_ID, GAME_PRESETS, presetOf } from "@vtt/shared";
import type { EncounterSummary, GmRoomSummary, LegacySummary, MyRoomsResponse } from "@vtt/shared";
import { AccountMenu } from "../account/AccountPages";
import { RequireAccount } from "../account/RequireAccount";
import { Link } from "../Link";
import { api, ApiError } from "../net/api";
import { forgetGmToken, newGuestToken, saveCredentials } from "../net/identity";
import { legacyOffer } from "../net/legacy";
import { ensureSeat } from "../net/seats";
import { navigate } from "../router";
import { Modal } from "../ui/Modal";

/**
 * The signed-in person's place outside a room (gm-dashboard, room-membership): create a room,
 * reopen any room they host or play in from any device, reach the library. Every way in is a
 * plain link, and `RequireAccount` applies the one entry rule.
 */
export function GmDashboardPage() {
  return (
    <RequireAccount>
      <Dashboard />
    </RequireAccount>
  );
}

type RoomsState = { status: "loading" } | { status: "loaded"; rooms: MyRoomsResponse } | { status: "failed" };

function Dashboard() {
  const [rooms, setRooms] = useState<RoomsState>({ status: "loading" });
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let live = true;
    api.me.rooms().then(
      (loaded) => live && setRooms({ status: "loaded", rooms: loaded }),
      () => live && setRooms({ status: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [refresh]);

  return (
    <main className="home gm-page">
      <header className="home-header">
        <Link href="/" className="brand">
          Virtual Tabletop
        </Link>
        <nav className="home-nav">
          <Link href="/library">Asset library</Link>
          <AccountMenu />
        </nav>
      </header>
      <h1>Your rooms</h1>
      <LegacyMoveBanner onMoved={() => setRefresh((n) => n + 1)} />
      <div className="home-grid">
        <CreateRoomCard />
        <HostingCard state={rooms} onDeleted={(id) => setRooms((s) => withoutRoom(s, id))} />
        <PlayingCard state={rooms} />
      </div>
      <p className="muted small-print">Your rooms and library are saved to your account, on any device you sign in on.</p>
    </main>
  );
}

function withoutRoom(state: RoomsState, id: string): RoomsState {
  if (state.status !== "loaded") return state;
  return { status: "loaded", rooms: { ...state.rooms, hosting: state.rooms.hosting.filter((r) => r.id !== id) } };
}

/** Hosting needs the account, which the session cookie carries; the GM seat is kept on it too. */
function CreateRoomCard() {
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The GM's saved encounters, offered as a starting board (encounter-templates, FR-GM-13). */
  const [templates, setTemplates] = useState<EncounterSummary[]>([]);
  const [templateId, setTemplateId] = useState("");
  /** The game the room is set up for (KAN-63); the registry's default unless the GM picks another. */
  const [preset, setPreset] = useState(DEFAULT_PRESET_ID);

  useEffect(() => {
    let live = true;
    // Best effort: with no templates, or a failed load, the form is just the plain one.
    api.library.encounters.list().then((list) => live && setTemplates(list.filter((t) => t.mapName !== null)), () => {});
    return () => {
      live = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const guestToken = newGuestToken();
      const created = await api.createRoom({ roomName, displayName, guestToken, preset, ...(templateId && { templateId }) });
      saveCredentials({ ...created, guestToken, viaAccount: true });
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
      {/* Only a choice once there is more than one game (KAN-63). */}
      {GAME_PRESETS.length > 1 && <fieldset className="preset-choice">
        <legend>Game</legend>
        {GAME_PRESETS.map((p) => (
          <label key={p.id} className="preset-option">
            <input type="radio" name="preset" value={p.id} checked={preset === p.id} onChange={() => setPreset(p.id)} />
            <span>
              <strong>{p.name}</strong>
              <span className="muted small-print">{p.description}</span>
            </span>
          </label>
        ))}
      </fieldset>}
      {templates.length > 0 && (
        <label>
          Start from template
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Empty room</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
      )}
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

/**
 * Opens a room on this device: the seat it already has, or the account's seat resumed here
 * (room-membership). A refusal is shown on the card instead of opening a room that won't let us in.
 */
function useOpenRoom() {
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function open(room: GmRoomSummary) {
    setOpening(room.id);
    setError(null);
    try {
      await ensureSeat(room.id);
      navigate(`/r/${room.id}`);
    } catch (err) {
      setError(`${room.name || "Untitled room"} could not be opened. ${err instanceof Error ? err.message : ""}`.trim());
      setOpening(null);
    }
  }
  return { open, opening, error };
}

function RoomRow(props: { room: GmRoomSummary; opening: boolean; onOpen: () => void; onDelete?: () => void }) {
  const name = props.room.name || "Untitled room";
  return (
    <li>
      <div>
        <strong>{name}</strong>
        <span className="muted"> · {presetOf(props.room).name} · active {formatRelative(props.room.lastActiveAt)}</span>
      </div>
      <div className="row">
        <button type="button" className="secondary small" onClick={props.onOpen} disabled={props.opening}>
          {props.opening ? "Opening…" : "Open"}
        </button>
        {props.onDelete && (
          <button type="button" className="secondary small danger" onClick={props.onDelete} aria-label={`Delete ${name}`}>
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

/** Rooms the account owns. */
function HostingCard({ state, onDeleted }: { state: RoomsState; onDeleted: (id: string) => void }) {
  const { open, opening, error } = useOpenRoom();
  /** The room awaiting delete confirmation. */
  const [confirming, setConfirming] = useState<GmRoomSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  async function deleteRoom(room: GmRoomSummary) {
    setDeleting(true);
    try {
      await api.rooms.remove(room.id);
      // Only after the server confirms: a failed delete must leave the row where it was.
      onDeleted(room.id);
      setDeleteError(null);
    } catch {
      setDeleteError(`${room.name || "Untitled room"} could not be deleted. Try again.`);
    } finally {
      setDeleting(false);
      setConfirming(null);
    }
  }

  const hosting = state.status === "loaded" ? state.rooms.hosting : [];
  return (
    <section className="card" aria-labelledby="hosting-heading">
      <h2 id="hosting-heading">Hosting</h2>
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
      {(error || deleteError) && (
        <p role="alert" className="error">
          {error ?? deleteError}
        </p>
      )}
      {state.status === "loaded" && hosting.length === 0 && (
        <p className="muted">No rooms yet. Create your first one and send your players the link.</p>
      )}
      {hosting.length > 0 && (
        <ul className="plain room-list">
          {hosting.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              opening={opening === room.id}
              onOpen={() => void open(room)}
              onDelete={() => setConfirming(room)}
            />
          ))}
        </ul>
      )}
      <Modal
        open={confirming !== null}
        title={`Delete ${confirming?.name || "Untitled room"}?`}
        onClose={() => !deleting && setConfirming(null)}
        initialFocus={cancelRef}
      >
        <p>
          <strong>{confirming?.name || "Untitled room"}</strong> and everything in it will be permanently deleted: the
          map, tokens, fog, dice rolls, history, and every player&apos;s seat. Anyone in the room right now is removed.
        </p>
        <p className="muted">
          This cannot be undone. Images in your asset library are kept; the invite link stops working.
        </p>
        <div className="row modal-actions">
          <button ref={cancelRef} type="button" className="secondary" onClick={() => setConfirming(null)} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            className="danger-fill"
            onClick={() => confirming && void deleteRoom(confirming)}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete room"}
          </button>
        </div>
      </Modal>
    </section>
  );
}

/** Rooms where the account holds an active player seat. Left out entirely when there are none. */
function PlayingCard({ state }: { state: RoomsState }) {
  const { open, opening, error } = useOpenRoom();
  if (state.status !== "loaded" || state.rooms.playing.length === 0) return null;
  return (
    <section className="card" aria-labelledby="playing-heading">
      <h2 id="playing-heading">Playing</h2>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <ul className="plain room-list">
        {state.rooms.playing.map((room) => (
          <RoomRow key={room.id} room={room} opening={opening === room.id} onOpen={() => void open(room)} />
        ))}
      </ul>
    </section>
  );
}

type LegacyState =
  | { status: "none" }
  | { status: "offer"; summary: LegacySummary }
  | { status: "moving"; summary: LegacySummary }
  | { status: "moved"; summary: LegacySummary }
  | { status: "failed"; summary: LegacySummary; message: string };

/**
 * A browser that still holds a GM token from before accounts is offered, here and only when the
 * person chooses, to move what that token owns into the account (gm-dashboard, ADR 0017 O2).
 * A token the server no longer knows is forgotten without asking (gm-identity-recovery).
 */
function LegacyMoveBanner({ onMoved }: { onMoved: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<LegacyState>({ status: "none" });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let live = true;
    void legacyOffer().then((offer) => {
      if (!live || !offer) return;
      setToken(offer.token);
      setState({ status: "offer", summary: offer.summary });
    });
    return () => {
      live = false;
    };
  }, []);

  async function move(summary: LegacySummary) {
    if (!token) return;
    setState({ status: "moving", summary });
    try {
      const moved = await api.legacy.claim(token);
      forgetGmToken();
      setState({ status: "moved", summary: moved });
      onMoved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        forgetGmToken();
        setState({ status: "none" });
        return;
      }
      setState({ status: "failed", summary, message: err instanceof Error ? err.message : "Try again." });
    }
  }

  if (state.status === "none" || dismissed) return null;
  if (state.status === "moved") {
    return (
      <p role="status" className="notice">
        Moved into your account: {describeCounts(state.summary)}.
      </p>
    );
  }
  return (
    <section className="notice legacy-move" aria-labelledby="legacy-move-heading">
      <h2 id="legacy-move-heading">Bring this browser&apos;s rooms into your account</h2>
      <p>
        This browser has {describeCounts(state.summary)} from before accounts. Move them into your account to open them on
        any device.
      </p>
      {state.status === "failed" && (
        <p role="alert" className="error">
          Nothing was moved. {state.message}
        </p>
      )}
      <div className="row">
        <button type="button" onClick={() => void move(state.summary)} disabled={state.status === "moving"}>
          {state.status === "moving" ? "Moving…" : "Move into my account"}
        </button>
        <button type="button" className="secondary" onClick={() => setDismissed(true)} disabled={state.status === "moving"}>
          Not now
        </button>
      </div>
    </section>
  );
}

function describeCounts(s: LegacySummary): string {
  const parts = [
    [s.rooms, "room", "rooms"],
    [s.assets, "library image", "library images"],
    [s.creatures, "creature", "creatures"],
    [s.diceLooks, "dice look", "dice looks"],
  ] as const;
  const named = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  return named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named.at(-1)}` : (named[0] ?? "nothing");
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
