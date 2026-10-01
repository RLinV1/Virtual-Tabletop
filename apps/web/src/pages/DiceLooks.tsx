import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowCounterClockwise, CaretDown, CopySimple, PencilSimple, UploadSimple } from "@phosphor-icons/react";
import type { BodyName } from "../ui/diceGeometry";
import { BODIES, DICE_PROMPT, SKIN_FILE_TYPES, type DiceSkin } from "../ui/diceSkin";
import { copyTemplate, copyText, deleteDiceLook, readSkinFile, saveDiceLook, setActiveDiceLook, useDiceLooks } from "../ui/diceSkinStore";
import { Die3D, layoutDice } from "../ui/Die3D";
import { Modal } from "../ui/Modal";
import { PopoverButton } from "../ui/Popover";

const SIDES: Record<BodyName, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };

/**
 * The asset library's Dice tab (dice-image-skins): your dice looks, laid out like the other
 * tabs. The page's toolbar holds the search and "New dice look"; this is the grid of looks.
 * Each look holds a picture per die type, painted on that die's template (by hand or by an
 * image AI) or one square picture for every face. Looks live in this browser.
 */
export function DiceLookCards({ query, onEdit }: { query: string; onEdit: (id: string) => void }) {
  const { looks, activeId, ready } = useDiceLooks();
  const q = query.trim().toLowerCase();
  const shown = q ? looks.filter((l) => l.name.toLowerCase().includes(q)) : looks;

  if (!ready) {
    return (
      <p className="muted" aria-busy="true">
        Loading…
      </p>
    );
  }
  return (
    <>
      {shown.length === 0 && (
        <p className="muted">
          {q
            ? "None of your dice looks match that search."
            : "You haven't made any dice looks yet. A dice look paints your own dice with pictures, one per die type, from templates an image AI can fill in. It's kept in this browser: pick it in a room's Dice panel, and only you see it for now."}
        </p>
      )}
      <ul className="plain asset-grid" role="tabpanel">
        {shown.map((look) => (
          <DiceLookCard key={look.id} look={look} active={look.id === activeId} onEdit={() => onEdit(look.id)} />
        ))}
      </ul>
    </>
  );
}

