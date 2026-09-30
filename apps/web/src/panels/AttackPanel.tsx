import { useEffect, useRef, useState, type FormEvent } from "react";
import { Crosshair, HourglassMedium, Minus, PencilSimple, Plus, Sword, X } from "@phosphor-icons/react";
import {
  attackLabel,
  can,
  formatAttackParties,
  formatAttackRoll,
  MAX_ATTACK_LABEL,
  type AttackKind,
  type DiceRoll,
  type DiceVisibility,
  type Participant,
  type Point,
  type RoomState,
  type Verdict,
} from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { DiceTray } from "../ui/DiceTray";
import { PanelSection } from "../ui/PanelSection";
import { isBoolean, usePersistentState } from "../ui/usePersistentState";
import {
  attackExpression,
  clampCount,
  clampModifier,
  damageAmount,
  DEFAULT_ATTACK,
  DIE_SIDES,
  isPresetRecord,
  isSavedRecord,
  isSettingsRecord,
  kindOf,
  LAST_USED_KEY,
  latestAttackRoll,
  MAX_ATTACK_DICE,
  MAX_ATTACK_MODIFIER,
  MAX_PRESETS,
  migrateSaved,
  presetForRoll,
  presetRollLabel,
  shouldPingTarget,
  targetsByDistance,
  type AttackDice,
  type AttackPreset,
  type AttackSettings,
  type SavedAttack,
} from "./attackRoll";
import type { AttackReset } from "./attackSession";
import { AttackPicker } from "./AttackPicker";
import { trayRoll } from "./DicePanel";
import { RulingButtons } from "./RulingButtons";

/**
 * Who attacks whom. Held by the room page, so the board's Pick on board can fill it in and the
 * attacker can follow the turn even while this section isn't showing (attack-ux-polish).
 */
export interface AttackPick {
  /** null until chosen: then the viewer's token on the active turn, else the first. */
  attackerId: string | null;
  targetId: string | null;
}

/**
 * The Attack section of the Play tab (attack-targeting, attack-rulings, attack-ux-polish).
 * Top to bottom: who attacks, the latest roll and what the GM made of it, the target, the
 * token's named attacks (one tap rolls), and a collapsed Custom roll for anything else. It
 * rolls and says nothing about hitting: the GM decides that (README §7).
 */
