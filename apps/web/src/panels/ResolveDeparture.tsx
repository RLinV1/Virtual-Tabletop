import { useId, useState } from "react";
import { isActive, type DepartureAction, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";

/**
 * The GM decides, token by token, what happens to what a departed player owned (KAN-58,
 * ADR 0006). Rows come from live state, so a token deleted or re-owned elsewhere while this
 * is open simply drops out. Everything chosen is sent as one command and committed together.
 */

/** "" is "Decide later"; "reassign:<id>" names the new owner. */
type Choice = "" | "unassign" | "delete" | `reassign:${string}`;

export function ResolveDepartureModal({
  connection,
  state,
  participantId,
  onClose,
}: {
  connection: RoomConnection;
  state: RoomState;
  /** The departed participant under review; null keeps the modal closed. */
  participantId: string | null;
  onClose: () => void;
}) {
  const departed = participantId ? state.participants[participantId] : undefined;
  return (
    <Modal open={!!departed} title={departed ? `${departed.displayName}'s tokens` : "Tokens"} onClose={onClose}>
      {departed && (
        <ResolveForm key={departed.id} connection={connection} state={state} departed={departed} onDone={onClose} />
      )}
    </Modal>
  );
}

function ResolveForm({
  connection,
  state,
  departed,
  onDone,
}: {
  connection: RoomConnection;
  state: RoomState;
  departed: Participant;
  onDone: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allId = useId();

  const tokens = Object.values(state.tokens)
    .filter((t) => t.ownerIds.includes(departed.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const players = Object.values(state.participants).filter((p) => p.role === "player" && isActive(p));
  const name = (id: string) => state.participants[id]?.displayName ?? "someone";

  const choiceOf = (tokenId: string): Choice => choices[tokenId] ?? "";
  const actions: DepartureAction[] = tokens.flatMap((t): DepartureAction[] => {
    const c = choiceOf(t.id);
    if (c === "") return [];
    if (c === "unassign" || c === "delete") return [{ tokenId: t.id, action: c }];
    return [{ tokenId: t.id, action: "reassign", to: c.slice("reassign:".length) }];
  });
  // "Apply to all" shows a value only while every row agrees; otherwise it reads "Mixed".
  const shared = tokens.length > 0 && tokens.every((t) => choiceOf(t.id) === choiceOf(tokens[0]!.id))
    ? choiceOf(tokens[0]!.id)
    : "mixed";

  async function apply() {
    setBusy(true);
    setError(null);
    const result = await connection.command({ type: "participant.resolveDeparture", participantId: departed.id, actions });
    setBusy(false);
    if (result.ok) onDone();
    else setError(result.message);
  }

  const options = (
    <>
      <option value="">Decide later</option>
      {players.map((p) => (
        <option key={p.id} value={`reassign:${p.id}`}>
          Give to {p.displayName}
        </option>
      ))}
      <option value="unassign">Unassign (GM only)</option>
      <option value="delete">Delete token</option>
    </>
  );

  if (tokens.length === 0) {
    return (
      <div className="resolve-departure">
        <p>{departed.displayName} doesn't own any tokens now. Nothing is left to decide.</p>
        <div className="row modal-actions">
          <button type="button" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="resolve-departure"
      onSubmit={(e) => {
        e.preventDefault();
        void apply();
      }}
    >
      <p>
        {departed.displayName} left the table. Choose what happens to each token they controlled. Tokens set to
        "Decide later" stay as they are, and you can come back to them from the GM panel.
      </p>

      <label className="resolve-all" htmlFor={allId}>
        Apply to all
        <select
          id={allId}
          value={shared}
          onChange={(e) => {
            const value = e.target.value as Choice;
            setChoices(Object.fromEntries(tokens.map((t) => [t.id, value])));
          }}
        >
          {shared === "mixed" && (
            <option value="mixed" disabled>
              Mixed
            </option>
          )}
          {options}
        </select>
      </label>

      <ul className="plain resolve-rows">
        {tokens.map((t) => {
          const others = t.ownerIds.filter((id) => id !== departed.id);
          return (
            <li key={t.id} className="resolve-row">
              <span className="resolve-token">
                {t.imageUrl ? (
                  <img className="swatch large round" src={t.imageUrl} alt="" />
                ) : (
                  <span className="swatch large" style={{ background: t.color }} aria-hidden />
                )}
                <span className="resolve-token-text">
                  <span className="resolve-token-name">
                    {t.name}
                    {t.hidden && <span className="badge">hidden</span>}
                  </span>
                  {others.length > 0 && (
                    <span className="muted resolve-coowners">Also controlled by {others.map(name).join(", ")}</span>
                  )}
                </span>
              </span>
              <select
                aria-label={`What happens to ${t.name}`}
                value={choiceOf(t.id)}
                onChange={(e) => setChoices((c) => ({ ...c, [t.id]: e.target.value as Choice }))}
              >
                {options}
              </select>
            </li>
          );
        })}
      </ul>

      <p className="muted small-print">
        {departed.displayName}'s dice rolls and activity log entries are kept either way.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row modal-actions">
        <button type="button" className="secondary" onClick={onDone} disabled={busy}>
          Close
        </button>
        <button type="submit" disabled={busy || actions.length === 0}>
          {busy ? "Applying…" : actions.length === 0 ? "Apply" : `Apply to ${actions.length} ${actions.length === 1 ? "token" : "tokens"}`}
        </button>
      </div>
    </form>
  );
}
