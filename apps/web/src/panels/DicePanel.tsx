import { useState, type FormEvent } from "react";
import { parseDiceExpression, type DiceVisibility, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";

const QUICK = ["1d20", "1d20+5", "2d6", "1d8+3", "4d6"];

/**
 * Dice roller and shared roll log (FR-TAC-09, FR-GM-22).
 *
 * The panel shows only the latest roll; the full log opens in a modal, so a long session
 * does not push the rest of the sidebar off screen.
 *
 * The expression is parsed here purely to give immediate feedback in the input; the
 * server re-parses and rolls, and its result is the only one anyone sees. A GM-only roll
 * never reaches a player, so players have no "hidden roll" placeholder in their log.
 */
export function DicePanel({
  connection,
  state,
  isGm,
}: {
  connection: RoomConnection;
  state: RoomState;
  isGm: boolean;
}) {
  const [expression, setExpression] = useState("1d20");
  const [visibility, setVisibility] = useState<DiceVisibility>("public");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [who, setWho] = useState("");

  const parsed = parseDiceExpression(expression);
  const invalid = expression.trim() !== "" && !parsed.ok;

  const roll = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.ok) return setError(parsed.message);
    setBusy(true);
    const result = await connection.command({ type: "dice.roll", expression, visibility });
    setBusy(false);
    setError(result.ok ? null : result.message);
  };

  const rolls = [...state.rolls].reverse();

  return (
    <PanelSection id="dice" title="Dice">
      <form onSubmit={roll} className="dice-form">
        <label htmlFor="dice-expression">Expression</label>
        <div className="dice-row">
          <input
            id="dice-expression"
            value={expression}
            onChange={(e) => {
              setExpression(e.target.value);
              setError(null);
            }}
            placeholder="1d20+5"
            aria-invalid={invalid}
            aria-describedby={invalid ? "dice-error" : undefined}
            autoComplete="off"
          />
          <button type="submit" disabled={busy || !parsed.ok}>
            Roll
          </button>
        </div>

        <div className="dice-quick">
          {QUICK.map((q) => (
            <button key={q} type="button" className="chip" onClick={() => setExpression(q)}>
              {q}
            </button>
          ))}
        </div>

        {isGm && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={visibility === "gm"}
              onChange={(e) => setVisibility(e.target.checked ? "gm" : "public")}
            />
            Roll privately (players won't see it)
          </label>
        )}

        {(invalid || error) && (
          <p id="dice-error" role="alert" className="error">
            {error ?? (parsed.ok ? "" : parsed.message)}
          </p>
        )}
      </form>

      <h3 className="sr-only">Latest roll</h3>
      {!rolls[0] ? (
        <p className="muted">No rolls yet.</p>
      ) : (
        <>
          <ul className="plain roll-log" aria-live="polite">
            <RollRow roll={rolls[0]} state={state} />
          </ul>
          <button type="button" className="secondary small history-button" onClick={() => setHistoryOpen(true)}>
            Roll history ({rolls.length})
          </button>
        </>
      )}
      <Modal
        open={historyOpen}
        title="Roll history"
        onClose={() => {
          setHistoryOpen(false);
          setWho("");
        }}
      >
        <RollHistory rolls={rolls} state={state} query={who} onQuery={setWho} />
      </Modal>
    </PanelSection>
  );
}

function RollRow({ roll: r, state }: { roll: RoomState["rolls"][number]; state: RoomState }) {
  const who = state.participants[r.byParticipantId]?.displayName ?? "Someone";
  return (
    <li className={r.visibility === "gm" ? "roll private" : "roll"}>
      <span className="roll-total">{r.total}</span>
      <span className="roll-detail">
        <strong>{who}</strong> rolled {r.expression}
        {r.visibility === "gm" && <em className="badge"> GM only</em>}
        <span className="muted">
          {" "}
          [{r.dice.join(", ")}]
          {r.modifier !== 0 && (r.modifier > 0 ? ` +${r.modifier}` : ` ${r.modifier}`)}
        </span>
      </span>
    </li>
  );
}

/** Every roll, newest first, filterable by who rolled it. */
function RollHistory({
  rolls,
  state,
  query,
  onQuery,
}: {
  rolls: RoomState["rolls"];
  state: RoomState;
  query: string;
  onQuery: (q: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const shown = q
    ? rolls.filter((r) => (state.participants[r.byParticipantId]?.displayName ?? "").toLowerCase().includes(q))
    : rolls;
  return (
    <div className="stack">
      <label htmlFor="roll-history-search" className="sr-only">
        Search rolls by player
      </label>
      <input
        id="roll-history-search"
        type="search"
        placeholder="Search by player"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        autoComplete="off"
        autoFocus
      />
      <p className="muted small-print" role="status">
        {q ? `${shown.length} of ${rolls.length} rolls` : `${rolls.length} ${rolls.length === 1 ? "roll" : "rolls"}`}
      </p>
      {shown.length === 0 ? (
        <p className="muted">No rolls by that player.</p>
      ) : (
        <ul className="plain roll-log roll-history">
          {shown.map((r) => (
            <RollRow key={r.id} roll={r} state={state} />
          ))}
        </ul>
      )}
    </div>
  );
}
