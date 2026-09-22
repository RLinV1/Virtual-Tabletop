import { useState } from "react";
import type { Participant, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";

/**
 * Turn order (FR-GM-21).
 *
 * The GM rolls or types a score per token and starts the encounter; everyone then sees the
 * same order and the same active turn. Ordering is decided on the server — two clients
 * sorting a tie differently would diverge — so this only ever submits scores.
 */
export function InitiativeTracker({
  connection,
  state,
  you,
  onFocusToken,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  onFocusToken: (tokenId: string) => void;
}) {
  const isGm = you.role === "gm";
  const init = state.initiative;
  const tokens = Object.values(state.tokens);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    const entries = tokens
      .map((t) => ({ tokenId: t.id, score: Number(scores[t.id] ?? "") }))
      .filter((e) => Number.isFinite(e.score) && (scores[e.tokenId] ?? "") !== "");
    if (entries.length === 0) return setError("Give at least one token an initiative score");
    const result = await connection.command({ type: "initiative.start", entries });
    setError(result.ok ? null : result.message);
  };

  const send = async (command: Parameters<RoomConnection["command"]>[0]) => {
    const result = await connection.command(command);
    setError(result.ok ? null : result.message);
  };

  if (!init) {
    return (
      <section className="panel-section">
        <h2>Initiative</h2>
        {!isGm && <p className="muted">No encounter running.</p>}
        {isGm && (
          <>
            {tokens.length === 0 ? (
              <p className="muted">Add tokens before starting an encounter.</p>
            ) : (
              <>
                <ul className="plain init-setup">
                  {tokens.map((t) => (
                    <li key={t.id}>
                      <span className="swatch" style={{ background: t.color }} aria-hidden />
                      <label className="init-name" htmlFor={`init-${t.id}`}>
                        {t.name}
                      </label>
                      <input
                        id={`init-${t.id}`}
                        type="number"
                        inputMode="numeric"
                        value={scores[t.id] ?? ""}
                        onChange={(e) => setScores((s) => ({ ...s, [t.id]: e.target.value }))}
                        aria-label={`Initiative for ${t.name}`}
                      />
                    </li>
                  ))}
                </ul>
                <button onClick={start}>Start encounter</button>
              </>
            )}
            {error && <p role="alert" className="error">{error}</p>}
          </>
        )}
      </section>
    );
  }

  const activeId = init.order[init.activeIndex];

  return (
    <section className="panel-section">
      <h2>
        Initiative <span className="muted">· round {init.round}</span>
      </h2>

      <ol className="plain init-order">
        {init.order.map((tokenId, i) => {
          const token = state.tokens[tokenId];
          const isActive = i === init.activeIndex;
          return (
            <li key={tokenId} className={isActive ? "init-entry active" : "init-entry"}>
              <button
                type="button"
                className="init-focus"
                onClick={() => onFocusToken(tokenId)}
                aria-current={isActive ? "true" : undefined}
              >
                {/* Marked by text and position, not colour alone. */}
                <span className="init-turn" aria-hidden>
                  {isActive ? "▶" : i + 1}
                </span>
                <span className="swatch" style={{ background: token?.color ?? "#555" }} aria-hidden />
                <span className="init-name">{token?.name ?? "(removed)"}</span>
                {isActive && <span className="sr-only">— active turn</span>}
              </button>
            </li>
          );
        })}
      </ol>

      <p aria-live="polite" className="sr-only">
        {state.tokens[activeId ?? ""]?.name ?? "Unknown"} is taking their turn, round {init.round}.
      </p>

      {isGm && (
        <div className="init-controls">
          <button onClick={() => send({ type: "initiative.advance" })}>Next turn</button>
          <button className="secondary" onClick={() => send({ type: "initiative.end" })}>
            End encounter
          </button>
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}
