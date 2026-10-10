import { useState, type FormEvent } from "react";
import { MAX_ENCOUNTER_NAME, type EncounterSummary } from "@vtt/shared";
import { api } from "../net/api";

/** "3 tokens · 1 fog region", for a template's card and pickers. */
export function encounterSummary(encounter: EncounterSummary): string {
  const tokens = `${encounter.tokenCount} ${encounter.tokenCount === 1 ? "token" : "tokens"}`;
  const fog = encounter.fogCount > 0 ? ` · ${encounter.fogCount} fog ${encounter.fogCount === 1 ? "region" : "regions"}` : "";
  return `${tokens}${fog}`;
}

/** An encounter template in the library's Encounters tab (encounter-templates, FR-GM-13): rename and delete. */
export function EncounterCard(props: {
  encounter: EncounterSummary;
  onChanged: (encounter: EncounterSummary) => void;
  onDeleted: () => void;
}) {
  const { encounter } = props;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(encounter.name);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rename(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === encounter.name) return setEditing(false);
    setBusy(true);
    try {
      props.onChanged(await api.library.encounters.rename(encounter.id, trimmed));
      setEditing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.library.encounters.remove(encounter.id);
      props.onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <li className="asset-card encounter-card">
      {editing ? (
        <form className="row" onSubmit={(e) => void rename(e)}>
          <label className="grow">
            <span className="sr-only">Template name</span>
            <input value={name} maxLength={MAX_ENCOUNTER_NAME} autoFocus onChange={(e) => setName(e.target.value)} disabled={busy} />
          </label>
          <button type="submit" className="small" disabled={busy}>Save</button>
          <button type="button" className="secondary small" disabled={busy} onClick={() => { setEditing(false); setName(encounter.name); }}>
            Cancel
          </button>
        </form>
      ) : (
        <strong className="asset-name" title={encounter.name}>{encounter.name}</strong>
      )}
      <span className="muted asset-meta">
        {encounter.mapName ?? "Map deleted"} · {encounterSummary(encounter)}
      </span>
      {encounter.mapName === null && (
        <p role="alert" className="error">Its map was deleted, so this template can't be used until you save it again from a room.</p>
      )}
      {error && <p role="alert" className="error">{error}</p>}
      {confirming ? (
        <div className="confirm" role="alertdialog" aria-label={`Delete ${encounter.name}?`}>
          <p>Delete “{encounter.name}”? Rooms already made from it stay as they are.</p>
          <div className="row">
            <button type="button" className="secondary small" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="small danger-fill" disabled={busy} onClick={() => void remove()}>
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      ) : (
        <div className="row asset-actions">
          <button type="button" className="link" onClick={() => setEditing(true)}>Rename</button>
          <button type="button" className="link danger" onClick={() => setConfirming(true)}>Delete</button>
        </div>
      )}
    </li>
  );
}