export function AttackPanel({
  connection,
  state,
  you,
  pick,
  onPick,
  reset,
  onPickOnBoard,
  onShowPing,
  visibility,
  onVisibility,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  pick: AttackPick;
  onPick: (pick: AttackPick) => void;
  /** The last encounter end: the outcome card, custom settings and chosen attack start over. */
  reset: AttackReset;
  /** Put the board into targeting mode for this attacker. */
  onPickOnBoard: (attackerId: string) => void;
  /** Show a ping on this viewer's own board; the relay doesn't echo it back. */
  onShowPing: (at: Point) => void;
  /**
   * The GM's "Roll privately", held by the room page so it survives leaving the Play tab: a
   * setting that quietly reset to public could send a private attack's follow-up to players.
   */
  visibility: DiceVisibility;
  onVisibility: (visibility: DiceVisibility) => void;
}) {
  const attackers = Object.values(state.tokens)
    .filter((t) => can.attackWith(you, t))
    .sort((a, b) => a.name.localeCompare(b.name));
  const activeId = state.initiative?.order[state.initiative.activeIndex] ?? null;
  const chosen = pick.attackerId ? attackers.find((t) => t.id === pick.attackerId) : undefined;
  const attacker = chosen ?? attackers.find((t) => t.id === activeId) ?? attackers[0];
  const target = pick.targetId && pick.targetId !== attacker?.id ? state.tokens[pick.targetId] : undefined;

  // A target that vanished (deleted, or hidden from a player) or became the attacker is dropped.
  const targetStale = pick.targetId !== null && !target;
  useEffect(() => {
    if (targetStale) onPick({ ...pick, targetId: null });
  }, [targetStale, pick, onPick]);

  // Browser-local conveniences, kept here so they outlive a change of attacker.
  const [lastUsed, setLastUsed] = usePersistentState<Record<string, AttackSettings>>(LAST_USED_KEY, {}, isSettingsRecord);
  const [stored, setStored] = usePersistentState<Record<string, AttackPreset[]>>("vtt.attack.presets", {}, isPresetRecord);
  // Saved attacks from before named attacks: read to migrate, never written or deleted.
  const [legacy] = usePersistentState<Record<string, SavedAttack[]>>("vtt.attack.saved", {}, isSavedRecord);
  const [customOpen, setCustomOpen] = usePersistentState("vtt.ui.customRoll", false, isBoolean);

  // An encounter that ends while this is showing clears the custom settings kept in memory too
  // (attack-panel-encounter-reset); the room page has already cleared them in storage.
  const seenReset = useRef(reset.count);
  useEffect(() => {
    if (reset.count === seenReset.current) return;
    seenReset.current = reset.count;
    setLastUsed({});
  }, [reset.count, setLastUsed]);

  const presetsFor = (tokenId: string, all: Record<string, AttackPreset[]>) => all[tokenId] ?? migrateSaved(legacy[tokenId] ?? []);
  const allPresets: Record<string, AttackPreset[]> = { ...Object.fromEntries(Object.keys(legacy).map((id) => [id, presetsFor(id, stored)])), ...stored };

  return (
    <PanelSection
      id="attack"
      title={
        <>
          Attack
          {/* Said in the heading, so the collapsed line explains why it's quiet (attack-ux-polish). */}
          {!state.initiative && <span className="muted"> · no encounter running</span>}
        </>
      }
    >
      {!attacker ? (
        <p className="muted">
          {you.role === "gm" ? "Add a token to attack with." : "The GM has not assigned you a token yet."}
        </p>
      ) : (
        <AttackForm
          // A new attacker starts from the custom settings last used with it.
          // It also starts over when an encounter ends, dropping the chosen attack and any half-set roll.
          key={`${attacker.id}:${reset.count}`}
          connection={connection}
          state={state}
          you={you}
          attackers={attackers}
          attackerId={attacker.id}
          activeId={activeId}
          targetId={target?.id ?? null}
          clearedRollId={reset.clearedRollId}
          initial={lastUsed[attacker.id] ?? DEFAULT_ATTACK}
          presets={allPresets[attacker.id] ?? []}
          allPresets={allPresets}
          customOpen={customOpen}
          onCustomOpen={setCustomOpen}
          visibility={visibility}
          onVisibility={onVisibility}
          onAttacker={(id) => onPick({ attackerId: id, targetId: pick.targetId === id ? null : pick.targetId })}
          onTarget={(id) => onPick({ attackerId: attacker.id, targetId: id })}
          onPickOnBoard={() => onPickOnBoard(attacker.id)}
          onShowPing={onShowPing}
          onRolledCustom={(settings) => setLastUsed((all) => ({ ...all, [attacker.id]: settings }))}
          onPresets={(update) => setStored((all) => ({ ...all, [attacker.id]: update(presetsFor(attacker.id, all)).slice(0, MAX_PRESETS) }))}
        />
      )}
    </PanelSection>
  );
}

