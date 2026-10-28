import { useEffect, useState, type FormEvent } from "react";
import { X } from "@phosphor-icons/react";
import {
  areaEffectStage,
  conditionSpec,
  halfDamage,
  isActive,
  MAX_AREA_AMOUNT,
  MAX_ATTACK_LABEL,
  parseDiceExpression,
  presetOf,
  rolledDamageFor,
  type AreaEffect,
  type CommandInput,
  type ConditionId,
  type DamageMode,
  type Participant,
  type RoomState,
} from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { PanelSection, useSectionCollapse } from "../ui/PanelSection";
import { defaultCaller } from "./attackRoll";
import { GroupSelectionList, type GroupSelection } from "./GroupSelection";

/** The section's collapse key, also how the Rulings list finds it. */
export const AREA_EFFECT_SECTION = "area-effect";

/** Open the Area Effect section and bring it into view, e.g. from its Rulings row. */
export function useGoToAreaEffect() {
  const sections = useSectionCollapse();
  return () => {
    sections.setCollapsed(AREA_EFFECT_SECTION, false);
    // After the body is shown, so the browser can scroll to and focus what is in it.
    requestAnimationFrame(() => {
      const section = document.querySelector<HTMLElement>(`[data-tour="${AREA_EFFECT_SECTION}"]`);
      section?.scrollIntoView({ block: "start", behavior: "smooth" });
      section?.querySelector<HTMLElement>("[data-area-effect-focus]")?.focus();
    });
  };
}

/** A participant's name, saying so when they have left. */
function callerName(state: RoomState, participantId: string): string {
  const p = state.participants[participantId];
  if (!p) return "Someone";
  return isActive(p) ? p.displayName : `${p.displayName} (left the table)`;
}

const effectTitle = (effect: Pick<AreaEffect, "label">) => effect.label ?? "Area effect";

/** Sends one command at a time and keeps the server's refusal to show. */
function useSender(connection: RoomConnection) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (command: CommandInput) => {
    setBusy(true);
    const result = await connection.command(command);
    setBusy(false);
    setError(result.ok ? null : result.message);
    return result.ok;
  };
  return { busy, error, setError, send };
}

/**
 * The GM's Area Effect (ADR 0044): roll a formula for every selected token, call someone to roll
 * the damage (themselves included), then resolve each token's outcome as one undoable action.
 * Every step after the first can be skipped. The saves are advisory: nothing here decides.
 */
export function AreaEffectPanel({ connection, state, you, selection }: { connection: RoomConnection; state: RoomState; you: Participant; selection: GroupSelection }) {
  const effect = state.areaEffect ?? null;
  return (
    <PanelSection id={AREA_EFFECT_SECTION} title={effect ? `Area Effect · ${effectTitle(effect)}` : "Area Effect"}>
      {effect ? (
        <OpenEffect key={effect.id} connection={connection} state={state} you={you} effect={effect} />
      ) : (
        <StartForm connection={connection} state={state} selection={selection} />
      )}
    </PanelSection>
  );
}

function StartForm({ connection, state, selection }: { connection: RoomConnection; state: RoomState; selection: GroupSelection }) {
  const [expression, setExpression] = useState("1d20");
  const [label, setLabel] = useState("");
  const { busy, error, setError, send } = useSender(connection);
  const parsed = parseDiceExpression(expression);
  const tokenIds = selection.tokenIds.filter((id) => state.tokens[id]);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.ok) return setError(parsed.message);
    if (await send({ type: "areaEffect.start", tokenIds, expression, label: label.trim() || undefined })) selection.clear();
  };

  return (
    <form onSubmit={start} className="stack">
      <GroupSelectionList selection={selection} state={state} idPrefix="area-effect" />
      <label htmlFor="area-effect-label">Label</label>
      <input id="area-effect-label" value={label} maxLength={MAX_ATTACK_LABEL} onChange={(e) => setLabel(e.target.value)} placeholder="Fireball" autoComplete="off" data-area-effect-focus />
      <label htmlFor="area-effect-expression">Roll for each token</label>
      <div className="dice-row">
        <input id="area-effect-expression" value={expression} onChange={(e) => { setExpression(e.target.value); setError(null); }} placeholder="1d20+2" autoComplete="off" aria-invalid={expression.trim() !== "" && !parsed.ok} />
        <button type="submit" disabled={busy || tokenIds.length === 0 || !parsed.ok} title={tokenIds.length === 0 ? "Select tokens first" : undefined}>
          Start
        </button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}

