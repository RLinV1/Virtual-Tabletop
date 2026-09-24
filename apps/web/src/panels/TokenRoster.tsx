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
import { AddTokenButton } from "./AddToken";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";

/**
 * Focusable token roster (FR-GM-24), showing stats and conditions (FR-TAC-07/08).
 *
 * For the GM this is also where tokens are added and managed, so every token control is
 * in one section: Add token at the top, and Edit on a row opens a modal with stats,
 * conditions, owner, visibility and delete.
 *
 * The canvas is a mouse-first surface: finding a token on a crowded map means aiming at
 * it. This list is the keyboard and search path to the same thing — every row is a real
 * button, so Tab and Enter reach every token, and selecting one centres the board on it.
 */
export function TokenRoster({
  connection,
  state,
  you,
  token: guestToken,
  onFocusToken,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  /** Room credential, for the GM's token image uploads. */
  token: string;
  onFocusToken: (tokenId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isGm = you.role === "gm";
  const editing = editingId ? state.tokens[editingId] : undefined;
  const send = async (command: Parameters<RoomConnection["command"]>[0]) => {
    const r = await connection.command(command);
    setError(r.ok ? null : r.message);
    return r.ok;
  };

  const tokens = Object.values(state.tokens)
    .filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeId = state.initiative?.order[state.initiative.activeIndex] ?? null;

  return (
    <PanelSection id="tokens" title="Tokens">
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
              onFocus={() => onFocusToken(token.id)}
              onEdit={() => {
                setError(null);
                setEditingId(token.id);
              }}
            />
          ))}
        </ul>
      )}
      {error && !editing && <p role="alert" className="error">{error}</p>}
      {isGm && <AddTokenButton connection={connection} state={state} token={guestToken} />}

      <Modal open={!!editing} title={editing ? `Edit ${editing.name}` : "Edit token"} onClose={() => setEditingId(null)}>
        {editing && (
          <TokenEditor
            key={editing.id}
            token={editing}
            isGm={isGm}
            players={Object.values(state.participants).filter((p) => p.role === "player")}
            error={error}
            onStats={(stats) => send({ type: "token.setStats", tokenId: editing.id, stats })}
            onConditions={(conditions) => void send({ type: "token.setConditions", tokenId: editing.id, conditions })}
            onOwner={(ownerId) => void send({ type: "token.setOwners", tokenId: editing.id, ownerIds: ownerId ? [ownerId] : [] })}
            onHidden={(hidden) => void send({ type: "token.setHidden", tokenId: editing.id, hidden })}
            onDelete={async () => {
              if (await send({ type: "token.delete", tokenId: editing.id })) setEditingId(null);
            }}
          />
        )}
      </Modal>
    </PanelSection>
  );
}

function RosterRow({
  token,
  you,
  isActive,
  onFocus,
  onEdit,
}: {
  token: Token;
  you: Participant;
  isActive: boolean;
  onFocus: () => void;
  onEdit: () => void;
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
          <button type="button" className="link small" onClick={onEdit} aria-label={`Edit ${token.name}`}>
            Edit
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

    </li>
  );
}

function TokenEditor({
  token,
  isGm,
  players,
  error,
  onStats,
  onConditions,
  onOwner,
  onHidden,
  onDelete,
}: {
  token: Token;
  isGm: boolean;
  players: Participant[];
  error: string | null;
  onStats: (stats: TokenStats) => Promise<boolean>;
  onConditions: (conditions: ConditionId[]) => void;
  onOwner: (ownerId: string) => void;
  onHidden: (hidden: boolean) => void;
  onDelete: () => void;
}) {
  const [hp, setHp] = useState(token.stats.hp?.toString() ?? "");
  const [maxHp, setMaxHp] = useState(token.stats.maxHp?.toString() ?? "");
  const [ac, setAc] = useState(token.stats.ac?.toString() ?? "");
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="token-editor">
      <form
        className="stats-row"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaved(await onStats({ hp: num(hp), maxHp: num(maxHp), ac: num(ac) }));
        }}
      >
        <label>
          HP
          <input type="number" inputMode="numeric" value={hp} onChange={(e) => setHp(e.target.value)} autoFocus />
        </label>
        <label>
          Max
          <input type="number" inputMode="numeric" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} />
        </label>
        <label>
          AC
          <input type="number" inputMode="numeric" value={ac} onChange={(e) => setAc(e.target.value)} />
        </label>
        <button type="submit">Save</button>
      </form>
      {saved && !error && (
        <p className="muted small-print" role="status">
          Saved.
        </p>
      )}

      <ConditionPicker value={token.conditions} onChange={onConditions} />

      {isGm && (
        <div className="token-editor-gm">
          <label>
            Controlled by
            <select value={token.ownerIds[0] ?? ""} onChange={(e) => onOwner(e.target.value)}>
              <option value="">No one (GM only)</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            <input type="checkbox" checked={token.hidden} onChange={(e) => onHidden(e.target.checked)} />
            Hidden from players
          </label>
          {confirmDelete ? (
            <div className="confirm" role="group" aria-label="Confirm delete">
              <p>Delete {token.name}? Everyone loses it from the map.</p>
              <div className="row">
                <button type="button" className="secondary" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
                <button type="button" className="danger-fill" onClick={onDelete}>
                  Delete token
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="link danger token-delete" onClick={() => setConfirmDelete(true)}>
              Delete token
            </button>
          )}
        </div>
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

const level = (f: number) => (f > 0.5 ? "ok" : f > 0.25 ? "warn" : "critical");