function AttackForm({
  connection,
  state,
  you,
  attackers,
  attackerId,
  activeId,
  targetId,
  clearedRollId,
  initial,
  presets,
  allPresets,
  customOpen,
  onCustomOpen,
  visibility,
  onVisibility,
  onAttacker,
  onTarget,
  onPickOnBoard,
  onShowPing,
  onRolledCustom,
  onPresets,
}: {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  attackers: RoomState["tokens"][string][];
  attackerId: string;
  activeId: string | null;
  targetId: string | null;
  clearedRollId: string | null;
  initial: AttackSettings;
  presets: AttackPreset[];
  allPresets: Record<string, AttackPreset[]>;
  customOpen: boolean;
  onCustomOpen: (open: boolean) => void;
  visibility: DiceVisibility;
  onVisibility: (visibility: DiceVisibility) => void;
  onAttacker: (id: string) => void;
  onTarget: (id: string | null) => void;
  onPickOnBoard: () => void;
  onShowPing: (at: Point) => void;
  onRolledCustom: (settings: AttackSettings) => void;
  onPresets: (update: (presets: AttackPreset[]) => AttackPreset[]) => void;
}) {
  const [settings, setSettings] = useState<AttackSettings>(initial);
  // The modifier field's own text, so "-" or an empty box can be typed on the way to "-2".
  const [modifierText, setModifierText] = useState(String(initial.modifier));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The named attack being edited: its index, "new" while adding, or null. */
  const [editing, setEditing] = useState<number | "new" | null>(null);
  /** The named attack the Roll button rolls, picked from the list (attack-panel-encounter-reset). */
  const [selected, setSelected] = useState(0);
  const isGm = you.role === "gm";
  const chosen = presets.length > 0 ? presets[Math.min(selected, presets.length - 1)] : undefined;
  const chosenIndex = chosen ? presets.indexOf(chosen) : -1;

  const attacker = state.tokens[attackerId]!;
  const targets = targetsByDistance(state, attackerId);
  const target = targets.find((t) => t.token.id === targetId);
  const expression = attackExpression(settings);
  const kind = kindOf(settings);
  const update = (changes: Partial<AttackSettings>) => {
    setSettings((s) => ({ ...s, ...changes }));
    if (changes.modifier !== undefined) setModifierText(String(changes.modifier));
    setError(null);
  };

  /** One roll with attack context, then a ping on the target if everyone may see it. */
  const send = async (roll: { expression: string; kind: AttackKind; label: string; targetId: string; visibility?: DiceVisibility }): Promise<boolean> => {
    if (busy) return false;
    const rollVisibility = roll.visibility ?? visibility;
    setBusy(true);
    const result = await connection.command({
      type: "dice.roll",
      expression: roll.expression,
      visibility: rollVisibility,
      attack: { actorTokenId: attackerId, targetTokenId: roll.targetId, kind: roll.kind, ...(roll.label && { label: roll.label }) },
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setError(null);
    // Check the target as it is now, not as it was when the roll was sent: the GM may have
    // hidden it meanwhile, and every event before the roll arrives ahead of its ack (FR-GM-23).
    // While a resync is pending the local view can lag the ack; then skip the ping entirely.
    const snapshot = connection.snapshot;
    const caughtUp = result.seq !== null && snapshot.seq >= result.seq;
    const now = snapshot.state?.tokens[roll.targetId];
    if (caughtUp && now && shouldPingTarget(now, rollVisibility)) {
      onShowPing(now.position);
      connection.ephemeral({ type: "ping", at: now.position });
    }
    return true;
  };

  /** The chosen attack's to-hit roll, or its damage when it has no to-hit (attack-ux-polish). */
  const rollPreset = (preset: AttackPreset) => {
    if (!target) return;
    const [dice, rollKind]: [AttackDice, AttackKind] = preset.toHit ? [preset.toHit, "toHit"] : [preset.damage!, "damage"];
    void send({ expression: attackExpression(dice), kind: rollKind, label: presetRollLabel(preset, rollKind), targetId: target.token.id });
  };

  const rollCustom = async (e: FormEvent) => {
    e.preventDefault();
    if (!target) return;
    const label = settings.label.trim();
    if (await send({ expression, kind, label, targetId: target.token.id })) onRolledCustom({ ...settings, label, kind });
  };

  /** After a Hit: that attack's damage in one tap, or the builder set up for it (attack-ux-polish). */
  const rollDamage = (roll: DiceRoll) => {
    const rollTarget = roll.attack?.target?.tokenId;
    const targetNow = rollTarget && state.tokens[rollTarget] ? rollTarget : null;
    if (targetNow && targetNow !== targetId) onTarget(targetNow);
    const preset = presetForRoll(allPresets, roll);
    if (preset?.damage && targetNow) {
      // Damage is as private as the attack it follows, whatever the checkbox says now.
      void send({ expression: attackExpression(preset.damage), kind: "damage", label: presetRollLabel(preset, "damage"), targetId: targetNow, visibility: roll.visibility });
      return;
    }
    update({ kind: "damage" });
    if (roll.visibility === "gm") onVisibility("gm");
    onCustomOpen(true);
  };

  const gm = async (command: Parameters<RoomConnection["command"]>[0]) => {
    setBusy(true);
    const result = await connection.command(command);
    setBusy(false);
    setError(result.ok ? null : result.message);
  };

  return (
    <div className="stack attack-panel">
      {attackers.length === 1 ? (
        <p className="attack-attacker">
          <Sword size={16} aria-hidden="true" /> <strong>{attacker.name}</strong>
          {attacker.id === activeId && <span className="badge active-badge">your turn</span>}
        </p>
      ) : (
        <label>
          Attacker
          <select value={attackerId} onChange={(e) => onAttacker(e.target.value)}>
            {attackers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.id === activeId ? " (turn)" : ""}
                {t.hidden ? " (hidden)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <LatestAttack
        state={state}
        you={you}
        attackerId={attackerId}
        clearedRollId={clearedRollId}
        allPresets={allPresets}
        busy={busy}
        onRollDamage={rollDamage}
        onRule={isGm ? (rollId, verdict) => void gm({ type: "roll.rule", rollId, verdict }) : undefined}
        onApply={isGm ? (rollId) => void gm({ type: "roll.applyDamage", rollId }) : undefined}
      />

      <div className="attack-field">
        <span className="field-label" id="attack-target-label">Target</span>
        <div className="attack-target-row">
          {target ? (
            <span className="attack-target" aria-labelledby="attack-target-label">
              <Crosshair size={16} aria-hidden="true" />
              <strong>{target.token.name}</strong>
              <span className="muted">· {target.distance}</span>
              <button type="button" className="icon-button" onClick={() => onTarget(null)} aria-label={`Clear target ${target.token.name}`} title="Clear target">
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          ) : (
            <span className="muted">None yet</span>
          )}
          <button type="button" className="secondary small" onClick={onPickOnBoard}>
            <Crosshair size={14} aria-hidden="true" /> Pick on board
          </button>
        </div>
        {targets.length === 0 ? (
          <p className="muted">No other tokens on the board.</p>
        ) : (
          <ul className="plain attack-targets" aria-label="Targets, nearest first">
            {targets.map((t) => (
              <li key={t.token.id}>
                <button type="button" className="chip" aria-pressed={t.token.id === targetId} onClick={() => onTarget(t.token.id)}>
                  {t.token.name}
                  {t.token.hidden && " (hidden)"} <span className="muted">· {t.distance}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Before the attacks, not after: a tap rolls at once, so privacy is decided first. */}
      {isGm && (
        <label className="checkbox">
          <input type="checkbox" checked={visibility === "gm"} onChange={(e) => onVisibility(e.target.checked ? "gm" : "public")} />
          Roll privately (players won't see it)
        </label>
      )}
      {isGm && visibility === "public" && (attacker.hidden || target?.token.hidden) && (
        <p className="attack-warning" role="note">
          {attacker.hidden ? `${attacker.name} is hidden.` : `${target!.token.name} is hidden.`} Players will see this roll with the hidden token as Unknown, but they will see the attack's name.
        </p>
      )}

      <div className="attack-field">
        <span className="field-label">Attacks</span>
        {presets.length === 0 && editing === null && (
          <p className="muted small-print">Add the attacks {attacker.name} makes, like a sword, a spell or claws. Saved in this browser.</p>
        )}
        {/* One row however many attacks a token has (attack-panel-encounter-reset). */}
        {chosen && typeof editing === "number" ? (
          <PresetEditor
            initial={chosen}
            taken={presets.filter((_, j) => j !== chosenIndex).map((p) => p.name)}
            onSave={(next) => {
              onPresets((list) => list.map((p, j) => (j === chosenIndex ? next : p)));
              setEditing(null);
            }}
            onRemove={() => {
              onPresets((list) => list.filter((_, j) => j !== chosenIndex));
              setSelected(0);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          chosen && (
            <div className="attack-preset">
              <AttackPicker presets={presets} selected={chosenIndex} onSelect={setSelected} label={`${attacker.name}'s attack`} disabled={editing !== null} />
              <button
                type="button"
                className="icon-button"
                disabled={editing !== null}
                onClick={() => setEditing(chosenIndex)}
                aria-label={`Edit ${chosen.name}`}
                title="Edit"
              >
                <PencilSimple size={14} aria-hidden="true" />
              </button>
            </div>
          )
        )}
        {chosen && (
          <button type="button" className="attack-roll" disabled={!target || busy || editing !== null} onClick={() => rollPreset(chosen)}>
            <Sword size={16} aria-hidden="true" />
            {busy
              ? "Rolling…"
              : !target
                ? "Choose a target to roll"
                : chosen.toHit
                  ? `Roll ${chosen.name} to hit ${target.token.name}`
                  : `Roll ${chosen.name} damage to ${target.token.name}`}
          </button>
        )}
        {editing === "new" ? (
          <PresetEditor
            initial={null}
            taken={presets.map((p) => p.name)}
            onSave={(next) => {
              onPresets((list) => [...list, next]);
              // A new attack is usually the one about to be used.
              setSelected(presets.length);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <button
            type="button"
            className="secondary small attack-add"
            disabled={presets.length >= MAX_PRESETS || editing !== null}
            title={presets.length >= MAX_PRESETS ? `At most ${MAX_PRESETS} per token; remove one first` : undefined}
            onClick={() => setEditing("new")}
          >
            <Plus size={14} aria-hidden="true" /> Add attack
          </button>
        )}
      </div>

      <details className="attack-custom" open={customOpen} onToggle={(e) => onCustomOpen(e.currentTarget.open)}>
        <summary>Custom roll</summary>
        <form className="stack" onSubmit={rollCustom}>
          <div className="attack-field">
            <span className="field-label" id="attack-kind-label">Roll type</span>
            <div className="attack-kind" role="group" aria-labelledby="attack-kind-label">
              <button type="button" className="chip" aria-pressed={kind === "toHit"} onClick={() => update({ kind: "toHit" })}>
                To hit
              </button>
              <button type="button" className="chip" aria-pressed={kind === "damage"} onClick={() => update({ kind: "damage" })}>
                Damage
              </button>
            </div>
          </div>

          <fieldset className="attack-dice">
            <legend className="field-label">Dice</legend>
            <div className="attack-die-types" role="group" aria-label="Die type">
              {DIE_SIDES.map((sides) => (
                <button key={sides} type="button" className="chip" aria-pressed={settings.sides === sides} onClick={() => update({ sides })}>
                  d{sides}
                </button>
              ))}
            </div>
            <div className="attack-dice-row">
              <span className="attack-stepper" role="group" aria-label="Number of dice">
                <button type="button" className="icon-button" onClick={() => update({ count: clampCount(settings.count - 1) })} disabled={settings.count <= 1} aria-label="One die fewer">
                  <Minus size={12} aria-hidden="true" />
                </button>
                <output aria-live="polite">{settings.count}</output>
                <button type="button" className="icon-button" onClick={() => update({ count: clampCount(settings.count + 1) })} disabled={settings.count >= MAX_ATTACK_DICE} aria-label="One die more">
                  <Plus size={12} aria-hidden="true" />
                </button>
              </span>
              <span className="muted">d{settings.sides}</span>
              <label className="attack-modifier">
                <span className="muted">+</span>
                <span className="sr-only">Modifier</span>
                <input
                  type="number"
                  value={modifierText}
                  min={-MAX_ATTACK_MODIFIER}
                  max={MAX_ATTACK_MODIFIER}
                  step={1}
                  onChange={(e) => {
                    setModifierText(e.target.value);
                    setSettings((s) => ({ ...s, modifier: clampModifier(Number(e.target.value)) }));
                    setError(null);
                  }}
                  onBlur={() => setModifierText(String(settings.modifier))}
                />
              </label>
            </div>
          </fieldset>

          <label>
            Label
            <input value={settings.label} onChange={(e) => update({ label: e.target.value })} maxLength={MAX_ATTACK_LABEL} placeholder="Optional" />
          </label>

          <button type="submit" className="attack-roll" disabled={busy || !target}>
            <Sword size={16} aria-hidden="true" />
            {busy
              ? "Rolling…"
              : !target
                ? "Choose a target to roll"
                : kind === "damage"
                  ? `Roll ${expression} damage to ${target.token.name}`
                  : `Roll ${expression} to hit ${target.token.name}`}
          </button>
        </form>
      </details>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}

/** Add or change one named attack: a name, and a to-hit roll, a damage roll, or both. */
function PresetEditor({
  initial,
  taken,
  onSave,
  onRemove,
  onCancel,
}: {
  initial: AttackPreset | null;
  /** Names this token's other attacks already use. */
  taken: string[];
  onSave: (preset: AttackPreset) => void;
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [toHit, setToHit] = useState<AttackDice | null>(initial ? initial.toHit : { count: 1, sides: 20, modifier: 0 });
  const [damage, setDamage] = useState<AttackDice | null>(initial ? initial.damage : { count: 1, sides: 6, modifier: 0 });
  const [error, setError] = useState<string | null>(null);

  const save = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the attack a name.");
    if (taken.some((n) => n.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) return setError(`There is already an attack called ${trimmed}.`);
    if (!toHit && !damage) return setError("An attack needs a to-hit roll, a damage roll, or both.");
    onSave({ name: trimmed, toHit, damage });
  };

  return (
    <form className="stack attack-editor" onSubmit={save} aria-label={initial ? `Edit ${initial.name}` : "Add attack"}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_ATTACK_LABEL} placeholder="Longsword, Fire Bolt, Claws…" autoFocus />
      </label>
      <DiceField label="To hit" value={toHit} fallback={{ count: 1, sides: 20, modifier: 0 }} onChange={setToHit} />
      <DiceField label="Damage" value={damage} fallback={{ count: 1, sides: 6, modifier: 0 }} onChange={setDamage} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="row attack-editor-actions">
        {onRemove && (
          <button type="button" className="secondary" onClick={onRemove}>
            Remove
          </button>
        )}
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit">Save</button>
      </div>
    </form>
  );
}

/** An optional roll in the editor: a checkbox to include it, then count, die and modifier. */
function DiceField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: AttackDice | null;
  fallback: AttackDice;
  onChange: (dice: AttackDice | null) => void;
}) {
  const [modifierText, setModifierText] = useState(String(value?.modifier ?? fallback.modifier));
  const dice = value ?? fallback;
  const set = (changes: Partial<AttackDice>) => onChange({ ...dice, ...changes });
  return (
    <fieldset className="attack-dice-field">
      <legend className="sr-only">{label}</legend>
      <label className="checkbox">
        <input type="checkbox" checked={value !== null} onChange={(e) => onChange(e.target.checked ? dice : null)} />
        {label}
      </label>
      {value && (
        <span className="attack-dice-inputs">
          <input
            type="number"
            aria-label={`${label}: number of dice`}
            value={dice.count}
            min={1}
            max={MAX_ATTACK_DICE}
            onChange={(e) => set({ count: clampCount(Number(e.target.value)) })}
          />
          <select aria-label={`${label}: die`} value={dice.sides} onChange={(e) => set({ sides: Number(e.target.value) })}>
            {DIE_SIDES.map((s) => (
              <option key={s} value={s}>
                d{s}
              </option>
            ))}
          </select>
          <span className="muted">+</span>
          <input
            type="number"
            aria-label={`${label}: modifier`}
            value={modifierText}
            min={-MAX_ATTACK_MODIFIER}
            max={MAX_ATTACK_MODIFIER}
            onChange={(e) => {
              setModifierText(e.target.value);
              set({ modifier: clampModifier(Number(e.target.value)) });
            }}
            onBlur={() => setModifierText(String(dice.modifier))}
          />
          <span className="muted attack-dice-preview">{attackExpression(dice)}</span>
        </span>
      )}
    </fieldset>
  );
}

/**
 * The viewer's latest attack roll, at the top of the section: thrown in the tray, then its line
 * once the dice land, with what the GM has made of it so far (ADR 0011). After a Hit, Roll damage;
 * for the GM, the ruling controls on their own roll. The GM decides; this only shows it.
 */
function LatestAttack({
  state,
  you,
  attackerId,
  clearedRollId,
  allPresets,
  busy,
  onRollDamage,
  onRule,
  onApply,
}: {
  state: RoomState;
  you: Participant;
  attackerId: string;
  clearedRollId: string | null;
  allPresets: Record<string, AttackPreset[]>;
  busy: boolean;
  onRollDamage: (roll: DiceRoll) => void;
  /** GM only: rule on their own to-hit roll. */
  onRule?: (rollId: string, verdict: Verdict) => void;
  /** GM only: apply their own damage roll. */
  onApply?: (rollId: string) => void;
}) {
  const latest = latestAttackRoll(state.rolls, you.id, clearedRollId);
  const [landed, setLanded] = useState<string | undefined>(latest?.id);
  if (!latest?.attack) return null;
  const throwing = latest.id !== landed;
  const attack = latest.attack;
  const target = attack.target ? state.tokens[attack.target.tokenId] : undefined;
  const waiting = !throwing && attack.kind === "toHit" && !latest.verdict;
  const canFollowUp = !throwing && latest.verdict === "hit" && attack.actor?.tokenId === attackerId;
  const preset = canFollowUp ? presetForRoll(allPresets, latest) : null;
  const label = attackLabel(attack);
  const description = `${formatAttackParties(attack)}${label ? ` · ${label}` : ""}, ${latest.total}`;
  // The GM's own roll gets the same controls as the Rulings list.
  const gmToHit = onRule && waiting;
  const gmDamage = onApply && !throwing && attack.kind === "damage" && !latest.damageApplied && target && target.stats.hp !== null;

  return (
    <div className="attack-latest" aria-live="polite">
      <DiceTray key={latest.id} roll={trayRoll(latest)} throwing={throwing} onLanded={() => setLanded(latest.id)} />
      <p className={latest.visibility === "gm" ? "attack-result private" : "attack-result"}>
        {throwing ? "Rolling…" : formatAttackRoll(latest)}
        {latest.visibility === "gm" && <em className="badge">GM only</em>}
      </p>
      {gmToHit ? (
        <RulingButtons item={{ kind: "toHit" }} description={description} busy={busy} onRule={(v) => onRule(latest.id, v)} onApply={() => {}} />
      ) : gmDamage ? (
        <RulingButtons item={{ kind: "damage", amount: damageAmount(latest) }} description={description} busy={busy} onRule={() => {}} onApply={() => onApply(latest.id)} />
      ) : (
        waiting && (
          <p className="muted attack-waiting">
            <HourglassMedium size={14} aria-hidden="true" /> Waiting for the GM
          </p>
        )
      )}
      {canFollowUp && (
        <button type="button" className="attack-follow-up" disabled={busy} onClick={() => onRollDamage(latest)}>
          <Sword size={14} aria-hidden="true" />
          {preset?.damage ? `Roll damage ${attackExpression(preset.damage)}` : "Roll damage"}
        </button>
      )}
    </div>
  );
}
