import { useState } from "react";
import { snapTokenCenter, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { loadGmToken } from "../net/identity";
import type { RoomConnection } from "../net/roomConnection";
import { LibraryPicker } from "../pages/LibraryPicker";
import { Modal } from "../ui/Modal";

const TOKEN_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085"];

/**
 * The GM's "Add token" button and its modal (room-sidebar-layout: GM setup forms open in
 * modals). Lives at the top of the Tokens section so every token control is in one place.
 */
export function AddTokenButton({ connection, state, token }: { connection: RoomConnection; state: RoomState; token: string }) {
  const [open, setOpen] = useState(false);
  // The library belongs to this device's GM identity; rooms made before it existed have none.
  const [gmToken] = useState(loadGmToken);
  const players = Object.values(state.participants).filter((p) => p.role === "player");

  return (
    <>
      <button type="button" data-tour="gm-add-token" onClick={() => setOpen(true)}>
        Add token
      </button>
      <Modal open={open} title="Add token" onClose={() => setOpen(false)}>
        <AddToken
          players={players}
          token={token}
          gmToken={gmToken}
          onDone={() => setOpen(false)}
          onAdd={async (name, ownerId, hidden, image, report) => {
            const map = state.scene.map;
            const count = Object.keys(state.tokens).length;
            const center = map ? { x: map.width / 2, y: map.height / 2 } : { x: 1050, y: 700 };
            // Fan new tokens out around the centre instead of stacking them all on one cell,
            // which made the roster and turn order useless the moment there was a second one.
            const ring = Math.floor(count / 8) + 1;
            const angle = (count % 8) * (Math.PI / 4);
            const spread = state.scene.grid.cellSize * ring;
            center.x += Math.cos(angle) * spread;
            center.y += Math.sin(angle) * spread;
            const result = await connection.command({
              type: "token.create",
              name,
              hidden,
              ownerIds: ownerId ? [ownerId] : [],
              color: TOKEN_COLORS[count % TOKEN_COLORS.length],
              position: snapTokenCenter(center, 1, state.scene.grid),
              imageUrl: image?.url ?? null,
              assetId: image?.assetId ?? null,
            });
            report(result.ok ? null : result.message);
            return result.ok;
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
  onAdd: (
    name: string,
    ownerId: string,
    hidden: boolean,
    image: TokenImage | null,
    report: (message: string | null) => void,
  ) => Promise<boolean>;
  /** Called after a token is created, to close the modal. */
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [hidden, setHidden] = useState(false);
  const [image, setImage] = useState<TokenImage | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUpload(file: File | undefined) {
    if (!file) return;
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
        onSubmit={async (e) => {
          e.preventDefault();
          if (await props.onAdd(name, ownerId, hidden, image, setError)) props.onDone();
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus />
        </label>
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
              <img src={image.url} alt="" className="round" />
              <span className="token-name">{image.label}</span>
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
                <button type="button" className="secondary" onClick={() => setPicking(true)}>
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
        <button type="submit">Add token</button>
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
              setImage({ url: asset.url, assetId: asset.id, label: asset.name });
              setPicking(false);
            }}
          />
        </Modal>
      )}
    </>
  );
}
