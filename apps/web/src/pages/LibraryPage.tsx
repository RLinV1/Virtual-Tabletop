import { useEffect, useMemo, useState } from "react";
import type { AssetKind, LibraryAsset } from "@vtt/shared";
import { Link } from "../Link";
import { api } from "../net/api";
import { getGmToken } from "../net/gm";
import { imageSize, nameFromFile } from "../net/imageFile";
import { AccountMenu } from "./AccountPages";

const TABS: { kind: AssetKind; label: string }[] = [
  { kind: "map", label: "Maps" },
  { kind: "token", label: "Tokens" },
];

/** The GM's maps and token art, managed before a session (asset-library). */
export function LibraryPage() {
  const [gmToken, setGmToken] = useState<string | null>(null);
  const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
  const [kind, setKind] = useState<AssetKind>("map");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Opening the library is a GM action, so it creates the device identity if needed.
    getGmToken()
      .then(async (token) => {
        setGmToken(token);
        setAssets(await api.library.list(token));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the library"));
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (assets ?? []).filter((a) => a.kind === kind && (!q || a.name.toLowerCase().includes(q)));
  }, [assets, kind, query]);

  const replace = (next: LibraryAsset) => setAssets((all) => (all ?? []).map((a) => (a.id === next.id ? next : a)));

  return (
    <main className="home">
      <header className="home-header">
        <Link href="/" className="brand">
          Virtual Tabletop
        </Link>
        <nav className="home-nav">
          <Link href="/">My rooms</Link>
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
        {gmToken && (
          <UploadButton
            gmToken={gmToken}
            kind={kind}
            onUploaded={(a) => setAssets((all) => [a, ...(all ?? [])])}
            onError={setError}
          />
        )}
      </div>

      {!assets && !error && <p className="muted" aria-busy="true">Loading…</p>}
      {assets && shown.length === 0 && (
        <p className="muted">
          {query ? "Nothing matches that search." : kind === "map" ? "No maps yet. Upload one to get started." : "No tokens yet."}
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
              onDeleted={() => setAssets((all) => (all ?? []).filter((a) => a.id !== asset.id))}
            />
          ))}
      </ul>
    </main>
  );
}

function UploadButton(props: {
  gmToken: string;
  kind: AssetKind;
  onUploaded: (asset: LibraryAsset) => void;
  onError: (message: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    props.onError(null);
    try {
      const { width, height } = await imageSize(file);
      props.onUploaded(await api.library.upload(props.gmToken, file, { kind: props.kind, name: nameFromFile(file), width, height }));
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
