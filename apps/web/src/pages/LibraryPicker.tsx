import { useEffect, useMemo, useState } from "react";
import type { AssetKind, LibraryAsset } from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { api } from "../net/api";
import { builtinsMatching } from "../net/builtinAssets";

/**
 * Pick a map or token from the signed-in account's library inside a room (asset-library: Place a library
 * asset). The GM's own uploads come first, then the art that ships with the app
 * (builtin-library-assets), so the picker is useful before anything has been uploaded.
 */
export function LibraryPicker(props: {
  kind: AssetKind;
  onPick: (asset: LibraryAsset) => void;
  /** Shows a Close button when the picker is inline; omitted inside a modal. */
  onClose?: () => void;
  /** False lists only the GM's own assets, e.g. for a creature's image (ADR 0012). */
  includeBuiltins?: boolean;
}) {
  const includeBuiltins = props.includeBuiltins ?? true;
  // A signed-out GM has no library, only the built-in art (builtin-library-assets).
  const signedIn = useAccount().status === "signedIn";
  const [assets, setAssets] = useState<LibraryAsset[] | null>(signedIn ? null : []);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!signedIn) {
      // Signing out must not leave the account's private art on screen.
      setAssets([]);
      return () => {
        active = false;
      };
    }
    api.library.list().then(
      (next) => {
        if (active) setAssets(next);
      },
      (err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load the library");
      },
    );
    return () => {
      active = false;
    };
  }, [signedIn]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const own = (assets ?? []).filter((a) => a.kind === props.kind && (!q || a.name.toLowerCase().includes(q)));
    return includeBuiltins ? [...own, ...builtinsMatching(props.kind, query)] : own;
  }, [assets, props.kind, query, includeBuiltins]);

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
      {assets && shown.length === 0 && (
        <p className="muted">
          {query.trim() || includeBuiltins ? "Nothing matches that search." : "No token art uploaded yet. Add some on the library's Token Art tab."}
        </p>
      )}
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
