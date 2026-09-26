import { useState } from "react";
import { Trash } from "@phosphor-icons/react";
import {
  can,
  hpFraction,
  inactiveLabel,
  isActive,
  type ConditionId,
  type Participant,
  type RoomState,
  type Token,
  type TokenUpdate,
} from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { api } from "../net/api";
import { loadGmToken } from "../net/identity";
import { libraryAssetId } from "../net/builtinAssets";
import { LibraryPicker } from "../pages/LibraryPicker";
import { TokenPreview } from "../ui/TokenPreview";
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
            roomToken={guestToken}
            isGm={isGm}
            players={Object.values(state.participants).filter((p) => p.role === "player" && isActive(p))}
            departedOwner={departedOwner(state, editing.ownerIds)}
            error={error}
            onSave={async (changes) => {
              if (await send({ type: "token.configure", tokenId: editing.id, changes })) setEditingId(null);
            }}
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

/** The token's owner if they left or were removed, so the picker can show them instead of "No one" (ADR 0006). */
function departedOwner(state: RoomState, ownerIds: string[]): Participant | null {
  const owner = ownerIds[0] ? state.participants[ownerIds[0]] : undefined;
  return owner && !isActive(owner) ? owner : null;
}

/**
 * Edits are a draft until Save, and Save asks once more before anything is sent, so a
 * stray click in the modal never changes a token everyone can see. Delete asks too.
 */
