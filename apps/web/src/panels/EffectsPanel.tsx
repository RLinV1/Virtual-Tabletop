import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_NUKE_DAMAGE, presetOf, type LibraryAnimation, type Point, type RoomState } from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { DEFAULT_BOARD_SIZE } from "../board/gridRenderLimit";
import { api } from "../net/api";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "../ui/Modal";
import { PanelSection } from "../ui/PanelSection";

/** The persisted map origin. Each viewer renders the blast at their own screen centre. */
export function mapCentre(state: Pick<RoomState, "scene">): Point {
  const size = state.scene.map ?? DEFAULT_BOARD_SIZE;
  return { x: Math.round(size.width / 2), y: Math.round(size.height / 2) };
}

/** Value of the animation select for the built-in blast. */
const BUILTIN = "builtin";

/**
 * The GM's table effects (ADR 0038): the table-wide Reduced animations switch, and the map nuke.
 * The nuke damages every token with HP, so it asks for confirmation first; the server decides
 * everything else, and players never get this section. Undo is in the activity log.
 */
export function EffectsPanel({
  connection,
  state,
}: {
  connection: RoomConnection;
  state: RoomState;
}) {
  const nukeAllowed = presetOf(state).features.attacks;
  const signedIn = useAccount().status === "signedIn";
  const [library, setLibrary] = useState<LibraryAnimation[]>([]);
  const [amount, setAmount] = useState("10");
  const [animationId, setAnimationId] = useState(BUILTIN);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // The GM's own nuke animations, when signed in; the built-in is always there.
  useEffect(() => {
    if (!signedIn || !nukeAllowed) return;
    let current = true;
    api.library.animations.list().then(
      (list) => current && setLibrary(list.filter((a) => a.def.shape === "nuke")),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [signedIn, nukeAllowed]);

  const amountValue = Number(amount);
  const amountValid = Number.isInteger(amountValue) && amountValue >= 1 && amountValue <= MAX_NUKE_DAMAGE;
  // Every board draws the blast in the middle of its own screen; the damage hits every token.
  const epicenter = mapCentre(state);
  const chosen = library.find((a) => a.id === animationId);

  const setReduced = async (enabled: boolean) => {
    const result = await connection.command({ type: "room.setReducedEffects", enabled });
    setError(result.ok ? null : result.message);
  };

  const ask = (e: FormEvent) => {
    e.preventDefault();
    if (amountValid) setConfirming(true);
  };

  const detonate = async () => {
    if (busy || !amountValid) return;
    setBusy(true);
    const result = await connection.command({
      type: "nuke.detonate",
      amount: amountValue,
      origin: epicenter,
      ...(chosen && { animation: chosen.def }),
    });
    if (!live.current) return;
    setBusy(false);
    setConfirming(false);
    setError(result.ok ? null : result.message);
    setStatus(result.ok ? `Nuke detonated for ${amountValue} damage.` : "");
  };

  return (
    <PanelSection id="gm-effects" title="Table effects">
      <div className="stack">
        {nukeAllowed && (
          <form className="stack nuke-form" onSubmit={ask} aria-label="Map nuke">
            <h3 className="field-label">Map nuke</h3>
            <label>
              Damage to every token with HP
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_NUKE_DAMAGE}
                step={1}
                value={amount}
                aria-invalid={!amountValid}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            {!amountValid && <p className="error" role="alert">Enter a whole number from 1 to {MAX_NUKE_DAMAGE}.</p>}
            <label>
              Animation
              <select value={animationId} onChange={(e) => setAnimationId(e.target.value)}>
                <option value={BUILTIN}>Built-in nuke</option>
                {library.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="danger-fill" disabled={!amountValid || busy}>
              Detonate…
            </button>
          </form>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            role="switch"
            checked={state.reducedEffects ?? false}
            onChange={(e) => void setReduced(e.target.checked)}
          />
          Reduced animations
        </label>
        <p className="muted small-print">Everyone at the table sees still markers instead of moving effects.</p>

        {error && <p role="alert" className="error">{error}</p>}
        <p className="sr-only" role="status">{status}</p>
      </div>

      <Modal open={confirming} title="Detonate nuke?" onClose={() => setConfirming(false)}>
        <div className="stack">
          <p>
            Every token with HP, including hidden ones, takes {amountValid ? amountValue : "?"} damage. You can undo it from the activity log.
          </p>
          <div className="row nuke-confirm-actions">
            <button type="button" className="danger-fill" disabled={busy} onClick={() => void detonate()}>
              {busy ? "Detonating…" : "Detonate"}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </PanelSection>
  );
}
