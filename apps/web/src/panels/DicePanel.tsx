import { useState, type FormEvent } from "react";
import { attackLabel, formatAttackParties, formatAttackRoll, type Verdict, parseDiceExpression, type DiceVisibility, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";
import { DiceTray, type TrayRoll } from "../ui/DiceTray";

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
 *
 * Each new roll is thrown as 3D dice for everyone at the table, and its text row waits
 * until they land so the total is not read before the dice show it. Rolls already on the
 * table when the panel mounts have landed: joining, reconnecting or switching tabs does
 * not replay them.
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
  // The GM corrects rulings here once a roll has left the Play tab's Rulings list (ADR 0011).
  const [ruling, setRuling] = useState<ReadonlySet<string>>(new Set());
  const rule = isGm
    ? async (rollId: string, verdict: Verdict | null) => {
        // One request per roll: a fast second click would otherwise read the first's result as
        // the current verdict and clear it.
        if (ruling.has(rollId)) return;
        setRuling((s) => new Set(s).add(rollId));
        const result = await connection.command({ type: "roll.rule", rollId, verdict });
        setRuling((s) => {
          const next = new Set(s);
          next.delete(rollId);
          return next;
        });
        setError(result.ok ? null : result.message);
      }
    : undefined;
  const latest = rolls[0];
  const [landed, setLanded] = useState<{ id: string | undefined; thrown: boolean }>({ id: latest?.id, thrown: false });
  const throwing = latest !== undefined && latest.id !== landed.id;

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
      {!latest ? (
        <p className="muted">No rolls yet.</p>
      ) : (
        <>
          <DiceTray
            key={latest.id}
            roll={trayRoll(latest)}
            throwing={throwing}
            onLanded={() => setLanded({ id: latest.id, thrown: true })}
          />
          <ul className="plain roll-log" aria-live="polite">
            {/* A new key when the dice land, so the live region announces the result once,
                as it appears, and not the placeholder before it. */}
            <RollRow
              key={throwing ? `${latest.id}:rolling` : latest.id}
              roll={latest}
              state={state}
              rolling={throwing}
              fresh={!throwing && landed.thrown}
              onRule={rule}
              ruleBusy={ruling.has(latest.id)}
            />
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
        <RollHistory rolls={rolls} state={state} query={who} onQuery={setWho} onRule={rule} ruling={ruling} />
      </Modal>
    </PanelSection>
  );
}

export function trayRoll(r: RoomState["rolls"][number]): TrayRoll {
  const parsed = parseDiceExpression(r.expression);
  // The server parsed this expression before rolling it; the fallback only guards a log
  // entry written by some older build.
  const sides = parsed.ok ? parsed.expression.sides : Math.max(20, ...r.dice);
  return { id: r.id, sides, dice: r.dice, gmOnly: r.visibility === "gm" };
}

function RollRow({
  roll: r,
  state,
  rolling = false,
  fresh = false,
  onRule,
  ruleBusy = false,
}: {
  roll: RoomState["rolls"][number];
  state: RoomState;
  /** The dice are still in the air: say who is rolling what, not the result. */
  rolling?: boolean;
  /** Just landed from a throw: the total arrives with the dice. */
  fresh?: boolean;
  /** GM only: set or clear the verdict on a to-hit attack roll. */
  onRule?: (rollId: string, verdict: Verdict | null) => void;
  /** A ruling on this roll is on its way to the server. */
  ruleBusy?: boolean;
}) {
  const who = state.participants[r.byParticipantId]?.displayName ?? "Someone";
  const className = ["roll", r.visibility === "gm" && "private", fresh && "fresh"].filter(Boolean).join(" ");
  // A card like a dice tray receipt: the total big in a box with the dice under it, then
  // what was rolled and by whom.
  if (rolling) {
    return (
      <li className={`${className} rolling`} aria-hidden="true">
        <span className="roll-box">
          <span className="roll-total">…</span>
        </span>
        <span className="roll-detail">
          <span className="roll-title">{rollTitle(r, false)}</span>
          <span className="roll-meta">
            {who} is rolling{r.visibility === "gm" && <em className="badge">GM only</em>}
          </span>
        </span>
      </li>
    );
  }
  return (
    <li className={className}>
      <span className="roll-box">
        <span className="roll-total">{r.total}</span>
        <span className="roll-breakdown">({breakdown(r)})</span>
      </span>
      <span className="roll-detail">
        <span className="roll-title">
          <span className="sr-only">{who} rolled </span>
          {rollTitle(r, true)}
        </span>
        <span className="roll-meta" aria-hidden="true">
          {who}{r.visibility === "gm" && <em className="badge">GM only</em>}
        </span>
        {r.visibility === "gm" && <span className="sr-only">, GM only</span>}
        {onRule && r.attack?.kind === "toHit" && (
          <span className="roll-verdict" role="group" aria-label="Ruling">
            {(["hit", "miss"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className="chip"
                aria-pressed={r.verdict === v}
                disabled={ruleBusy}
                // Pressing the current verdict clears it.
                onClick={() => onRule(r.id, r.verdict === v ? null : v)}
              >
                {v === "hit" ? "Hit" : "Miss"}
              </button>
            ))}
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * What was rolled. An attack names who attacked whom (attack-targeting) and, once the dice
 * have landed, the total and the GM's ruling so far: "Aria → Goblin 2 · Longsword · 1d20+5 = 17 · Hit".
 * The ruling is only ever the GM's; nothing here compares the roll to anything (ADR 0011).
 */
function rollTitle(r: RoomState["rolls"][number], landed: boolean) {
  if (!r.attack) return r.expression;
  if (landed) return formatAttackRoll(r);
  return [formatAttackParties(r.attack), attackLabel(r.attack), r.expression].filter(Boolean).join(" · ");
}

/** "12 + 5", "3 + 4 + 1 - 2": each die, then the modifier. */
function breakdown(r: RoomState["rolls"][number]) {
  const dice = r.dice.join(" + ");
  if (r.modifier === 0) return dice;
  return `${dice} ${r.modifier > 0 ? "+" : "-"} ${Math.abs(r.modifier)}`;
}

/** Every roll, newest first, filterable by who rolled it. */
function RollHistory({
  rolls,
  state,
  query,
  onQuery,
  onRule,
  ruling,
}: {
  rolls: RoomState["rolls"];
  state: RoomState;
  query: string;
  onQuery: (q: string) => void;
  onRule?: (rollId: string, verdict: Verdict | null) => void;
  ruling: ReadonlySet<string>;
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
            <RollRow key={r.id} roll={r} state={state} onRule={onRule} ruleBusy={ruling.has(r.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
