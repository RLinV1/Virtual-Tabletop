import { useEffect, useState, type FormEvent } from "react";
import { CreatureFields, DEFAULT_TOKEN_COLOR, type LibraryCreature } from "@vtt/shared";
import { api } from "../net/api";
import { Modal } from "../ui/Modal";
import { TokenPreview } from "../ui/TokenPreview";
import { creatureSummary } from "./creatureDraft";
import { LibraryPicker } from "./LibraryPicker";

/** A creature in the library's Creatures tab (library-creatures): its art or a colour disc, name and stats. */
export function CreatureCard(props: {
  creature: LibraryCreature;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { creature } = props;
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    try {
      await api.library.creatures.remove(creature.id);
      props.onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <li className="asset-card creature-card">
      <div className="asset-thumb token">
        {creature.imageUrl
          ? <img src={creature.imageUrl} alt="" loading="lazy" />
          : <span className="creature-disc" style={{ background: DEFAULT_TOKEN_COLOR }} aria-hidden="true" />}
      </div>
      <strong className="asset-name" title={creature.name}>{creature.name}</strong>
      <span className="muted asset-meta">{creatureSummary(creature)}</span>
      {error && <p role="alert" className="error">{error}</p>}
      {confirming ? (
        <div className="confirm" role="alertdialog" aria-label={`Delete ${creature.name}?`}>
          <p>Delete “{creature.name}”? Tokens already on a board stay as they are.</p>
          <div className="row">
            <button type="button" className="secondary small" disabled={deleting} onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="small danger-fill" disabled={deleting} onClick={() => void remove()}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      ) : (
        <div className="row asset-actions">
          <button type="button" className="link" onClick={props.onEdit}>Edit</button>
          <button type="button" className="link danger" onClick={() => setConfirming(true)}>Delete</button>
        </div>
      )}
    </li>
  );
}

const FIELD_HINTS: Record<string, string> = {
  name: "Give it a name of up to 60 characters.",
  size: "Size must be above 0 and at most 10 cells.",
  maxHp: "Max HP must be a whole number from 1 to 9999, or blank.",
  ac: "AC must be a whole number from 0 to 99, or blank.",
};

const optionalNumber = (value: string) => (value.trim() === "" ? null : Number(value));

/**
 * New or Edit creature. The name is the name its tokens show on the board, so players see
 * it (ADR 0012). The image is only ever the GM's own token art.
 */
export function CreatureForm(props: {
  creature: LibraryCreature | null;
  onSaved: (creature: LibraryCreature) => void;
  onCancel: () => void;
}) {
  const { creature } = props;
  const [name, setName] = useState(creature?.name ?? "");
  const [size, setSize] = useState(String(creature?.size ?? 1));
  const [maxHp, setMaxHp] = useState(creature?.maxHp == null ? "" : String(creature.maxHp));
  const [ac, setAc] = useState(creature?.ac == null ? "" : String(creature.ac));
  const [image, setImage] = useState<{ assetId: string; url: string; label: string } | null>(
    creature?.imageAssetId && creature.imageUrl ? { assetId: creature.imageAssetId, url: creature.imageUrl, label: "Current art" } : null,
  );
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = CreatureFields.safeParse({
    name,
    size: size.trim() === "" ? Number.NaN : Number(size),
    maxHp: optionalNumber(maxHp),
    ac: optionalNumber(ac),
    imageAssetId: image?.assetId ?? null,
  });
  const hint = parsed.success ? null : FIELD_HINTS[String(parsed.error.issues[0]?.path[0])] ?? "Check the values above.";
  const touched = creature !== null || name !== "";

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!parsed.success || saving) return;
    setSaving(true);
    setError(null);
    try {
      const saved = creature
        ? await api.library.creatures.update(creature.id, parsed.data)
        : await api.library.creatures.create(parsed.data);
      props.onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the creature");
      setSaving(false);
    }
  }

  return (
    <>
      <form className="stack creature-form" onSubmit={(e) => void save(e)}>
        <label>
          Name on the board
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus aria-describedby="creature-name-hint" />
          <span id="creature-name-hint" className="muted">Players see this name on the creature's tokens.</span>
        </label>
        <div className="token-setup-grid">
          <label>Size (cells)<input type="number" value={size} onChange={(e) => setSize(e.target.value)} required min="0.25" max="10" step="any" /></label>
          <label>Max HP<input type="number" value={maxHp} onChange={(e) => setMaxHp(e.target.value)} min="1" max="9999" step="1" /></label>
          <label>AC<input type="number" value={ac} onChange={(e) => setAc(e.target.value)} min="0" max="99" step="1" /></label>
        </div>
        <p className="muted small-print">Placed creatures start at full HP.</p>
        <div className="stack token-image-field">
          <span className="field-label">Image</span>
          {image ? (
            <div className="row token-image-chosen">
              <TokenPreview url={image.url} color={DEFAULT_TOKEN_COLOR} />
              <span className="token-name" title={image.label}>{image.label}</span>
              <button type="button" className="link" onClick={() => setImage(null)}>Remove</button>
            </div>
          ) : (
            <div className="row creature-image-choose">
              <button type="button" className="secondary" onClick={() => setPicking(true)}>Choose token art</button>
              <span className="muted">Without art it shows as a colour disc.</span>
            </div>
          )}
        </div>
        {touched && hint && <p className="error" role="alert">{hint}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row modal-actions">
          <button type="button" className="secondary" disabled={saving} onClick={props.onCancel}>Cancel</button>
          <button type="submit" disabled={!parsed.success || saving}>
            {saving ? "Saving…" : creature ? "Save creature" : "Create creature"}
          </button>
        </div>
      </form>
      {/* Stacked over this one, outside the form so its buttons can never submit it. */}
      <Modal open={picking} title="Choose token art" onClose={() => setPicking(false)}>
        <LibraryPicker
          kind="token"
          includeBuiltins={false}
          onPick={(asset) => {
            setImage({ assetId: asset.id, url: asset.url, label: asset.name });
            setPicking(false);
          }}
        />
      </Modal>
    </>
  );
}

/** Add Token's "From creature" list (library-creatures): the GM's creatures, searchable by name. */
export function CreaturePicker(props: { onPick: (creature: LibraryCreature) => void }) {
  const [creatures, setCreatures] = useState<LibraryCreature[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    api.library.creatures.list().then(
      (list) => live && setCreatures(list),
      (err: unknown) => live && setError(err instanceof Error ? err.message : "Could not load your creatures"),
    );
    return () => {
      live = false;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = (creatures ?? []).filter((c) => !q || c.name.toLowerCase().includes(q));

  return (
    <div className="library-picker" role="group" aria-label="Choose a creature">
      <input type="search" aria-label="Search creatures" placeholder="Search creatures" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      {error && <p role="alert" className="error">{error}</p>}
      {!creatures && !error && <p className="muted">Loading…</p>}
      {creatures && shown.length === 0 && (
        <p className="muted">
          {creatures.length === 0 ? "No creatures yet. Make them on the library's Creatures tab." : "Nothing matches that search."}
        </p>
      )}
      <ul className="plain picker-grid">
        {shown.map((c) => (
          <li key={c.id}>
            <button type="button" className="picker-item" onClick={() => props.onPick(c)} title={c.name}>
              {c.imageUrl
                ? <img src={c.imageUrl} alt="" loading="lazy" className="round" />
                : <span className="creature-disc" style={{ background: DEFAULT_TOKEN_COLOR }} aria-hidden="true" />}
              <span>{c.name}</span>
              <span className="muted small-print">{creatureSummary(c)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
