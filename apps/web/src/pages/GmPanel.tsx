import { useEffect, useState, type FormEvent } from "react";
import { snapTokenCenter, type GridSpec, type LibraryAsset, type MapImage, type RoomState } from "@vtt/shared";
import { api } from "../net/api";
import { loadGmToken } from "../net/identity";
import { imageSize } from "../net/imageFile";
import type { CommandResult, RoomConnection } from "../net/roomConnection";
import { LibraryPicker } from "./LibraryPicker";

interface Props {
  connection: RoomConnection;
  state: RoomState;
  inviteCode?: string;
  token: string;
}

const TOKEN_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085"];

export function GmPanel({ connection, state, inviteCode, token }: Props) {
  const [error, setError] = useState<string | null>(null);
  // The library belongs to this device's GM identity; rooms made before it existed have none.
  const [gmToken] = useState(loadGmToken);
  const players = Object.values(state.participants).filter((p) => p.role === "player");

  const run = async (p: Promise<CommandResult>) => {
    const result = await p;
    setError(result.ok ? null : result.message);
    return result.ok;
  };

  return (
    <>
      {error && <p role="alert" className="error">{error}</p>}
      <InviteLink inviteCode={inviteCode} />
      <MapSection
        token={token}
        gmToken={gmToken}
        onError={setError}
        onSetMap={(map, grid) => run(connection.command({ type: "scene.setMap", map, grid }))}
      />
      <GridForm grid={state.scene.grid} onApply={(grid) => run(connection.command({ type: "scene.setGrid", grid }))} />
      {gmToken && state.scene.map?.assetId && (
        <SaveGridToLibrary gmToken={gmToken} assetId={state.scene.map.assetId} grid={state.scene.grid} />
      )}
      <AddToken
        players={players}
        token={token}
        gmToken={gmToken}
        onError={setError}
        onAdd={(name, ownerId, hidden, image) => {
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
          return run(
            connection.command({
              type: "token.create",
              name,
              hidden,
              ownerIds: ownerId ? [ownerId] : [],
              color: TOKEN_COLORS[count % TOKEN_COLORS.length],
              position: snapTokenCenter(center, 1, state.scene.grid),
              imageUrl: image?.url ?? null,
              assetId: image?.assetId ?? null,
            }),
          );
        }}
      />
      <section>
        <h2>Manage tokens</h2>
        {Object.values(state.tokens).length === 0 && <p className="muted">No tokens yet.</p>}
        <ul className="plain token-list">
          {Object.values(state.tokens).map((t) => (
            <li key={t.id}>
              <span className="swatch" style={{ background: t.color }} aria-hidden />
              <span className="token-name">{t.name}</span>
              <select
                aria-label={`Owner of ${t.name}`}
                value={t.ownerIds[0] ?? ""}
                onChange={(e) =>
                  run(connection.command({ type: "token.setOwners", tokenId: t.id, ownerIds: e.target.value ? [e.target.value] : [] }))
                }
              >
                <option value="">No owner</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              <label className="inline">
                <input
                  type="checkbox"
                  checked={t.hidden}
                  onChange={(e) => run(connection.command({ type: "token.setHidden", tokenId: t.id, hidden: e.target.checked }))}
                />
                Hidden
              </label>
              <button
                className="link danger"
                onClick={() => run(connection.command({ type: "token.delete", tokenId: t.id }))}
                aria-label={`Delete ${t.name}`}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function InviteLink({ inviteCode }: { inviteCode?: string }) {
  const [copied, setCopied] = useState(false);
  if (!inviteCode) return null;
  const url = `${location.origin}/join/${inviteCode}`;
  return (
    <section>
      <h2>Invite players</h2>
      <div className="row">
        <input readOnly value={url} aria-label="Invite link" onFocus={(e) => e.target.select()} />
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked; the field is selectable */
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </section>
  );
}

/** Set the battle map from a fresh upload or the GM's library (asset-library). */
function MapSection(props: {
  token: string;
  gmToken: string | null;
  onSetMap: (map: MapImage, grid?: GridSpec) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  async function onChange(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await api.upload(file, props.token);
      const { width, height } = await imageSize(url);
      await props.onSetMap({ url, width, height });
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  // Placing copies the saved grid into the room in the same event (ADR 0004); later
  // library edits never reach back into this room.
  const place = async (asset: LibraryAsset) => {
    const map = { url: asset.url, width: asset.width, height: asset.height, assetId: asset.id };
    if (await props.onSetMap(map, asset.grid ?? undefined)) setPicking(false);
  };

  return (
    <section>
      <h2>Battle map</h2>
      <label>
        Upload new
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          aria-label="Upload battle map"
          onChange={(e) => onChange(e.target.files?.[0])}
        />
      </label>
      {busy && <p className="muted">Uploading…</p>}
      {props.gmToken &&
        (picking ? (
          <LibraryPicker gmToken={props.gmToken} kind="map" onPick={(a) => void place(a)} onClose={() => setPicking(false)} />
        ) : (
          <button type="button" className="secondary" onClick={() => setPicking(true)}>
            From library
          </button>
        ))}
    </section>
  );
}

/** Explicitly writes the room's current grid back to the library map it came from. */
function SaveGridToLibrary({ gmToken, assetId, grid }: { gmToken: string; assetId: string; grid: GridSpec }) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setStatus("idle");
    setError(null);
  }, [assetId, grid]);
  return (
    <section>
      <button
        type="button"
        className="secondary"
        disabled={status === "saving"}
        onClick={async () => {
          setStatus("saving");
          setError(null);
          try {
            await api.library.update(gmToken, assetId, { grid });
            setStatus("saved");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save the grid");
            setStatus("idle");
          }
        }}
      >
        {status === "saving" ? "Saving…" : "Save grid to library"}
      </button>
      {status === "saved" && <p className="muted" role="status">Saved. Future placements of this map use this grid.</p>}
      {error && <p role="alert" className="error">{error}</p>}
    </section>
  );
}

/** Manual grid correction (FR-GM-04). Automatic detection (FR-GM-03) will prefill these. */
function GridForm({ grid, onApply }: { grid: GridSpec; onApply: (grid: GridSpec) => Promise<boolean> }) {
  const [draft, setDraft] = useState(grid);
  useEffect(() => setDraft(grid), [grid]);

  const field = (key: "cellSize" | "offsetX" | "offsetY" | "unitsPerCell", label: string) => (
    <label>
      {label}
      <input
        type="number"
        step="0.5"
        min={0}
        value={draft[key]}
        onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
      />
    </label>
  );

  return (
    <section>
      <h2>Grid</h2>
      <form
        className="grid-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          onApply(draft);
        }}
      >
        {field("cellSize", "Cell size (px)")}
        {field("unitsPerCell", `Per cell (${draft.unitLabel})`)}
        {field("offsetX", "Offset X")}
        {field("offsetY", "Offset Y")}
        <button type="submit">Apply grid</button>
      </form>
    </section>
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
  onError: (message: string) => void;
  onAdd: (name: string, ownerId: string, hidden: boolean, image: TokenImage | null) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [hidden, setHidden] = useState(false);
  const [image, setImage] = useState<TokenImage | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.upload(file, props.token);
      setImage({ url, assetId: null, label: file.name });
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section>
      <h2>Add token</h2>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await props.onAdd(name, ownerId, hidden, image)) {
            setName("");
            setImage(null);
          }
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
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
          ) : picking && props.gmToken ? (
            <LibraryPicker
              gmToken={props.gmToken}
              kind="token"
              onClose={() => setPicking(false)}
              onPick={(asset) => {
                // The token name is left to the GM on purpose: prefilling the library name
                // would put it in front of players (asset-library: details stay private).
                setImage({ url: asset.url, assetId: asset.id, label: asset.name });
                setPicking(false);
              }}
            />
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
        <button type="submit">Add token</button>
      </form>
    </section>
  );
}
