import { useEffect, useMemo, useState } from "react";
import { DEFAULT_GRID, normalizeLegacyGridForBoard, type AssetKind, type GridSpec, type LibraryAsset } from "@vtt/shared";
import { Link } from "../Link";
import { api } from "../net/api";
import { builtinsMatching } from "../net/builtinAssets";
import { getGmToken } from "../net/gm";
import { isRecognised, loadGmToken } from "../net/identity";
import { imageSize, nameFromFile } from "../net/imageFile";
import { navigate } from "../router";
import { Modal } from "../ui/Modal";
import { AccountMenu } from "./AccountPages";
import { GridForm } from "./GridForm";
import { parseGridDraft, toGridDraft } from "./gridDraft";
import { MapGridPreview } from "./MapGridPreview";

const TABS: { kind: AssetKind; label: string }[] = [
  { kind: "map", label: "Maps" },
  { kind: "token", label: "Tokens" },
];

/**
 * The library is a GM surface, so it follows the dashboard's entry rule (gm-dashboard): a
 * browser that is not recognised goes to sign-in first. Replace, not push, so Back from
 * sign-in does not land on this redirect again.
 */
export function LibraryPage() {
  const [recognised] = useState(isRecognised);

  useEffect(() => {
    if (!recognised) navigate("/signin", { replace: true });
  }, [recognised]);

  return recognised ? <Library /> : null;
}