function OpenEffect({ connection, state, you, effect }: { connection: RoomConnection; state: RoomState; you: Participant; effect: AreaEffect }) {
  const stage = areaEffectStage(effect);
  /** The GM chose to resolve without calling for damage. */
  const [resolving, setResolving] = useState(false);
  const { busy, error, send } = useSender(connection);
  const skip = () => void send({ type: "areaEffect.close", effectId: effect.id });

  return (
    <div className="stack area-effect">
      <TargetList state={state} effect={effect} />
      {effect.damage && <DamageSummary state={state} effect={effect} />}

      {stage === "started" && !resolving && (
        <>
          <CallForm connection={connection} state={state} you={you} effect={effect} label="Call" />
          <div className="row">
            <button type="button" className="secondary" disabled={busy} onClick={() => setResolving(true)}>Resolve without damage roll</button>
            <button type="button" className="secondary" disabled={busy} onClick={skip}>Skip</button>
          </div>
        </>
      )}

      {stage === "called" && effect.call && (
        effect.call.participantId === you.id ? (
          <>
            <DamageRollForm connection={connection} effect={effect} visibleTargets={effect.targets.length} />
            <CallForm connection={connection} state={state} you={you} effect={effect} label="Reassign" />
            <button type="button" className="secondary" disabled={busy} onClick={skip}>Skip</button>
          </>
        ) : (
          <>
            <p className="area-effect-waiting" role="status">Waiting on {callerName(state, effect.call.participantId)} to roll damage.</p>
            <CallForm connection={connection} state={state} you={you} effect={effect} label="Reassign" />
            <div className="row">
              <button type="button" disabled={busy} onClick={() => void send({ type: "areaEffect.call", effectId: effect.id, participantId: you.id })}>Take over</button>
              <button type="button" className="secondary" disabled={busy} onClick={skip}>Skip</button>
            </div>
          </>
        )
      )}

      {(stage === "rolled" || (stage === "started" && resolving)) && (
        <ResolveForm connection={connection} state={state} effect={effect} onSkip={skip} onBack={stage === "started" ? () => setResolving(false) : undefined} />
      )}
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

/** Each target with its advisory save and current HP; the GM's alone. */
function TargetList({ state, effect }: { state: RoomState; effect: AreaEffect }) {
  return (
    <ul className="plain area-effect-targets" aria-label="Targets">
      {effect.targets.map((t) => {
        const token = state.tokens[t.tokenId];
        return (
          <li key={t.tokenId} className={token ? undefined : "muted"}>
            <span>{t.name}</span>
            {t.roll && <span> · {effect.expression} <strong>{t.roll.total}</strong></span>}
            {!token ? <em className="badge">gone</em> : token.stats.hp !== null && <span className="muted"> · {token.stats.hp}{token.stats.maxHp !== null ? `/${token.stats.maxHp}` : ""} HP</span>}
          </li>
        );
      })}
    </ul>
  );
}

function DamageSummary({ state, effect }: { state: RoomState; effect: AreaEffect }) {
  const damage = effect.damage!;
  const who = state.participants[damage.byParticipantId]?.displayName ?? "Someone";
  return (
    <p className="area-effect-damage" role="status">
      {who} rolled {damage.expression} damage
      {damage.mode === "single" ? <>: <strong>{damage.total}</strong></> : " for each target"}
    </p>
  );
}

/** Choose who rolls the damage: pre-filled with the active token's owner, else the GM (ADR 0044). */
function CallForm({ connection, state, you, effect, label }: { connection: RoomConnection; state: RoomState; you: Participant; effect: AreaEffect; label: "Call" | "Reassign" }) {
  const current = effect.call?.participantId ?? null;
  const candidates = Object.values(state.participants).filter((p) => isActive(p) && p.id !== current);
  const preferred = defaultCaller(state, you.id);
  const [choice, setChoice] = useState(candidates.some((p) => p.id === preferred) ? preferred : candidates[0]?.id ?? you.id);
  const { busy, error, send } = useSender(connection);
  // The one just called drops out of the list; fall back to whoever is first.
  const selected = candidates.some((p) => p.id === choice) ? choice : candidates[0]?.id ?? "";
  const id = `area-effect-${label.toLowerCase()}`;
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (selected) void send({ type: "areaEffect.call", effectId: effect.id, participantId: selected });
      }}
    >
      <label htmlFor={id}>{label === "Call" ? "Who rolls the damage" : "Give the call to"}</label>
      <div className="dice-row">
        <select id={id} value={selected} onChange={(e) => setChoice(e.target.value)} data-area-effect-focus>
          {candidates.map((p) => (
            <option key={p.id} value={p.id}>{p.id === you.id ? `${p.displayName} (you)` : p.displayName}</option>
          ))}
        </select>
        <button type="submit" disabled={busy || !selected}>{label}</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}

