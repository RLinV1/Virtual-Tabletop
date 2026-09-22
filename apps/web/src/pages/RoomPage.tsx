import { useCallback, useEffect, useMemo, useRef } from "react";
import { Board, type BoardHandle } from "../board/Board";
import { loadCredentials } from "../net/identity";
import { RoomConnection, useRoomSnapshot, type ConnectionStatus } from "../net/roomConnection";
import { DicePanel } from "../panels/DicePanel";
import { InitiativeTracker } from "../panels/InitiativeTracker";
import { TokenRoster } from "../panels/TokenRoster";
import { GmPanel } from "./GmPanel";

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
    connection.start();
    return () => connection.stop();
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
  const focusToken = useCallback((tokenId: string) => boardRef.current?.focusToken(tokenId), []);

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
    <div className="room">
      <Board ref={boardRef} connection={connection} state={state} you={you} />
      <aside className="panel">
        <header className="panel-header">
          <h1>{state.name}</h1>
          <span className={`status status-${status}`} role="status">
            {STATUS_LABEL[status]} · seq {seq}
          </span>
        </header>
        <p>
          You are <strong>{you.displayName}</strong> ({you.role === "gm" ? "GM" : "player"})
        </p>
        <section>
          <h2>Participants</h2>
          <ul className="plain">
            {Object.values(state.participants).map((p) => (
              <li key={p.id}>
                {p.displayName} <span className="muted">{p.role === "gm" ? "GM" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
        {you.role === "gm" && (
          <GmPanel connection={connection} state={state} inviteCode={inviteCode} token={token} />
        )}

        {/*
          Tactical panels are for everyone, not just the GM. A player needs the turn order,
          their own token's resources, and the shared dice log as much as the GM does — the
          server decides what each of them is allowed to see and change.
        */}
        <InitiativeTracker connection={connection} state={state} you={you} onFocusToken={focusToken} />
        <TokenRoster connection={connection} state={state} you={you} onFocusToken={focusToken} />
        <DicePanel connection={connection} state={state} isGm={you.role === "gm"} />
      </aside>
    </div>
  );
}