/** The GM's maps and token art, managed before a session (asset-library). */
function Library() {
  const [gmToken, setGmToken] = useState<string | null>(loadGmToken);
  // No GM identity yet means nothing uploaded yet: an empty library, with nothing to fetch.
  const [assets, setAssets] = useState<LibraryAsset[] | null>(gmToken ? null : []);
  const [kind, setKind] = useState<AssetKind>("map");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The owned map whose grid is open in the editor. */
  const [gridTarget, setGridTarget] = useState<LibraryAsset | null>(null);

  useEffect(() => {
    // Reading the library never creates a GM identity (asset-library); the first upload does.
    if (!gmToken) return;
    let live = true;
    api.library.list(gmToken).then(
      (list) => live && setAssets(list),
      (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not load the library"),
    );
    return () => {
      live = false;
    };
    // Only the token present on arrival is listed; one created by an upload starts empty.
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (assets ?? []).filter((a) => a.kind === kind && (!q || a.name.toLowerCase().includes(q)));
  }, [assets, kind, query]);

  const builtins = useMemo(() => builtinsMatching(kind, query), [kind, query]);

  const replace = (next: LibraryAsset) => setAssets((all) => (all ?? []).map((a) => (a.id === next.id ? next : a)));

  return (
    <main className="home">
      <header className="home-header">
        <Link href="/" className="brand">
          Virtual Tabletop
        </Link>
        <nav className="home-nav">
          <Link href="/gm-dashboard">My rooms</Link>
          <AccountMenu />
        </nav>
      </header>
      <h1>Asset library</h1>
      {error && <p role="alert" className="error">{error}</p>}

      <div className="library-toolbar">
        <div role="tablist" aria-label="Asset type" className="tabs">
          {TABS.map((t) => (
            <button
              key={t.kind}
              type="button"
              role="tab"
              aria-selected={kind === t.kind}
              className={kind === t.kind ? "tab active" : "tab"}
              onClick={() => setKind(t.kind)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Search by name"
          placeholder="Search by name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <UploadButton
          kind={kind}
          onUploaded={(token, a) => {
            setGmToken(token);
            setAssets((all) => [a, ...(all ?? [])]);
          }}
          onError={setError}
        />
      </div>

      {!assets && !error && <p className="muted" aria-busy="true">Loading…</p>}
      {assets && shown.length === 0 && (
        <p className="muted">
          {query
            ? "None of your uploads match that search."
            : `You haven't uploaded any ${kind === "map" ? "maps" : "tokens"} yet. The ones below are ready to use.`}
        </p>
      )}
      <ul className="plain asset-grid" role="tabpanel">
        {gmToken &&
          shown.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              gmToken={gmToken}
              onChanged={replace}
              onEditGrid={() => setGridTarget(asset)}
              onDeleted={() => setAssets((all) => (all ?? []).filter((a) => a.id !== asset.id))}
            />
          ))}
      </ul>

      {builtins.length > 0 && (
        <section className="builtin-assets" aria-labelledby="builtin-heading">
          <h2 id="builtin-heading">Included with the app</h2>
          <p className="muted">Every GM has these. Place them from “From library” in any room.</p>
          <ul className="plain asset-grid">
            {builtins.map((asset) => (
              <BuiltinCard key={asset.id} asset={asset} />
            ))}
          </ul>
        </section>
      )}

      <Modal open={gridTarget !== null} title="Edit grid" className="library-grid-modal" onClose={() => setGridTarget(null)}>
        {gmToken && gridTarget && (
          <LibraryGridEditor
            key={gridTarget.id}
            asset={gridTarget}
            gmToken={gmToken}
            onCancel={() => setGridTarget(null)}
            onSaved={(saved) => {
              replace(saved);
              setGridTarget((open) => (open?.id === saved.id ? null : open));
            }}
          />
        )}
      </Modal>
    </main>
  );
}

/** A built-in asset: the same card, without Rename or Delete (builtin-library-assets). */
function BuiltinCard({ asset }: { asset: LibraryAsset }) {
  return (
    <li className="asset-card">
      <div className={asset.kind === "token" ? "asset-thumb token" : "asset-thumb"}>
        <img src={asset.url} alt="" loading="lazy" decoding="async" />
      </div>
      <strong className="asset-name" title={asset.name}>
        {asset.name}
      </strong>
      <span className="muted asset-meta">
        {asset.width}×{asset.height}
        {asset.grid && ` · ${asset.grid.cellSize}px grid`}
      </span>
    </li>
  );
}

function UploadButton(props: {
  kind: AssetKind;
  onUploaded: (gmToken: string, asset: LibraryAsset) => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    props.onError(null);
    try {
      const { width, height } = await imageSize(file);
      // An upload is a GM write, so this is where the identity is created if there is none.
      const gmToken = await getGmToken();
      props.onUploaded(gmToken, await api.library.upload(gmToken, file, { kind: props.kind, name: nameFromFile(file), width, height }));
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <label className="upload-button">
      <span>{busy ? "Uploading…" : props.kind === "map" ? "Upload map" : "Upload token"}</span>
      <input
        type="file"
        className="sr-only"
        accept="image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </label>
  );
}

type DeleteState =
  | { step: "idle" }
  | { step: "checking" }
  | { step: "confirm"; rooms: { id: string; name: string }[] }
  | { step: "deleting" };

function AssetCard(props: {
  asset: LibraryAsset;
  gmToken: string;
  onChanged: (asset: LibraryAsset) => void;
  onEditGrid: () => void;
  onDeleted: () => void;
}) {
  const { asset, gmToken } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(asset.name);
  const [del, setDel] = useState<DeleteState>({ step: "idle" });
  const [error, setError] = useState<string | null>(null);

  async function rename() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === asset.name) return setEditing(false);
    try {
      props.onChanged(await api.library.update(gmToken, asset.id, { name: trimmed }));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    }
  }

  async function startDelete() {
    setError(null);
    setDel({ step: "checking" });
    try {
      // Ask the server who uses it now, so the warning is never stale (asset-library).
      const { rooms } = await api.library.usage(gmToken, asset.id);
      setDel({ step: "confirm", rooms });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check where this is used");
      setDel({ step: "idle" });
    }
  }

  async function confirmDelete() {
    setDel({ step: "deleting" });
    try {
      await api.library.remove(gmToken, asset.id);
      props.onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDel({ step: "idle" });
    }
  }

  const standIn = asset.kind === "map" ? "a blank map of the same size" : "a plain coloured token";

  return (
    <li className="asset-card">
      <div className={asset.kind === "token" ? "asset-thumb token" : "asset-thumb"}>
        <img src={asset.url} alt="" loading="lazy" />
      </div>
      {editing ? (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            void rename();
          }}
        >
          <input aria-label="Name" value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="small">
            Save
          </button>
        </form>
      ) : (
        <strong className="asset-name" title={asset.name}>
          {asset.name}
        </strong>
      )}
      <span className="muted asset-meta">
        {asset.width}×{asset.height}
        {asset.grid && ` · ${asset.grid.cellSize}px grid`}
      </span>
      {error && <p role="alert" className="error">{error}</p>}

      {del.step === "confirm" ? (
        <div className="confirm" role="alertdialog" aria-label={`Delete ${asset.name}?`}>
          {del.rooms.length > 0 ? (
            <p>
              Used in {del.rooms.length === 1 ? "1 room" : `${del.rooms.length} rooms`}:{" "}
              <strong>{del.rooms.map((r) => r.name || "Untitled room").join(", ")}</strong>. They will show {standIn} instead.
            </p>
          ) : (
            <p>Delete “{asset.name}”? This can't be undone.</p>
          )}
          <div className="row">
            <button type="button" className="secondary small" onClick={() => setDel({ step: "idle" })}>
              Cancel
            </button>
            <button type="button" className="small danger-fill" onClick={() => void confirmDelete()}>
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="row asset-actions">
          <button type="button" className="link" onClick={() => setEditing(!editing)}>
            {editing ? "Cancel" : "Rename"}
          </button>
          {asset.kind === "map" && (
            <button type="button" className="link" onClick={props.onEditGrid}>
              Edit grid
            </button>
          )}
          <button
            type="button"
            className="link danger"
            disabled={del.step !== "idle"}
            onClick={() => void startDelete()}
          >
            {del.step === "checking" ? "Checking…" : del.step === "deleting" ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}
    </li>
  );
}

/**
 * A library map's grid, edited without a room (asset-library: Edit a map's grid in the
 * library). Saving writes only the library copy; rooms keep the grid they placed.
 */
function LibraryGridEditor({ asset, gmToken, onCancel, onSaved }: {
  asset: LibraryAsset;
  gmToken: string;
  onCancel: () => void;
  onSaved: (asset: LibraryAsset) => void;
}) {
  const saved = asset.grid ?? DEFAULT_GRID;
  // An older grid too fine to draw starts at the smallest drawable size, as placement does.
  const [draft, setDraft] = useState(() => toGridDraft(normalizeLegacyGridForBoard(saved, asset)));
  const [shown, setShown] = useState<GridSpec>(() => normalizeLegacyGridForBoard(saved, asset));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="library-grid-editor">
      {/* An invalid draft leaves the last valid grid on the map. */}
      <MapGridPreview map={asset} grid={shown} />
      <div className="stack">
        <GridForm
          grid={saved}
          map={asset}
          draft={draft}
          hasDraft
          onChange={(next) => {
            setDraft(next);
            setError(null);
            const valid = parseGridDraft(next, asset);
            if (valid) setShown(valid);
          }}
          onCancel={onCancel}
          onApply={async (grid) => {
            setSaving(true);
            setError(null);
            try {
              onSaved(await api.library.update(gmToken, asset.id, { grid }));
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save the grid");
            } finally {
              setSaving(false);
            }
          }}
          applying={saving}
          error={error}
          submitLabel="Save grid"
          busyLabel="Saving…"
        />
        <p className="muted small-print">Rooms already using this map keep their grid. New placements use this one.</p>
      </div>
    </div>
  );
}