function DiceLookCard({ look, active, onEdit }: { look: DiceSkin; active: boolean; onEdit: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="asset-card dice-look-card">
      <div className="asset-thumb">
        <DicePreview look={look} bodies={["d6", "d20"]} />
      </div>
      <strong className="asset-name" title={look.name}>
        {look.name}
      </strong>
      <span className="muted asset-meta">
        {coverage(look)}
        {active && " · In use"}
      </span>
      {confirming ? (
        <div className="confirm" role="alertdialog" aria-label={`Delete ${look.name}?`}>
          <p>Delete “{look.name}”? Your dice go back to the classic look if it's in use.</p>
          <div className="row">
            <button type="button" className="secondary small" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="small danger-fill" onClick={() => void deleteDiceLook(look.id)}>
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="row asset-actions">
          {!active && (
            <button type="button" className="link" onClick={() => setActiveDiceLook(look.id)}>
              Use
            </button>
          )}
          <button type="button" className="link" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="link danger" onClick={() => setConfirming(true)}>
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

function coverage(look: DiceSkin): string {
  const covered = BODIES.filter((b) => look.images[b]);
  if (covered.length === 0) return "No pictures yet";
  if (covered.length === BODIES.length) return "Every die";
  return covered.join(", ");
}

/** The look being edited, in a dialog like the creature form's. */
export function DiceLookModal({ lookId, onClose }: { lookId: string | null; onClose: () => void }) {
  const { looks, activeId } = useDiceLooks();
  const look = looks.find((l) => l.id === lookId) ?? null;
  return (
    <Modal open={look !== null} title="Edit dice look" className="dice-look-modal" onClose={onClose}>
      {look && <DiceLookEditor key={look.id} look={look} active={activeId === look.id} onDone={onClose} />}
    </Modal>
  );
}

function DiceLookEditor({ look, active, onDone }: { look: DiceSkin; active: boolean; onDone: () => void }) {
  const [name, setName] = useState(look.name);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), STATUS_MS);
    return () => clearTimeout(timer);
  }, [note]);
  const rename = () => {
    const next = name.trim().slice(0, 40);
    if (next && next !== look.name) void saveDiceLook({ ...look, name: next });
    else setName(look.name);
  };
  return (
    <div className="stack dice-look-form">
      <label>
        Name
        <input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && rename()}
          aria-describedby="dice-look-name-hint"
        />
        <span id="dice-look-name-hint" className="muted">
          Shown in a room's Dice panel, under Dice look.
        </span>
      </label>
      <div className="stack">
        <div className="row dice-look-pictures-head">
          <span className="field-label">Pictures</span>
          <button
            type="button"
            className="link"
            onClick={() => void copyText(DICE_PROMPT).then((ok) => setNote(ok ? "AI prompt copied: paste it with a die's template, or on its own for one picture on every face" : "Your browser didn't allow copying"))}
          >
            Copy AI prompt
          </button>
        </div>
        <p className="muted small-print">
          {note ?? "Edit a die to copy its template or upload its picture. Give an image AI the template with the AI prompt. Dice without a picture stay classic."}
        </p>
        <ul className="plain die-card-grid">
          {BODIES.map((b, i) => (
            <DieCard key={b} look={look} body={b} index={i} />
          ))}
        </ul>
      </div>
      <div className="row modal-actions">
        {!active && (
          <button type="button" className="secondary" onClick={() => setActiveDiceLook(look.id)}>
            Use at the table
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            rename();
            onDone();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

/** How long a die card's "copied" or "uploaded" line stays. */
const STATUS_MS = 4000;

/**
 * One die in the look: its preview and state, and a single Edit menu with everything you can
 * do to it, so six dice don't repeat the same four buttons.
 */
function DieCard({ look, body, index }: { look: DiceSkin; body: BodyName; index: number }) {
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const image = look.images[body];

  useEffect(() => {
    if (!status) return;
    // An error stays longer, to be read; it still clears, since it sits over the die.
    const timer = setTimeout(() => setStatus(null), status.error ? STATUS_MS * 2 : STATUS_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const result = await readSkinFile(file);
    if (typeof result === "string") return setStatus({ text: result, error: true });
    setStatus({ text: result.layout === "sheet" ? "Painted template on" : "Square picture on every face" });
    await saveDiceLook({ ...look, images: { ...look.images, [body]: result } });
  };

  return (
    <li className="die-card" style={{ "--index": index } as CSSProperties}>
      <div className="asset-thumb die-card-thumb">
        <DicePreview look={look} bodies={[body]} size={64} />
        {/* What just happened, for a moment, over the die: the card itself never changes size. */}
        {status && (
          <p className={status.error ? "die-card-toast error" : "die-card-toast"} role={status.error ? "alert" : "status"}>
            {status.text}
          </p>
        )}
      </div>
      <div className="die-card-foot">
        <strong className="die-card-name">{body}</strong>
        <PopoverButton
          label={`Edit ${body}`}
          title={`Edit ${body}`}
          align="right"
          className="secondary small die-card-edit"
          buttonContent={
            <>
              <PencilSimple size={14} aria-hidden="true" />
              Edit
              <CaretDown size={12} aria-hidden="true" />
            </>
          }
        >
          {(close) => (
            <ul className="plain die-menu">
              <li>
                <button
                  type="button"
                  className="die-menu-item"
                  onClick={() => {
                    // Straight from the click: the clipboard only takes an image during one.
                    const copying = copyTemplate(body);
                    close();
                    void copying.then((how) =>
                      setStatus({ text: how === "copied" ? "Template copied: paste it into your image AI" : `Saved ${body}-skin-template.png instead` }),
                    );
                  }}
                >
                  <CopySimple size={16} aria-hidden="true" />
                  Copy template
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="die-menu-item"
                  onClick={() => {
                    // The file dialog also needs the click itself.
                    input.current?.click();
                    close();
                  }}
                >
                  <UploadSimple size={16} aria-hidden="true" />
                  {image ? "Replace picture" : "Upload picture"}
                </button>
              </li>
              {image && (
                <li>
                  <button
                    type="button"
                    className="die-menu-item danger"
                    onClick={() => {
                      const images = { ...look.images };
                      delete images[body];
                      void saveDiceLook({ ...look, images });
                      setStatus({ text: "Back to classic" });
                      close();
                    }}
                  >
                    <ArrowCounterClockwise size={16} aria-hidden="true" />
                    Reset to classic
                  </button>
                </li>
              )}
            </ul>
          )}
        </PopoverButton>
      </div>
      <input
        ref={input}
        type="file"
        accept={SKIN_FILE_TYPES.join(",")}
        hidden
        aria-label={`Upload a ${body} picture`}
        onChange={(e) => {
          void upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </li>
  );
}

/** Dice at rest in a look, each showing its highest face. */
function DicePreview({ look, bodies, size = 44 }: { look: DiceSkin; bodies: BodyName[]; size?: number }) {
  const dice = useMemo(
    () => bodies.map((b) => layoutDice({ id: `preview-${b}`, sides: SIDES[b], dice: [SIDES[b]] }, size)[0]!),
    [bodies.join(","), size],
  );
  return (
    <div className="dice-look-preview" aria-hidden="true" style={{ "--die": `${size}px` } as CSSProperties}>
      {dice.map((die, i) => (
        <Die3D key={i} die={die} skin={look} />
      ))}
    </div>
  );
}