/** Whoever holds the call writes the formula and picks one roll or one per target (ADR 0044). */
function DamageRollForm({ connection, effect, visibleTargets }: { connection: RoomConnection; effect: AreaEffect; visibleTargets: number }) {
  const [expression, setExpression] = useState("");
  const [mode, setMode] = useState<DamageMode>("single");
  const { busy, error, setError, send } = useSender(connection);
  const parsed = parseDiceExpression(expression);
  const roll = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.ok) return setError(parsed.message);
    void send({ type: "areaEffect.rollDamage", effectId: effect.id, expression, mode });
  };
  const name = `damage-mode-${effect.id}`;
  return (
    <form onSubmit={roll} className="stack damage-roll-form">
      <label htmlFor={`damage-expression-${effect.id}`}>Damage for {visibleTargets} {visibleTargets === 1 ? "target" : "targets"}</label>
      <div className="dice-row">
        <input
          id={`damage-expression-${effect.id}`}
          value={expression}
          onChange={(e) => { setExpression(e.target.value); setError(null); }}
          placeholder="8d6"
          autoComplete="off"
          aria-invalid={expression.trim() !== "" && !parsed.ok}
          data-area-effect-focus
        />
        <button type="submit" disabled={busy || !parsed.ok}>Roll</button>
      </div>
      <fieldset className="damage-mode">
        <legend className="sr-only">How to roll</legend>
        <label className="checkbox">
          <input type="radio" name={name} checked={mode === "single"} onChange={() => setMode("single")} />
          One roll for all
        </label>
        <label className="checkbox">
          <input type="radio" name={name} checked={mode === "perTarget"} onChange={() => setMode("perTarget")} />
          One roll per target
        </label>
      </fieldset>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}

/**
 * A player's damage call (ADR 0044), in their Play tab while they hold it. They see only the
 * targets the server let them see.
 */
export function DamageCallPrompt({ connection, state, you }: { connection: RoomConnection; state: RoomState; you: Participant }) {
  const effect = state.areaEffect ?? null;
  if (!effect || effect.call?.participantId !== you.id || areaEffectStage(effect) !== "called") return null;
  return (
    <PanelSection id="damage-call" title={`Roll damage · ${effectTitle(effect)}`}>
      <div className="stack">
        <p>The GM asked you to roll damage for {effectTitle(effect)}.</p>
        {effect.targets.length > 0 && (
          <ul className="plain area-effect-targets" aria-label="Targets you can see">
            {effect.targets.map((t) => <li key={t.tokenId}>{t.name}</li>)}
          </ul>
        )}
        <DamageRollForm connection={connection} effect={effect} visibleTargets={effect.targets.length} />
      </div>
    </PanelSection>
  );
}

