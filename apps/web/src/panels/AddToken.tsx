import { useRef, useState } from "react";
import { DEFAULT_TOKEN_COLOR, isActive, type RoomState } from "@vtt/shared";
import type { TokenDraft } from "../board/placement";
import { api } from "../net/api";
import { loadGmToken } from "../net/identity";
import { libraryAssetId } from "../net/builtinAssets";
import { LibraryPicker } from "../pages/LibraryPicker";
import { Modal } from "../ui/Modal";
import { TokenPreview } from "../ui/TokenPreview";

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
  // The library belongs to this device's GM identity; rooms made before it existed have none.
  const [gmToken] = useState(loadGmToken);
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
          gmToken={gmToken}
          onAdd={(draft) => {
            pending.current = { ...draft, color: TOKEN_COLORS[Object.keys(state.tokens).length % TOKEN_COLORS.length] };
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
  gmToken: string | null;
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
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            stats: { hp: optionalNumber(hp), maxHp: optionalNumber(maxHp), ac: optionalNumber(ac) },
            imageUrl: image?.url ?? null, assetId: image?.assetId ?? null,
          });
        }}
      >
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
        {/* No position fields: the GM points at the square on the board next (place-token-on-board). */}
        <div className="token-setup-grid">
          <label>Size (cells)<input type="number" value={size} onChange={(e) => setSize(e.target.value)} required min="0.25" max="10" step="any" /></label>
          <label>Rotation (°)<input type="number" value={rotation} onChange={(e) => setRotation(e.target.value)} required step="any" /></label>
        </div>
        <div className="token-setup-grid">
          <label>HP<input type="number" value={hp} onChange={(e) => setHp(e.target.value)} min="-999" max="9999" step="1" /></label>
          <label>Max HP<input type="number" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} min="1" max="9999" step="1" /></label>
          <label>AC<input type="number" value={ac} onChange={(e) => setAc(e.target.value)} min="0" max="99" step="1" /></label>
        </div>
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
              <TokenPreview url={image.url} color={DEFAULT_TOKEN_COLOR} hidden={hidden} />
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
              {props.gmToken && (
                <button type="button" className="secondary" disabled={uploading} onClick={() => setPicking(true)}>
                  From library
                </button>
              )}
            </div>
          )}
        </div>
        <label className="inline">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Hidden from players
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" disabled={uploading}>Choose a square</button>
        <p className="muted">Next, click the square on the map where it should go.</p>
      </form>
      {/* Its own modal, stacked over this one (native dialogs stack), so searching the
          library has room. Kept outside the form so its buttons can never submit it. */}
      {props.gmToken && (
        <Modal open={picking} title="Choose a token image" onClose={() => setPicking(false)}>
          <LibraryPicker
            gmToken={props.gmToken}
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
