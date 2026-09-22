import { useState } from "react";
import {
  can,
  hpFraction,
  type ConditionId,
  type Participant,
  type RoomState,
  type Token,
  type TokenStats,
} from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { ConditionMarker, ConditionPicker } from "./ConditionMarker";

/**
 * Focusable token roster (FR-GM-24), showing stats and conditions (FR-TAC-07/08).
 *
 * The canvas is a mouse-first surface: finding a token on a crowded map means aiming at
 * it. This list is the keyboard and search path to the same thing — every row is a real
 * button, so Tab and Enter reach every token, and selecting one centres the board on it.
 */
export function TokenRoster({
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
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokens = Object.values(state.tokens)
    .filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeId = state.initiative?.order[state.initiative.activeIndex] ?? null;

  return (
    <section className="panel-section">
      <h2>Tokens</h2>

      <label htmlFor="roster-search" className="sr-only">
        Search tokens by name
      </label>
      <input
        id="roster-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search tokens…"
        autoComplete="off"
      />

      {tokens.length === 0 ? (
        <p className="muted">{query ? "No tokens match." : "No tokens yet."}</p>
      ) : (
        <ul className="plain roster">
          {tokens.map((token) => (
            <RosterRow
              key={token.id}
              token={token}
              you={you}
              isActive={token.id === activeId}
              isEditing={editingId === token.id}
              onFocus={() => onFocusToken(token.id)}
              onToggleEdit={() => setEditingId(editingId === token.id ? null : token.id)}
              onStats={async (stats) => {
                const r = await connection.command({ type: "token.setStats", tokenId: token.id, stats });
                setError(r.ok ? null : r.message);
              }}
              onConditions={async (conditions) => {
                const r = await connection.command({
                  type: "token.setConditions",
                  tokenId: token.id,
                  conditions,
                });
                setError(r.ok ? null : r.message);
              }}
            />
          ))}
        </ul>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}

function RosterRow({
  token,
  you,
  isActive,
  isEditing,
  onFocus,
  onToggleEdit,
  onStats,
  onConditions,
}: {
  token: Token;
  you: Participant;
  isActive: boolean;
  isEditing: boolean;
  onFocus: () => void;
  onToggleEdit: () => void;
  onStats: (stats: TokenStats) => void;
  onConditions: (conditions: ConditionId[]) => void;
}) {
  // Same rule the server enforces; this only decides whether to draw the controls.
  const editable = can.moveToken(you, token);
  const fraction = hpFraction(token.stats);

  return (
    <li className={isActive ? "roster-row active" : "roster-row"}>
      <div className="roster-main">
        <button type="button" className="roster-focus" onClick={onFocus}>
          <span className="swatch" style={{ background: token.color }} aria-hidden />
          <span className="token-name">{token.name}</span>
          {token.hidden && <span className="badge">hidden</span>}
          {isActive && <span className="badge active-badge">active turn</span>}
          {token.stats.hp !== null && (
            <span className="hp">
              {token.stats.hp}
              {token.stats.maxHp !== null && `/${token.stats.maxHp}`} HP
            </span>
          )}
          {token.stats.ac !== null && <span className="muted">AC {token.stats.ac}</span>}
        </button>
        {editable && (
          <button
            type="button"
            className="secondary small"
            onClick={onToggleEdit}
            aria-expanded={isEditing}
          >
            {isEditing ? "Done" : "Edit"}
          </button>
        )}
      </div>

      {fraction !== null && (
        <div
          className="hp-bar"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={token.stats.maxHp ?? 0}
          aria-valuenow={token.stats.hp ?? 0}
          aria-label={`${token.name} hit points`}
        >
          <span style={{ width: `${fraction * 100}%` }} data-level={level(fraction)} />
        </div>
      )}

      {token.conditions.length > 0 && (
        <ul className="plain marker-row">
          {token.conditions.map((c) => (
            <li key={c}>
              <ConditionMarker id={c} size={22} />
            </li>
          ))}
        </ul>
      )}

      {isEditing && editable && (
        <StatsEditor token={token} onStats={onStats} onConditions={onConditions} />
      )}
    </li>
  );
}

function StatsEditor({
  token,
  onStats,
  onConditions,
}: {
  token: Token;
  onStats: (stats: TokenStats) => void;
  onConditions: (conditions: ConditionId[]) => void;
}) {
  const [hp, setHp] = useState(token.stats.hp?.toString() ?? "");
  const [maxHp, setMaxHp] = useState(token.stats.maxHp?.toString() ?? "");
  const [ac, setAc] = useState(token.stats.ac?.toString() ?? "");

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="stats-editor">
      <div className="stats-row">
        <label>
          HP
          <input type="number" inputMode="numeric" value={hp} onChange={(e) => setHp(e.target.value)} />
        </label>
        <label>
          Max
          <input type="number" inputMode="numeric" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} />
        </label>
        <label>
          AC
          <input type="number" inputMode="numeric" value={ac} onChange={(e) => setAc(e.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => onStats({ hp: num(hp), maxHp: num(maxHp), ac: num(ac) })}
        >
          Save
        </button>
      </div>
      <ConditionPicker value={token.conditions} onChange={onConditions} />
    </div>
  );
}

const level = (f: number) => (f > 0.5 ? "ok" : f > 0.25 ? "warn" : "critical");
