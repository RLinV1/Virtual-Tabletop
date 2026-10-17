import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ANIMATION_SHAPES, AnimationDef, MAX_ANIMATION_NAME, type LibraryAnimation } from "@vtt/shared";
import { BUILTIN_ANIMATIONS, ATTACK_STYLE_PRESETS } from "../board/effectPresets";
import { prefersReducedMotion } from "../board/effects";
import { api } from "../net/api";
import { AnimationPreviewStage } from "../ui/AnimationPreviewStage";
import { Modal } from "../ui/Modal";

/** What the Animations tab shows for a shape. */
const SHAPE_LABELS: Record<AnimationDef["shape"], string> = {
  slash: "Slash (melee)",
  projectile: "Projectile (ranged)",
  bolt: "Bolt (magic)",
  nuke: "Nuke (map blast)",
};

const NEW_ANIMATION_NAME = "New animation";

/** Library animations whose name contains `query`, in the order given (case-insensitive). */
export function filterAnimations(animations: readonly LibraryAnimation[], query: string): LibraryAnimation[] {
  const q = query.trim().toLowerCase();
  return animations.filter((a) => !q || a.name.toLowerCase().includes(q));
}

/** A copy's name: "<name> copy", kept within the name limit. */
export function copyName(name: string): string {
  return `${name.slice(0, MAX_ANIMATION_NAME - " copy".length).trimEnd()} copy`;
}

/**
 * The library's Animations tab (ADR 0038): the GM's saved board animations with search, create,
 * rename, duplicate, delete and "Start from built-in", and an editor with a live preview.
 */
