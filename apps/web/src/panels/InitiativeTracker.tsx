import { useState } from "react";
import type { Participant, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";

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
  const [setupOpen, setSetupOpen] = useState(false);

  const start = async () => {
    const entries = tokens
      .map((t) => ({ tokenId: t.id, score: Number(scores[t.id] ?? "") }))
      .filter((e) => Number.isFinite(e.score) && (scores[e.tokenId] ?? "") !== "");
    if (entries.length === 0) return setError("Give at least one token an initiative score");
    const result = await connection.command({ type: "initiative.start", entries });
    setError(result.ok ? null : result.message);
    if (result.ok) {
      setSetupOpen(false);
      setScores({});
    }
  };

  const send = async (command: Parameters<RoomConnection["command"]>[0]) => {
    const result = await connection.command(command);
    setError(result.ok ? null : result.message);
  };

  if (!init) {
    return (
      <PanelSection id="initiative" title="Initiative">
        {!isGm && <p className="muted">No encounter running.</p>}
        {isGm && (
          <>
            {tokens.length === 0 ? (
              <p className="muted">Add tokens before starting an encounter.</p>
            ) : (
              <>
                <p className="muted">No encounter running.</p>
                <button type="button" data-tour="start-encounter" onClick={() => setSetupOpen(true)}>
                  Start encounter
                </button>
              </>
            )}
          </>
        )}
        <Modal open={setupOpen} title="Start encounter" onClose={() => setSetupOpen(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void start();
            }}
          >
            <p className="muted init-hint">Type each token's initiative. Highest goes first. Tokens left empty won't get a turn.</p>
            <ul className="plain init-setup">
              {tokens.map((t, i) => (
                <li key={t.id}>
                  <span className="swatch" style={{ background: t.color }} aria-hidden />
                  <label className="init-name" htmlFor={`init-${t.id}`}>
                    {t.name}
                  </label>
                  <input
                    id={`init-${t.id}`}
                    type="number"
                    inputMode="numeric"
                    placeholder="Init"
                    autoFocus={i === 0}
                    value={scores[t.id] ?? ""}
                    onChange={(e) => setScores((s) => ({ ...s, [t.id]: e.target.value }))}
                    aria-label={`Initiative for ${t.name}`}
                  />
                </li>
              ))}
            </ul>
            {error && <p role="alert" className="error">{error}</p>}
            <button type="submit">Start encounter</button>
          </form>
        </Modal>
      </PanelSection>
    );
  }

  const activeId = init.order[init.activeIndex];

  return (
    <PanelSection
      id="initiative"
      title={
        <>
          Initiative <span className="muted">· round {init.round}</span>
        </>
      }
    >
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
                {isActive && <span className="sr-only">, active turn</span>}
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
    </PanelSection>
  );
}
