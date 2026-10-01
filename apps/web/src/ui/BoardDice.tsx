import type { DiceRoll } from "@vtt/shared";
import { rollHeadline } from "../panels/attackRoll";
import { trayRoll } from "../panels/DicePanel";
import { DiceTray } from "./DiceTray";

/**
 * The table's latest roll, over the board (attack-section-compact). A public roll's dice are thrown
 * here, big, on every participant's board, and once they land a popup says what was rolled and by
 * whom. A private (GM-only) roll is thrown in the GM's panel tray instead, so it stays off a shared
 * screen; only the GM's popup appears here, marked GM only. Players never receive GM-only rolls,
 * and everything shown comes from the viewer's filtered room state.
 */
export function BoardDice({
  throwing,
  popup,
  rollerName,
  onLanded,
  droppedId = null,
}: {
  /** A public roll whose dice are in the air. */
  throwing: DiceRoll | undefined;
  /** A roll that just landed, to announce. */
  popup: DiceRoll | undefined;
  /** Who made a roll, for a plain roll's popup. */
  rollerName: (roll: DiceRoll) => string;
  onLanded: (rollId: string) => void;
  /** A roll whose dice were dropped on the map and lie there (throw-dice-on-board): only its popup goes here. */
  droppedId?: string | null;
}) {
  const shown = throwing ?? popup;
  if (!shown) return null;
  const { title, meta } = rollHeadline(shown, rollerName(shown));
  return (
    <div className="board-dice">
      {shown.visibility !== "gm" && shown.id !== droppedId && (
        <DiceTray key={shown.id} roll={trayRoll(shown)} throwing={shown === throwing} onLanded={() => onLanded(shown.id)} scale={1.8} />
      )}
      {!throwing && popup && (
        <div className={popup.visibility === "gm" ? "board-roll-popup private" : "board-roll-popup"} role="status">
          <strong>{title}</strong>
          {popup.visibility === "gm" && <em className="badge">GM only</em>}
          <span className="muted">{meta}</span>
        </div>
      )}
    </div>
  );
}