export function AnimationsTab({ query, onError }: { query: string; onError: (message: string | null) => void }) {
  const [animations, setAnimations] = useState<LibraryAnimation[] | null>(null);
  const [editing, setEditing] = useState<LibraryAnimation | "new" | null>(null);

  useEffect(() => {
    let live = true;
    api.library.animations.list().then(
      (list) => live && setAnimations(list),
      (err: unknown) => live && onError(err instanceof Error ? err.message : "Could not load your animations"),
    );
    return () => {
      live = false;
    };
  }, [onError]);

  const shown = useMemo(() => filterAnimations(animations ?? [], query), [animations, query]);
  const upsert = (saved: LibraryAnimation) =>
    setAnimations((all) => (all?.some((a) => a.id === saved.id) ? all.map((a) => (a.id === saved.id ? saved : a)) : [saved, ...(all ?? [])]));

  const create = async (name: string, def: AnimationDef): Promise<LibraryAnimation | null> => {
    try {
      const saved = await api.library.animations.create({ name, def });
      upsert(saved);
      onError(null);
      return saved;
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not create the animation");
      return null;
    }
  };

  return (
    <>
      <div className="row">
        <button type="button" onClick={() => setEditing("new")}>New animation</button>
        <label className="inline-field">
          <span className="sr-only">Start from built-in</span>
          <select
            aria-label="Start from built-in"
            value=""
            onChange={(e) => {
              const builtin = BUILTIN_ANIMATIONS.find((b) => b.id === e.target.value);
              if (builtin) void create(builtin.name, builtin.def).then((saved) => saved && setEditing(saved));
            }}
          >
            <option value="">Start from built-in…</option>
            {BUILTIN_ANIMATIONS.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      </div>

      {!animations && <p className="muted" aria-busy="true">Loading…</p>}
      {animations && shown.length === 0 && (
        <p className="muted">
          {query
            ? "None of your animations match that search."
            : "You haven't made any animations yet. Start from a built-in, then give an attack its own look from the attack editor."}
        </p>
      )}
      <ul className="plain asset-grid" role="tabpanel">
        {shown.map((animation) => (
          <AnimationCard
            key={animation.id}
            animation={animation}
            onEdit={() => setEditing(animation)}
            onRenamed={upsert}
            onDuplicate={() => void create(copyName(animation.name), animation.def)}
            onDeleted={() => setAnimations((all) => (all ?? []).filter((a) => a.id !== animation.id))}
            onError={onError}
          />
        ))}
      </ul>

      <Modal open={editing !== null} title={editing === "new" || editing === null ? "New animation" : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
        {editing !== null && (
          <AnimationEditor
            key={editing === "new" ? "new" : editing.id}
            animation={editing === "new" ? null : editing}
            onSaved={(saved) => {
              upsert(saved);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}

function AnimationCard(props: {
  animation: LibraryAnimation;
  onEdit: () => void;
  onRenamed: (animation: LibraryAnimation) => void;
  onDuplicate: () => void;
  onDeleted: () => void;
  onError: (message: string | null) => void;
}) {
  const { animation } = props;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    const name = (renaming ?? "").trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      props.onRenamed(await api.library.animations.update(animation.id, { name }));
      setRenaming(null);
      props.onError(null);
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.library.animations.remove(animation.id);
      props.onDeleted();
    } catch (err) {
      props.onError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <li className="asset-card animation-card">
      <div className="asset-thumb" aria-hidden="true">
        <span className="animation-swatch" style={{ background: `linear-gradient(135deg, ${animation.def.primary}, ${animation.def.secondary})` }} />
      </div>
      {renaming !== null ? (
        <form className="row" onSubmit={rename} aria-label={`Rename ${animation.name}`}>
          <input aria-label="Animation name" value={renaming} maxLength={MAX_ANIMATION_NAME} autoFocus onChange={(e) => setRenaming(e.target.value)} />
          <button type="submit" className="small" disabled={busy || !renaming.trim()}>Save</button>
          <button type="button" className="secondary small" onClick={() => setRenaming(null)}>Cancel</button>
        </form>
      ) : (
        <strong className="asset-name" title={animation.name}>{animation.name}</strong>
      )}
      <span className="muted asset-meta">{SHAPE_LABELS[animation.def.shape]} · {animation.def.duration}s</span>
      {confirming ? (
        <div className="confirm" role="alertdialog" aria-label={`Delete ${animation.name}?`}>
          <p>Delete “{animation.name}”? Attacks that already use it keep their copy.</p>
          <div className="row">
            <button type="button" className="secondary small" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
            <button type="button" className="small danger-fill" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Delete"}</button>
          </div>
        </div>
      ) : (
        <div className="row asset-actions">
          <button type="button" className="link" onClick={props.onEdit}>Edit</button>
          <button type="button" className="link" onClick={() => setRenaming(animation.name)}>Rename</button>
          <button type="button" className="link" onClick={props.onDuplicate}>Duplicate</button>
          <button type="button" className="link danger" onClick={() => setConfirming(true)}>Delete</button>
        </div>
      )}
    </li>
  );
}

/** A labelled slider with its value shown, for one numeric field of the definition. */
function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return (
    <label className="animation-slider">
      <span>{props.label}</span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
      <output>{props.value}</output>
    </label>
  );
}

/** New or Edit animation: every field of the definition, and a preview that plays the values as they are now. */
function AnimationEditor({ animation, onSaved, onCancel }: { animation: LibraryAnimation | null; onSaved: (animation: LibraryAnimation) => void; onCancel: () => void }) {
  const [name, setName] = useState(animation?.name ?? NEW_ANIMATION_NAME);
  const [def, setDef] = useState<AnimationDef>(animation?.def ?? ATTACK_STYLE_PRESETS.melee);
  const [previewReduced, setPreviewReduced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof AnimationDef>(key: K, value: AnimationDef[K]) => setDef((d) => ({ ...d, [key]: value }));
  const parsed = AnimationDef.safeParse(def);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the animation a name.");
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the values.");
    setSaving(true);
    try {
      const saved = animation
        ? await api.library.animations.update(animation.id, { name: trimmed, def: parsed.data })
        : await api.library.animations.create({ name: trimmed, def: parsed.data });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <form className="stack animation-editor" onSubmit={save} aria-label={animation ? `Edit ${animation.name}` : "New animation"}>
      <label>
        Name
        <input value={name} maxLength={MAX_ANIMATION_NAME} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label>
        Shape
        <select value={def.shape} onChange={(e) => set("shape", e.target.value as AnimationDef["shape"])}>
          {ANIMATION_SHAPES.map((shape) => (
            <option key={shape} value={shape}>{SHAPE_LABELS[shape]}</option>
          ))}
        </select>
      </label>
      <div className="row">
        <label>
          Primary colour
          <input type="color" value={def.primary} onChange={(e) => set("primary", e.target.value)} />
        </label>
        <label>
          Secondary colour
          <input type="color" value={def.secondary} onChange={(e) => set("secondary", e.target.value)} />
        </label>
      </div>
      <Slider label="Duration (seconds)" value={def.duration} min={0.2} max={4} step={0.1} onChange={(v) => set("duration", Math.round(v * 10) / 10)} />
      <Slider label="Size" value={def.size} min={0.5} max={3} step={0.1} onChange={(v) => set("size", Math.round(v * 10) / 10)} />
      <Slider label="Particles" value={def.particles} min={0} max={120} step={1} onChange={(v) => set("particles", v)} />
      <Slider label="Glow" value={def.glow} min={0} max={1} step={0.05} onChange={(v) => set("glow", Math.round(v * 100) / 100)} />
      <Slider label="Shake" value={def.shake} min={0} max={1} step={0.05} onChange={(v) => set("shake", Math.round(v * 100) / 100)} />
      <Slider label="Flash" value={def.flash} min={0} max={1} step={0.05} onChange={(v) => set("flash", Math.round(v * 100) / 100)} />

      <AnimationPreviewStage def={parsed.success ? parsed.data : def} reducedMotion={prefersReducedMotion() || previewReduced} />
      <label className="checkbox">
        <input type="checkbox" checked={previewReduced} onChange={(e) => setPreviewReduced(e.target.checked)} />
        Preview reduced
      </label>

      {error && <p role="alert" className="error">{error}</p>}
      <div className="row attack-editor-actions">
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}
