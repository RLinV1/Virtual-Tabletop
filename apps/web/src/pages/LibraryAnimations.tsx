import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { ANIMATION_SHAPES, AnimationDef, MAX_ANIMATION_NAME, PARTICLE_SHAPES, type LibraryAnimation, type ParticleShape } from "@vtt/shared";
import { BUILTIN_ANIMATIONS, SHAPE_DEFAULTS, withDefaults } from "../board/effectPresets";
import { prefersReducedMotion } from "../board/effects";
import { api } from "../net/api";
import { AnimationPreviewStage } from "../ui/AnimationPreviewStage";
import { Modal } from "../ui/Modal";

/** What the Animations tab shows for a shape. */
const SHAPE_LABELS: Record<AnimationDef["shape"], string> = {
  slash: "Slash (melee)",
  claw: "Claw rake (melee)",
  whirlwind: "Whirlwind (melee)",
  slam: "Ground slam (melee)",
  shadow: "Shadow strike (melee)",
  projectile: "Projectile (ranged)",
  volley: "Arrow volley (ranged)",
  dagger: "Thrown daggers (ranged)",
  fireball: "Fireball (ranged)",
  meteor: "Meteor (falls on target)",
  explosion: "Explosion (delayed blast)",
  bolt: "Bolt (magic)",
  chain: "Chain lightning (magic)",
  beam: "Beam (magic)",
  frost: "Frost spikes (magic)",
  poison: "Poison cloud (magic)",
  smite: "Smite (pillar of light)",
  sonic: "Sonic wave (cone)",
  tornado: "Tornado (travels to target)",
  nuke: "Nuke (map blast)",
};

const PARTICLE_LABELS: Record<ParticleShape, string> = { spark: "Spark", star: "Star", square: "Square", shard: "Shard", ring: "Ring" };

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
function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** How the value reads beside the label: "1.3 s", "×1.5", "72%". */
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  // The filled part of the track, as a share of the range.
  const fill = ((props.value - props.min) / (props.max - props.min)) * 100;
  return (
    <label className="animation-slider" style={{ "--fill": `${fill}%` } as CSSProperties}>
      <span className="animation-slider-label">{props.label}</span>
      <output className="animation-slider-value">{props.format(props.value)}</output>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
    </label>
  );
}

const seconds = (v: number) => `${v.toFixed(1)} s`;
const times = (v: number) => `×${v.toFixed(1)}`;
const count = (v: number) => `${v}`;
const percent = (v: number) => `${Math.round(v * 100)}%`;
const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** New or Edit animation: every field of the definition, and a preview that plays the values as they are now. */
function AnimationEditor({ animation, onSaved, onCancel }: { animation: LibraryAnimation | null; onSaved: (animation: LibraryAnimation) => void; onCancel: () => void }) {
  const [name, setName] = useState(animation?.name ?? NEW_ANIMATION_NAME);
  const [def, setDef] = useState<AnimationDef>(animation?.def ?? SHAPE_DEFAULTS.slash);
  const [previewReduced, setPreviewReduced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof AnimationDef>(key: K, value: AnimationDef[K]) => setDef((d) => ({ ...d, [key]: value }));
  const parsed = AnimationDef.safeParse(def);
  // What the form shows: the stored fields, with the shape's defaults for any the definition leaves out.
  const v = withDefaults(def);
  const loadDefaults = (shape: AnimationDef["shape"]) => setDef(SHAPE_DEFAULTS[shape]);

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
        <select value={def.shape} onChange={(e) => loadDefaults(e.target.value as AnimationDef["shape"])}>
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
        <label>
          Accent colour
          <input type="color" value={def.accent ?? SHAPE_DEFAULTS[def.shape].accent} disabled={def.accent === undefined} onChange={(e) => set("accent", e.target.value)} />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={def.accent !== undefined}
            onChange={(e) => set("accent", e.target.checked ? SHAPE_DEFAULTS[def.shape].accent : undefined)}
          />
          Use accent
        </label>
        <label>
          Particle look
          <select value={v.particleShape} onChange={(e) => set("particleShape", e.target.value as ParticleShape)}>
            {PARTICLE_SHAPES.map((look) => (
              <option key={look} value={look}>{PARTICLE_LABELS[look]}</option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary small" onClick={() => loadDefaults(def.shape)}>Reset to shape default</button>
      </div>
      <div className="animation-sliders">
        <fieldset>
          <legend>Timing and size</legend>
          <Slider label="Duration" value={def.duration} min={0.2} max={4} step={0.1} format={seconds} onChange={(v) => set("duration", Math.round(v * 10) / 10)} />
          <Slider label="Size" value={def.size} min={0.5} max={3} step={0.1} format={times} onChange={(v) => set("size", Math.round(v * 10) / 10)} />
          <Slider label="Particles" value={def.particles} min={0} max={120} step={1} format={count} onChange={(v) => set("particles", v)} />
        </fieldset>
        <fieldset>
          <legend>Intensity</legend>
          <Slider label="Glow" value={def.glow} min={0} max={1} step={0.05} format={percent} onChange={(v) => set("glow", Math.round(v * 100) / 100)} />
          <Slider label="Shake" value={def.shake} min={0} max={1} step={0.05} format={percent} onChange={(v) => set("shake", Math.round(v * 100) / 100)} />
          <Slider label="Flash" value={def.flash} min={0} max={1} step={0.05} format={percent} onChange={(v) => set("flash", Math.round(v * 100) / 100)} />
        </fieldset>
        <fieldset>
          <legend>Motion</legend>
          <Slider label="Count" value={v.count} min={1} max={12} step={1} format={count} onChange={(n) => set("count", n)} />
          <Slider label="Spread" value={v.spread} min={0} max={1} step={0.05} format={percent} onChange={(n) => set("spread", round2(n))} />
          <Slider label="Arc" value={v.arc} min={0} max={1} step={0.05} format={percent} onChange={(n) => set("arc", round2(n))} />
          <Slider label="Trail" value={v.trail} min={0} max={1} step={0.05} format={percent} onChange={(n) => set("trail", round2(n))} />
          <Slider label="Spin" value={v.spin} min={0} max={1} step={0.05} format={percent} onChange={(n) => set("spin", round2(n))} />
          <Slider label="Gravity" value={v.gravity} min={-1} max={1} step={0.05} format={signed} onChange={(n) => set("gravity", round2(n))} />
          <Slider label="Rings" value={v.rings} min={0} max={5} step={1} format={count} onChange={(n) => set("rings", n)} />
        </fieldset>
      </div>

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
