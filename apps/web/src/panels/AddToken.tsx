import { useRef, useState } from "react";
import { DEFAULT_TOKEN_COLOR, MAX_TOKENS_PER_CREATE, conditionSpec, isActive, type ConditionId, type RoomState } from "@vtt/shared";
import type { TokenDraft } from "../board/placement";
import { api } from "../net/api";
import { useAccount } from "../account/accountStore";
import { libraryAssetId } from "../net/builtinAssets";
import { creatureDraft } from "../pages/creatureDraft";
import { CreaturePicker } from "../pages/LibraryCreatures";
import { LibraryPicker } from "../pages/LibraryPicker";
import { Modal } from "../ui/Modal";
import { TokenPreview } from "../ui/TokenPreview";
import { ConditionPicker } from "./ConditionMarker";
import { statsWithDefaults } from "./tokenDefaults";

const TOKEN_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085"];

/**
 * The GM's "Add token" button and its modal (room-sidebar-layout: GM setup forms open in
 * modals). Lives at the top of the Tokens section so every token control is in one place.
 * The form only describes the token; the GM then picks its square on the board, which
 * sends the `token.create` (place-token-on-board).
 */
export function AddTokenButton({
  state,
  token,
  onPlace,
}: {
  state: RoomState;
  token: string;
  /** Hand the filled-in token to the board, where the GM chooses its square. */
  onPlace: (draft: TokenDraft) => void;
}) {
  const [open, setOpen] = useState(false);
  /** Filled in and waiting for the dialog to finish closing, so the board takes focus after it. */
  const pending = useRef<TokenDraft | null>(null);
  // The library belongs to the signed-in account (ADR 0017); a signed-out GM uploads directly.
  const hasLibrary = useAccount().status === "signedIn";
  const players = Object.values(state.participants).filter((p) => p.role === "player" && isActive(p));

  return (
    <>
      <button type="button" data-tour="gm-add-token" onClick={() => setOpen(true)}>
        Add token
      </button>
      <Modal
        open={open}
        title="Add token"
        onClose={() => setOpen(false)}
        onAfterClose={() => {
          const draft = pending.current;
          pending.current = null;
          if (draft) onPlace(draft);
        }}
      >
        <AddToken
          players={players}
          token={token}
          hasLibrary={hasLibrary}
          onAdd={(draft) => {
            // A creature brings its own colour; otherwise the next one from the palette.
            pending.current = { ...draft, color: draft.color ?? TOKEN_COLORS[Object.keys(state.tokens).length % TOKEN_COLORS.length] };
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}

interface TokenImage {
  url: string;
  assetId: string | null;
  label: string;
}

function AddToken(props: {
  players: { id: string; displayName: string }[];
  token: string;
  hasLibrary: boolean;
  /** The form is complete; the token is created once the GM picks its square on the board. */
  onAdd: (draft: TokenDraft) => void;
}) {
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [hidden, setHidden] = useState(false);
  const [size, setSize] = useState("1");
  const [rotation, setRotation] = useState("0");
  const [hp, setHp] = useState("");
  const [maxHp, setMaxHp] = useState("");
  const [ac, setAc] = useState("");
  const [image, setImage] = useState<TokenImage | null>(null);
  /** Set by a creature (KAN-70); unset, the palette picks one. */
  const [color, setColor] = useState<string | undefined>(undefined);
  const [conditions, setConditions] = useState<ConditionId[]>([]);
  const [count, setCount] = useState("1");
  const [picking, setPicking] = useState(false);
  const [pickingCreature, setPickingCreature] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typedStats = { hp: optionalNumber(hp), maxHp: optionalNumber(maxHp), ac: optionalNumber(ac) };
  // What each blank field will become, given the others as typed now (token-stat-defaults).
  const defaults = statsWithDefaults(typedStats);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const { url } = await api.upload(file, props.token);
      setImage({ url, assetId: null, label: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          props.onAdd({
            type: "token.create", name, hidden, ownerIds: ownerId ? [ownerId] : [],
            size: Number(size), rotation: Number(rotation),
            stats: defaults,
            imageUrl: image?.url ?? null, assetId: image?.assetId ?? null,
            color, conditions, count: Number(count),
          });
        }}
      >
        {props.hasLibrary && (
          <div className="row add-token-creature">
            <button type="button" className="secondary" disabled={uploading} onClick={() => setPickingCreature(true)}>
              From creature
            </button>
            <span className="muted">Fills in the details below from one of your creatures.</span>
          </div>
        )}
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
            autoFocus
            aria-describedby="add-token-name-hint"
          />
          {/* The server does the numbering (KAN-62); this only tells the GM to expect it. */}
          <span id="add-token-name-hint" className="muted">
            Duplicate names are numbered automatically, e.g. Goblin 2.
          </span>
        </label>
        {/* Several at once are one action: numbered, on the nearest free squares (KAN-70). */}
        <label className="add-token-count">
          How many
          <input type="number" value={count} onChange={(e) => setCount(e.target.value)} required min="1" max={MAX_TOKENS_PER_CREATE} step="1" />
        </label>
        {/* A creature fills these in; the GM can change them before placing (KAN-70). */}
        <details className="add-token-conditions" open={conditions.length > 0}>
          <summary>Starting conditions{conditions.length > 0 ? `: ${conditions.map((c) => conditionSpec(c).label).join(", ")}` : ""}</summary>
          <ConditionPicker value={conditions} onChange={setConditions} />
        </details>
        {/* Blank HP and AC fall back to the defaults shown as placeholders (token-stat-defaults). */}
        <div className="token-setup-grid">
          <label>HP<input type="number" value={hp} onChange={(e) => setHp(e.target.value)} min="-999" max="9999" step="1" placeholder={String(defaults.hp)} /></label>
          <label>Max HP<input type="number" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} min="1" max="9999" step="1" placeholder={String(defaults.maxHp)} /></label>
          <label>AC<input type="number" value={ac} onChange={(e) => setAc(e.target.value)} min="0" max="99" step="1" placeholder={String(defaults.ac)} /></label>
        </div>
        <span className="muted small-print">Blank fields use the value shown: HP and Max HP match each other, or are 100 if both are blank, and AC is 0.</span>
        <label>
          Owner
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">No owner (GM only)</option>
            {props.players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </label>
        <div className="stack token-image-field">
          <span className="field-label">Image</span>
          {image ? (
            <div className="row token-image-chosen">
              <TokenPreview url={image.url} color={color ?? DEFAULT_TOKEN_COLOR} hidden={hidden} />
              <span className="token-name" title={image.label}>{image.label}</span>
              <button type="button" className="link" onClick={() => setImage(null)}>
                Remove
              </button>
            </div>
          ) : (
            <div className="row">
              <label className="upload-button secondary">
                <span>{uploading ? "Uploading…" : "Upload new"}</span>
                <input
                  type="file"
                  className="sr-only"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={(e) => void onUpload(e.target.files?.[0])}
                />
              </label>
              {props.hasLibrary && (
                <button type="button" className="secondary" disabled={uploading} onClick={() => setPicking(true)}>
                  From library
                </button>
              )}
            </div>
          )}
        </div>
        {/* Rarely changed from their defaults, so tucked away (token-stat-defaults). No position
            fields: the GM points at the square on the board next (place-token-on-board). */}
        <details className="add-token-advanced">
          <summary>Advanced settings</summary>
          <div className="stack">
            <div className="token-setup-grid">
              <label>Size (cells)<input type="number" value={size} onChange={(e) => setSize(e.target.value)} required min="0.25" max="10" step="any" /></label>
              <label>Rotation (°)<input type="number" value={rotation} onChange={(e) => setRotation(e.target.value)} required step="any" /></label>
            </div>
            <label className="inline">
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
              Hidden from players
            </label>
          </div>
        </details>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={uploading}>Choose a square</button>
        <p className="muted">Next, click the square on the map where it should go.</p>
      </form>
      {/* Its own modal, stacked over this one (native dialogs stack), so searching the
          library has room. Kept outside the form so its buttons can never submit it. */}
      {props.hasLibrary && (
        <Modal open={pickingCreature} title="Choose a creature" onClose={() => setPickingCreature(false)}>
          <CreaturePicker
            onPick={(creature) => {
              // A creature's name is entered as its board name, so it may prefill the token's (ADR 0012).
              // Owner, Hidden and rotation stay as the GM set them.
              const draft = creatureDraft(creature);
              setName(draft.name);
              setSize(String(draft.size));
              setHp(draft.stats.hp === null ? "" : String(draft.stats.hp));
              setMaxHp(draft.stats.maxHp === null ? "" : String(draft.stats.maxHp));
              setAc(draft.stats.ac === null ? "" : String(draft.stats.ac));
              setImage(draft.image && { ...draft.image, label: creature.name });
              setColor(draft.color);
              setConditions(draft.conditions);
              setPickingCreature(false);
            }}
          />
        </Modal>
      )}
      {props.hasLibrary && (
        <Modal open={picking} title="Choose a token image" onClose={() => setPicking(false)}>
          <LibraryPicker
            kind="token"
            onPick={(asset) => {
              // The token name is left to the GM on purpose: prefilling the library name
              // would put it in front of players (asset-library: details stay private).
              setImage({ url: asset.url, assetId: libraryAssetId(asset), label: asset.name });
              setPicking(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}

const optionalNumber = (value: string) => value.trim() === "" ? null : Number(value);