/** Each target's amount and added conditions, applied together by Confirm (ADR 0044). */
function ResolveForm({ connection, state, effect, onSkip, onBack }: { connection: RoomConnection; state: RoomState; effect: AreaEffect; onSkip: () => void; onBack?: () => void }) {
  const preset = presetOf(state);
  const conditionsOn = preset.features.conditions;
  const targets = effect.targets.filter((t) => state.tokens[t.tokenId]);
  const rolled = (tokenId: string) => rolledDamageFor(effect, tokenId) ?? 0;
  const [amounts, setAmounts] = useState<Record<string, string>>(() => Object.fromEntries(targets.map((t) => [t.tokenId, String(rolled(t.tokenId))])));
  const [forAll, setForAll] = useState<ConditionId[]>([]);
  const [perRow, setPerRow] = useState<Record<string, ConditionId[]>>({});
  const { busy, error, setError, send } = useSender(connection);
  // A damage roll arriving after the form opened fills in the amounts it has not been given.
  useEffect(() => {
    setAmounts((now) => Object.fromEntries(targets.map((t) => [t.tokenId, now[t.tokenId] ?? String(rolled(t.tokenId))])));
  }, [effect.damage]);

  const parse = (text: string): number | null => {
    if (!/^\s*-?\d+\s*$/.test(text)) return null;
    const n = Number(text);
    return Math.abs(n) <= MAX_AREA_AMOUNT ? n : null;
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    const rows = [];
    for (const t of targets) {
      const token = state.tokens[t.tokenId]!;
      let amount: number | null = null;
      if (token.stats.hp !== null) {
        amount = parse(amounts[t.tokenId] ?? "0");
        if (amount === null) return setError(`${t.name}'s amount must be a whole number from -${MAX_AREA_AMOUNT} to ${MAX_AREA_AMOUNT}`);
      }
      const addConditions = [...new Set([...forAll, ...(perRow[t.tokenId] ?? [])])];
      rows.push({ tokenId: t.tokenId, amount, addConditions });
    }
    await send({ type: "areaEffect.resolve", effectId: effect.id, rows });
  };

  return (
    <form onSubmit={confirm} className="stack area-effect-resolve" aria-label="Resolve">
      {conditionsOn && (
        <ConditionAdder label="Conditions for all targets" options={preset.conditions} chosen={forAll} onChange={setForAll} id={`all-${effect.id}`} />
      )}
      <ul className="plain area-effect-rows">
        {targets.map((t) => {
          const token = state.tokens[t.tokenId]!;
          const fieldId = `amount-${effect.id}-${t.tokenId}`;
          return (
            <li key={t.tokenId} className="area-effect-row">
              <span className="area-effect-row-name">
                {t.name}
                {t.roll && <span className="muted"> · save {t.roll.total}</span>}
                {token.stats.hp !== null && <span className="muted"> · {token.stats.hp} HP</span>}
              </span>
              {token.stats.hp === null ? (
                <span className="muted">No HP</span>
              ) : (
                <span className="area-effect-amount">
                  <label htmlFor={fieldId} className="sr-only">Amount for {t.name} (negative heals)</label>
                  <input
                    id={fieldId}
                    inputMode="numeric"
                    value={amounts[t.tokenId] ?? ""}
                    onChange={(e) => setAmounts((now) => ({ ...now, [t.tokenId]: e.target.value }))}
                    aria-invalid={parse(amounts[t.tokenId] ?? "") === null}
                    data-area-effect-focus
                  />
                  <button type="button" className="secondary small" onClick={() => setAmounts((now) => ({ ...now, [t.tokenId]: String(halfDamage(rolled(t.tokenId))) }))}>Half</button>
                  <button type="button" className="secondary small" onClick={() => setAmounts((now) => ({ ...now, [t.tokenId]: "0" }))}>None</button>
                </span>
              )}
              {conditionsOn && (
                <ConditionAdder
                  label={`Conditions for ${t.name}`}
                  options={preset.conditions.filter((c) => !forAll.includes(c))}
                  chosen={perRow[t.tokenId] ?? []}
                  onChange={(next) => setPerRow((now) => ({ ...now, [t.tokenId]: next }))}
                  id={`${effect.id}-${t.tokenId}`}
                  compact
                />
              )}
            </li>
          );
        })}
      </ul>
      <p className="muted small-print">A negative amount heals, up to the token's max HP.</p>
      <div className="row">
        <button type="submit" disabled={busy}>Confirm</button>
        {onBack && <button type="button" className="secondary" disabled={busy} onClick={onBack}>Back</button>}
        <button type="button" className="secondary" disabled={busy} onClick={onSkip}>Skip</button>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
    </form>
  );
}

/** Pick conditions to add; never removes one a token already has (ADR 0044). */
function ConditionAdder({ label, options, chosen, onChange, id, compact = false }: {
  label: string;
  options: readonly ConditionId[];
  chosen: readonly ConditionId[];
  onChange: (next: ConditionId[]) => void;
  id: string;
  compact?: boolean;
}) {
  const left = options.filter((c) => !chosen.includes(c));
  const selectId = `conditions-${id}`;
  return (
    <div className={compact ? "condition-adder compact" : "condition-adder"}>
      <label htmlFor={selectId} className={compact ? "sr-only" : undefined}>{label}</label>
      <div className="condition-adder-row">
        {chosen.map((c) => (
          <span key={c} className="chip">
            {conditionSpec(c).label}
            <button type="button" className="icon-button" aria-label={`Don't add ${conditionSpec(c).label}`} onClick={() => onChange(chosen.filter((x) => x !== c))}>
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        {left.length > 0 && (
          <select
            id={selectId}
            value=""
            onChange={(e) => {
              if (e.target.value) onChange([...chosen, e.target.value as ConditionId]);
            }}
          >
            <option value="">+ Condition</option>
            {left.map((c) => <option key={c} value={c}>{conditionSpec(c).label}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}
