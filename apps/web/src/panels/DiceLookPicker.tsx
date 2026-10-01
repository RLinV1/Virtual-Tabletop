import { setActiveDiceLook, useDiceLooks } from "../ui/diceSkinStore";

/**
 * Which dice look your own rolls are drawn in (dice-image-skins). Looks are made in the asset
 * library's Dice tab, which opens in a new tab so the room stays open; a look saved there shows
 * up here at once. Only you see your look for now.
 */
export function DiceLookPicker() {
  const { looks, activeId } = useDiceLooks();
  const value = looks.some((l) => l.id === activeId) ? activeId! : "";
  return (
    <div className="dice-look">
      <label htmlFor="dice-look">Dice look</label>
      <div className="dice-look-row">
        <select id="dice-look" value={value} onChange={(e) => setActiveDiceLook(e.target.value || null)}>
          <option value="">Classic</option>
          {looks.map((look) => (
            <option key={look.id} value={look.id}>
              {look.name}
            </option>
          ))}
        </select>
        <a href="/library?tab=dice" target="_blank" rel="noopener" className="dice-look-edit">
          {looks.length > 0 ? "Edit looks" : "Make a look"}
        </a>
      </div>
      <p className="muted small-print">Your own rolls use it; only you see it for now.</p>
    </div>
  );
}
