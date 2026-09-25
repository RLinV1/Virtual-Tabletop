import { useEffect, useMemo, useState } from "react";
import type { AssetKind, LibraryAsset } from "@vtt/shared";
import { api } from "../net/api";
import { builtinsMatching } from "../net/builtinAssets";

/**
 * Pick a map or token from the GM's library inside a room (asset-library: Place a library
 * asset). The GM's own uploads come first, then the art that ships with the app
 * (builtin-library-assets), so the picker is useful before anything has been uploaded.
 */
export function LibraryPicker(props: {
  gmToken: string;
  kind: AssetKind;
  onPick: (asset: LibraryAsset) => void;
  /** Shows a Close button when the picker is inline; omitted inside a modal. */
  onClose?: () => void;
}) {
  const [assets, setAssets] = useState<LibraryAsset[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.library.list(props.gmToken).then(setAssets, (err: unknown) =>
      setError(err instanceof Error ? err.message : "Could not load the library"),
    );
  }, [props.gmToken]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const own = (assets ?? []).filter((a) => a.kind === props.kind && (!q || a.name.toLowerCase().includes(q)));
    return [...own, ...builtinsMatching(props.kind, query)];
  }, [assets, props.kind, query]);

  return (
    <div className="library-picker" role="group" aria-label={`Choose a ${props.kind} from your library`}>
      <div className="row">
        <input type="search" aria-label="Search library" placeholder={props.kind === "map" ? "Search maps" : "Search tokens"} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        {props.onClose && (
          <button type="button" className="secondary small" onClick={props.onClose}>
            Close
          </button>
        )}
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {!assets && !error && <p className="muted">Loading…</p>}
      {shown.length === 0 && <p className="muted">Nothing matches that search.</p>}
      <ul className="plain picker-grid">
        {shown.map((a) => (
          <li key={a.id}>
            <button type="button" className="picker-item" onClick={() => props.onPick(a)} title={a.name}>
              <img src={a.url} alt="" loading="lazy" className={props.kind === "token" ? "round" : undefined} />
              <span>{a.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
