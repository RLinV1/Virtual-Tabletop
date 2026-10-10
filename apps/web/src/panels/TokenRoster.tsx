import { useState } from "react";
import { presetOf, type PresetFeatures } from "@vtt/shared";
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
  type TokenGroup,
  type TokenUpdate,
  MAX_TOKENS_PER_CREATE,
} from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { api } from "../net/api";
import { useAccount } from "../account/accountStore";
import { libraryAssetId } from "../net/builtinAssets";
import { LibraryPicker } from "../pages/LibraryPicker";
import { CreatureForm } from "../pages/LibraryCreatures";
import { creatureFromToken, type CreaturePrefill } from "../pages/creatureDraft";
import { TokenPreview } from "../ui/TokenPreview";
import { ConditionMarker, ConditionPicker } from "./ConditionMarker";
import type { TokenDraft } from "../board/placement";
import { AddTokenButton } from "./AddToken";
import { Modal } from "../ui/Modal";
import { browserTokenAttacks } from "./attackRoll";
import { PanelSection } from "../ui/PanelSection";
import { CollapseToggle, GroupHeading, NewGroupForm } from "./GroupHeading";
import { groupedTokens } from "./tokenGroups";

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
  onPlaceToken,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  /** Room credential, for the GM's token image uploads. */
  token: string;
  onFocusToken: (tokenId: string) => void;
  /** GM: pick the square for a token filled in by Add token (place-token-on-board). */
  onPlaceToken: (draft: TokenDraft) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Group ids the GM collapsed; "" is the Ungrouped section (KAN-82). */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (id: string) => setCollapsed((current) => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  });
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
  const row = (token: Token) => (
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
  );

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

      {isGm ? (
        // The GM's roster is grouped (KAN-82); players never receive groups, so theirs is one list.
        <>
          {groupedTokens(state, tokens).map(({ group, tokens: members }) =>
            group || members.length > 0 || tokens.length === 0 ? (
              <section key={group?.id ?? "ungrouped"} className="roster-group" aria-label={group?.name ?? "Ungrouped tokens"}>
                {group ? (
                  <GroupHeading group={group} tokens={members} connection={connection} onError={setError}
                    collapsed={collapsed.has(group.id)} onToggle={() => toggle(group.id)} />
                ) : (
                  <div className="group-heading">
                    <CollapseToggle label={Object.keys(state.groups).length > 0 ? "Ungrouped" : "All tokens"} count={members.length}
                      collapsed={collapsed.has("")} onToggle={() => toggle("")} />
                  </div>
                )}
                {collapsed.has(group?.id ?? "") ? null : members.length === 0 ? (
                  <p className="muted">{group ? "No tokens in this group yet. Use Edit on a token to add it." : query ? "No tokens match." : "No tokens yet."}</p>
                ) : (
                  <ul className="plain roster">
                    {members.map((token) => row(token))}
                  </ul>
                )}
              </section>
            ) : null,
          )}
          <NewGroupForm connection={connection} onError={setError} />
        </>
      ) : tokens.length === 0 ? (
        <p className="muted">{query ? "No tokens match." : "No tokens yet."}</p>
      ) : (
        <ul className="plain roster">
          {tokens.map((token) => row(token))}
        </ul>
      )}
      {error && !editing && <p role="alert" className="error">{error}</p>}
      {isGm && <AddTokenButton state={state} token={guestToken} onPlace={onPlaceToken} />}

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
            groups={Object.values(state.groups)}
            groupId={state.tokenGroups[editing.id] ?? null}
            features={presetOf(state).features}
            onSave={async (changes, groupId) => {
              if (Object.keys(changes).length > 0 && !(await send({ type: "token.configure", tokenId: editing.id, changes }))) return;
              if (groupId !== undefined && !(await send({ type: "group.assign", groupId, tokenIds: [editing.id] }))) return;
              setEditingId(null);
            }}
            onDuplicate={async (count) => {
              if (await send({ type: "token.duplicate", tokenId: editing.id, count })) setEditingId(null);
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
export function TokenEditor({
  token,
  roomToken,
  isGm,
  players,
  departedOwner,
  error,
  groups = [],
  groupId: savedGroupId = null,
  features = ALL_FEATURES,
  onSave,
  onDelete,
  onDuplicate,
}: {
  token: Token;
  roomToken: string;
  isGm: boolean;
  players: Participant[];
  /** Set when the current owner left the room and the GM hasn't resolved the token yet. */
  departedOwner: Participant | null;
  error: string | null;
  /** GM: the room's groups and this token's, for the Group field (KAN-82). */
  groups?: readonly TokenGroup[];
  groupId?: string | null;
  /** What the room's game preset turns on (KAN-63); everything when omitted. */
  features?: PresetFeatures;
  /** `groupId` is undefined when the group did not change. */
  onSave: (changes: TokenUpdate, groupId?: string | null) => Promise<void>;
  onDelete: () => void;
  /** GM: copy this token `count` times beside it (KAN-82). */
  onDuplicate?: (count: number) => Promise<void>;
}) {
  const [hp, setHp] = useState(token.stats.hp?.toString() ?? "");
  const [name, setName] = useState(token.name);
  const [x, setX] = useState(String(token.position.x));
  const [y, setY] = useState(String(token.position.y));
  const [size, setSize] = useState(String(token.size));
  const [rotation, setRotation] = useState(String(token.rotation));
  const [image, setImage] = useState({ url: token.imageUrl, assetId: token.assetId ?? null });
  const hasLibrary = useAccount().status === "signedIn";
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [maxHp, setMaxHp] = useState(token.stats.maxHp?.toString() ?? "");
  const [ac, setAc] = useState(token.stats.ac?.toString() ?? "");
  const [conditions, setConditions] = useState<ConditionId[]>(token.conditions);
  const [ownerId, setOwnerId] = useState(token.ownerIds[0] ?? "");
  const [hidden, setHidden] = useState(token.hidden);
  const [groupId, setGroupId] = useState(savedGroupId ?? "");
  const [copies, setCopies] = useState("1");
  const [confirming, setConfirming] = useState<"save" | "delete" | null>(null);
  /** Save as creature (KAN-70): the token as it is now, as a new library creature's starting values. */
  const [creaturePrefill, setCreaturePrefill] = useState<CreaturePrefill | null>(null);
  const [creatureStatus, setCreatureStatus] = useState("");
  const openSaveAsCreature = async () => {
    setCreatureStatus("");
    // Its art comes along only when it is the GM's own token art; an unreadable library means none.
    const ownArt = await api.library.list().catch(() => []);
    setCreaturePrefill(creatureFromToken(token, ownArt, browserTokenAttacks(token)));
  };
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
  const groupChanged = isGm && groupId !== (savedGroupId ?? "");
  const hasChanges = Object.keys(changes).length > 0 || groupChanged;
  const copyCount = Number(copies);
  const validCopies = Number.isInteger(copyCount) && copyCount >= 1 && copyCount <= MAX_TOKENS_PER_CREATE;

  const save = async () => {
    setBusy(true);
    try {
      await onSave(changes, groupChanged ? groupId || null : undefined);
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
      // A field that fails validation inside a closed section can't show its message; open the section.
      onInvalidCapture={(e) => (e.target as HTMLElement).closest("details")?.setAttribute("open", "")}
      onSubmit={(e) => {
        e.preventDefault();
        if (hasChanges && !uploading) setConfirming("save");
      }}
    >
      {isGm && <label>Name<input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus /></label>}
      <div className="stats-row">
        <label>
          HP
          <input type="number" inputMode="numeric" value={hp} onChange={(e) => setHp(e.target.value)} min="-999" max="9999" step="1" autoFocus={!isGm} />
        </label>
        <label>
          Max
          <input type="number" inputMode="numeric" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} min="1" max="9999" step="1" />
        </label>
        {features.armorClass && (
          <label>
            AC
            <input type="number" inputMode="numeric" value={ac} onChange={(e) => setAc(e.target.value)} min="0" max="99" step="1" />
          </label>
        )}
      </div>

      {features.conditions && (
        <details className="token-editor-section">
          <summary>Conditions<span className="token-editor-summary">{conditions.length || "none"}</span></summary>
          <ConditionPicker value={conditions} onChange={setConditions} />
        </details>
      )}

      {isGm && (
        <details className="token-editor-section">
          <summary>
            Control &amp; visibility
            <span className="token-editor-summary">
              {players.find((p) => p.id === ownerId)?.displayName ?? (ownerId ? departedOwner?.displayName : "GM only")}
              {hidden && " · hidden"}
            </span>
          </summary>
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
        </details>
      )}

      {isGm && groups.length > 0 && (
        <label className="token-group-field">
          Group
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
      )}

      {isGm && onDuplicate && (
        <div className="row token-duplicate">
          <label>
            Copies
            <input type="number" inputMode="numeric" value={copies} onChange={(e) => setCopies(e.target.value)}
              min="1" max={MAX_TOKENS_PER_CREATE} step="1" aria-describedby="duplicate-hint" />
          </label>
          <button type="button" className="secondary" disabled={busy || !validCopies} onClick={() => void onDuplicate(copyCount)}>
            Duplicate
          </button>
          <span id="duplicate-hint" className="muted small-print">Same stats, conditions, owner and visibility, beside this token.</span>
        </div>
      )}

      {isGm && (
        <details className="token-editor-section">
          <summary>Advanced<span className="token-editor-summary">{size} cells · {rotation}° · {image.url ? "image" : "no image"}</span></summary>
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
              <button type="button" className="secondary" disabled={uploading} onClick={() => setPicking(true)}>{hasLibrary ? "From library" : "Built-in art"}</button>
            </div>
          </div>
        </details>
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
          {isGm && hasLibrary && (
            <button type="button" className="secondary token-save-creature" onClick={() => void openSaveAsCreature()}>
              Save as creature
            </button>
          )}
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
    {/* Outside the editor's form: a form nested in a form would submit the editor instead. */}
    {isGm && hasLibrary && (
      <Modal open={creaturePrefill !== null} title="Save as creature" onClose={() => setCreaturePrefill(null)}>
        {creaturePrefill && (
          <CreatureForm
            creature={null}
            prefill={creaturePrefill}
            onCancel={() => setCreaturePrefill(null)}
            onSaved={(saved) => {
              setCreaturePrefill(null);
              setCreatureStatus(`Saved ${saved.name} to your library.`);
            }}
          />
        )}
      </Modal>
    )}
    <span role="status" className="sr-only">{creatureStatus}</span>
    {isGm && (
      <Modal open={picking} title="Choose a token image" onClose={() => setPicking(false)}>
        <LibraryPicker kind="token" onPick={(asset) => {
          setImage({ url: asset.url, assetId: libraryAssetId(asset) });
          setPicking(false);
        }} />
      </Modal>
    )}
    </>
  );
}

/** Every rules feature on: the editor outside a room, and in a Dungeons & Dragons room. */
const ALL_FEATURES: PresetFeatures = { attacks: true, conditions: true, armorClass: true };

const level = (f: number) => (f > 0.5 ? "ok" : f > 0.25 ? "warn" : "critical");
