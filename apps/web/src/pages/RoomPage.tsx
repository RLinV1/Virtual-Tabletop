import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { GridSpec } from "@vtt/shared";
import { Board, type BoardHandle } from "../board/Board";
import { loadCredentials } from "../net/identity";
import { RoomConnection, useRoomSnapshot, type ConnectionStatus } from "../net/roomConnection";
import { RoomPanel } from "../panels/RoomPanel";
import { gridsEqual, parseGridDraft, toGridDraft, type GridDraft } from "./gridDraft";

/** Below this the panel becomes tabs and sits under the board (FR-PL-03). */
const COMPACT_WIDTH = 720;

/**
 * Tracks the narrow-screen breakpoint.
 *
 * matchMedia rather than a resize listener: it fires once per crossing instead of on every
 * pixel, and it is correct on the very first render — a phone must not paint the desktop
 * layout and then reflow.
 */
function useCompactLayout() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(`(max-width: ${COMPACT_WIDTH}px)`);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(`(max-width: ${COMPACT_WIDTH}px)`).matches,
    () => false,
  );
}


const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  open: "Connected",
  reconnecting: "Reconnecting…",
  unauthorized: "No access",
};

export function RoomPage({ roomId }: { roomId: string }) {
  const creds = useMemo(() => loadCredentials(roomId), [roomId]);
  const connection = useMemo(() => (creds ? new RoomConnection(roomId, creds.guestToken) : null), [roomId, creds]);

  useEffect(() => {
    if (!connection) return;
    // Strict Mode replays Effects on mount in development. Let its first cleanup
    // cancel the pending start before a WebSocket handshake is opened.
    const startTimer = window.setTimeout(() => connection.start(), 0);
    return () => {
      window.clearTimeout(startTimer);
      connection.stop();
    };
  }, [connection]);

  if (!creds || !connection) {
    return (
      <main className="centered">
        <div className="card">
          <h1>No access to this room</h1>
          <p className="muted">Ask the GM for an invite link.</p>
        </div>
      </main>
    );
  }
  return <Room connection={connection} inviteCode={creds.inviteCode} token={creds.guestToken} />;
}

function Room({ connection, inviteCode, token }: { connection: RoomConnection; inviteCode?: string; token: string }) {
  const { status, state, you, seq } = useRoomSnapshot(connection);
  const boardRef = useRef<BoardHandle>(null);
  const compact = useCompactLayout();
  const focusToken = useCallback((tokenId: string) => boardRef.current?.focusToken(tokenId), []);
  const [gridDraft, setGridDraft] = useState<GridDraft | null>(null);
  const [gridPreview, setGridPreview] = useState<GridSpec | null>(null);
  const [gridApplying, setGridApplying] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const committedGrid = state?.scene.grid;

  // A new map, committed grid, or role invalidates a draft tied to the previous scene.
  useEffect(() => {
    setGridDraft(null);
    setGridPreview(null);
    setGridError(null);
  }, [committedGrid, state?.scene.map, you?.role]);

  const changeGridDraft = useCallback((draft: GridDraft) => {
    setGridDraft(draft);
    const parsed = parseGridDraft(draft);
    // An incomplete field leaves the last valid preview visible while the GM edits it.
    if (parsed && committedGrid) setGridPreview(gridsEqual(parsed, committedGrid) ? null : parsed);
    setGridError(null);
  }, [committedGrid]);

  const cancelGridDraft = useCallback(() => {
    setGridDraft(null);
    setGridPreview(null);
    setGridError(null);
  }, []);

  const applyGrid = useCallback(async (grid: GridSpec) => {
    setGridApplying(true);
    setGridError(null);
    try {
      const result = await connection.command({ type: "scene.setGrid", grid });
      if (!result.ok) setGridError(result.message);
    } catch (error) {
      setGridError(error instanceof Error ? error.message : "Could not apply grid");
    } finally {
      setGridApplying(false);
    }
  }, [connection]);

  if (status === "unauthorized") {
    return (
      <main className="centered">
        <div className="card">
          <h1>No access to this room</h1>
          <p className="muted">Your invite may have been revoked. Ask the GM for a new link.</p>
        </div>
      </main>
    );
  }

  if (!state || !you) {
    return <main className="centered" aria-busy="true">{STATUS_LABEL[status]}</main>;
  }

  return (
    <div className={compact ? "room compact" : "room"}>
      {/* Keyboard and screen-reader users should not have to tab through the canvas,
          which is a single non-navigable element, to reach the controls. */}
      <a className="skip-link" href="#room-panel">
        Skip to room controls
      </a>
      <Board ref={boardRef} connection={connection} state={state} you={you} gridPreview={you.role === "gm" ? gridPreview : null} />
      <aside className="panel" id="room-panel">
        {/*
          On a phone this header competes with the board for a screen that has neither to
          spare, so it collapses to one line: room name, who you are, and connection state.
          The participant list moves into the Play tab, where it is one line of names
          rather than a titled section.
        */}
        <header className="panel-header">
          <h1>{state.name}</h1>
          <span className={`status status-${status}`} role="status">
            {STATUS_LABEL[status]} · seq {seq}
          </span>
          <p className="whoami">
            You are <strong>{you.displayName}</strong> ({you.role === "gm" ? "GM" : "player"})
          </p>
        </header>
        {!compact && (
          <section className="participants">
            <h2>Participants</h2>
            <ul className="plain">
              {Object.values(state.participants).map((p) => (
                <li key={p.id}>
                  {p.displayName} <span className="muted">{p.role === "gm" ? "GM" : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/*
          One panel for both roles. A player needs the turn order, their own token's
          resources and the shared dice log as much as the GM does; what differs is the
          administration section, and the server enforces that regardless.
        */}
        <RoomPanel
          connection={connection}
          state={state}
          you={you}
          inviteCode={inviteCode}
          token={token}
          onFocusToken={focusToken}
          gridDraft={gridDraft ?? toGridDraft(state.scene.grid)}
          hasGridDraft={gridDraft !== null}
          onGridDraftChange={changeGridDraft}
          onGridDraftCancel={cancelGridDraft}
          onGridApply={applyGrid}
          gridApplying={gridApplying}
          gridError={gridError}
          compact={compact}
        />
      </aside>
    </div>
  );
}
