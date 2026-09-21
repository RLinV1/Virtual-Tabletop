import { BOARD } from '../shared/protocol.js';
import { Board } from './Board.js';
import { useRoom } from './useRoom.js';

const REJECTION_TEXT: Record<string, string> = {
  not_owner: 'That token belongs to another player.',
  unknown_token: 'That token no longer exists.',
  out_of_bounds: 'That square is off the map.',
};

export function App() {
  const { status, state, you, lastRejection, moveToken } = useRoom();

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">VTT</span>
        <span className="room">{state?.roomId ?? '—'}</span>
        <span className={`status status--${status}`}>
          {status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
        </span>
        <span className="spacer" />
        {you && (
          <span className="who">
            {you.displayName} · <span className="role">{you.role.toUpperCase()}</span>
          </span>
        )}
        <span className="seq" title="Authoritative room sequence number">
          seq {state?.seq ?? 0}
        </span>
      </header>

      <main className="stage">
        {state ? (
          <Board state={state} you={you} onMove={moveToken} />
        ) : (
          <p className="empty">Waiting for the first authoritative snapshot…</p>
        )}
      </main>

      <footer className="footer">
        {lastRejection ? (
          <span className="reject">Move rejected — {REJECTION_TEXT[lastRejection] ?? lastRejection}</span>
        ) : (
          <span className="hint">
            Drag a token you own. Open a second tab to see it sync — the first tab is the GM, the rest are players.
          </span>
        )}
        <span className="dims">
          {BOARD.widthCells} × {BOARD.heightCells} cells
        </span>
      </footer>
    </div>
  );
}