function TokenEditor({
  token,
  roomToken,
  isGm,
  players,
  departedOwner,
  error,
  onSave,
  onDelete,
}: {
  token: Token;
  roomToken: string;
  isGm: boolean;
  players: Participant[];
  /** Set when the current owner left the room and the GM hasn't resolved the token yet. */
  departedOwner: Participant | null;
  error: string | null;
  onSave: (changes: TokenUpdate) => Promise<void>;
  onDelete: () => void;
}) {
  const [hp, setHp] = useState(token.stats.hp?.toString() ?? "");
  const [name, setName] = useState(token.name);
  const [x, setX] = useState(String(token.position.x));
  const [y, setY] = useState(String(token.position.y));
  const [size, setSize] = useState(String(token.size));
  const [rotation, setRotation] = useState(String(token.rotation));
  const [image, setImage] = useState({ url: token.imageUrl, assetId: token.assetId ?? null });
  const [gmToken] = useState(loadGmToken);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [maxHp, setMaxHp] = useState(token.stats.maxHp?.toString() ?? "");
  const [ac, setAc] = useState(token.stats.ac?.toString() ?? "");
  const [conditions, setConditions] = useState<ConditionId[]>(token.conditions);
  const [ownerId, setOwnerId] = useState(token.ownerIds[0] ?? "");
  const [hidden, setHidden] = useState(token.hidden);
  const [confirming, setConfirming] = useState<"save" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const stats = { hp: num(hp), maxHp: num(maxHp), ac: num(ac) };
  const sameConditions =
    conditions.length === token.conditions.length && conditions.every((c) => token.conditions.includes(c));

  const changes: TokenUpdate = {};
  if (isGm && (name.trim() !== token.name || Number(size) !== token.size || Number(rotation) !== token.rotation))
    Object.assign(changes, { name, size: Number(size), rotation: Number(rotation) });
  if (isGm && (Number(x) !== token.position.x || Number(y) !== token.position.y))
    changes.position = { x: Number(x), y: Number(y) };
  if (isGm && (image.url !== token.imageUrl || image.assetId !== (token.assetId ?? null)))
    Object.assign(changes, { imageUrl: image.url, assetId: image.assetId });
  if (stats.hp !== token.stats.hp || stats.maxHp !== token.stats.maxHp || stats.ac !== token.stats.ac)
    changes.stats = stats;
  if (!sameConditions) changes.conditions = conditions;
  if (isGm && ownerId !== (token.ownerIds[0] ?? ""))
    changes.ownerIds = ownerId ? [ownerId] : [];
  if (isGm && hidden !== token.hidden) changes.hidden = hidden;
  const hasChanges = Object.keys(changes).length > 0;

  const save = async () => {
    setBusy(true);
    try {
      await onSave(changes);
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const { url } = await api.upload(file, roomToken);
      setImage({ url, assetId: null });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
    <form
      className="token-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (hasChanges && !uploading) setConfirming("save");
      }}
    >
      {isGm && (
        <div className="token-editor-gm">
          <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus /></label>
          <div className="token-setup-grid">
            <label>Board X<input type="number" value={x} onChange={(e) => setX(e.target.value)} required step="any" /></label>
            <label>Board Y<input type="number" value={y} onChange={(e) => setY(e.target.value)} required step="any" /></label>
            <label>Size (cells)<input type="number" value={size} onChange={(e) => setSize(e.target.value)} required min="0.25" max="10" step="any" /></label>
            <label>Rotation (°)<input type="number" value={rotation} onChange={(e) => setRotation(e.target.value)} required step="any" /></label>
          </div>
          <div className="stack token-image-field">
            <span className="field-label">Image</span>
            {image.url && (
              <div className="row token-image-chosen">
                <TokenPreview url={image.url} color={token.color} hidden={hidden} />
                <button type="button" className="link" disabled={uploading} onClick={() => setImage({ url: null, assetId: null })}>Remove image</button>
              </div>
            )}
            <div className="row">
              <label className="upload-button secondary">
                <span>{uploading ? "Uploading…" : image.url ? "Replace image" : "Upload image"}</span>
                <input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" disabled={uploading}
                  onChange={(e) => void onUpload(e.target.files?.[0])} />
              </label>
              {gmToken && <button type="button" className="secondary" disabled={uploading} onClick={() => setPicking(true)}>From library</button>}
            </div>
          </div>
        </div>
      )}
      <div className="stats-row">
        <label>
          HP
          <input type="number" inputMode="numeric" value={hp} onChange={(e) => setHp(e.target.value)} min="-999" max="9999" step="1" autoFocus={!isGm} />
        </label>
        <label>
          Max
          <input type="number" inputMode="numeric" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} min="1" max="9999" step="1" />
        </label>
        <label>
          AC
          <input type="number" inputMode="numeric" value={ac} onChange={(e) => setAc(e.target.value)} min="0" max="99" step="1" />
        </label>
      </div>

      <ConditionPicker value={conditions} onChange={setConditions} />

      {isGm && (
        <div className="token-editor-gm">
          <label>
            Controlled by
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">No one (GM only)</option>
              {departedOwner && (
                <option value={departedOwner.id} disabled>
                  {departedOwner.displayName} ({inactiveLabel(departedOwner)})
                </option>
              )}
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="inline">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            Hidden from players
          </label>
        </div>
      )}

      {(error || uploadError) && <p role="alert" className="error">{error || uploadError}</p>}

      {confirming === "save" ? (
        <div className="confirm" role="group" aria-label="Confirm changes">
          <p>
            Save changes to {token.name}? Everyone in the
            room sees the update.
          </p>
          <div className="row">
            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(null)}>
              Back
            </button>
            <button type="button" disabled={busy || uploading} onClick={() => void save()} autoFocus>
              Confirm
            </button>
          </div>
        </div>
      ) : confirming === "delete" ? (
        <div className="confirm" role="group" aria-label="Confirm delete">
          <p>Delete {token.name}? Everyone loses it from the map.</p>
          <div className="row">
            <button type="button" className="secondary" onClick={() => setConfirming(null)}>
              Keep
            </button>
            <button type="button" className="danger-fill" onClick={onDelete} autoFocus>
              Delete token
            </button>
          </div>
        </div>
      ) : (
        <div className="token-editor-actions">
          {isGm && (
            <button
              type="button"
              className="icon-button token-delete"
              aria-label={`Delete ${token.name}`}
              title="Delete token"
              onClick={() => setConfirming("delete")}
            >
              <Trash size={18} aria-hidden />
            </button>
          )}
          <button type="submit" className="token-save" disabled={!hasChanges || uploading}>
            Save
          </button>
        </div>
      )}
    </form>
    {isGm && gmToken && (
      <Modal open={picking} title="Choose a token image" onClose={() => setPicking(false)}>
        <LibraryPicker gmToken={gmToken} kind="token" onPick={(asset) => {
          setImage({ url: asset.url, assetId: libraryAssetId(asset) });
          setPicking(false);
        }} />
      </Modal>
    )}
    </>
  );
}

const level = (f: number) => (f > 0.5 ? "ok" : f > 0.25 ? "warn" : "critical");
