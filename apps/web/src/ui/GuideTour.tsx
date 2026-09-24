import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { guideSteps, placeCard, type GuideStep, type Rect, type Role } from "./guide";

const PAD = 6;

function findTarget(step: GuideStep): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Hidden (display:none, a closed phone tab, a collapsed sidebar) has no box.
  return r.width > 0 && r.height > 0 ? el : null;
}

/**
 * The guided tour overlay (room-sidebar-layout: Guided tour on demand).
 *
 * Dims the page, spotlights one `data-tour` target at a time and explains it in a card.
 * Steps whose target is not on screen are skipped. UI only: nothing is stored or sent.
 */
export function GuideTour({ role, onClose }: { role: Role; onClose: () => void }) {
  // Resolved once, after the first commit, so targets are read from the laid-out page
  // rather than whatever was on screen when the Guide button was pressed.
  const [steps, setSteps] = useState<GuideStep[] | null>(null);
  useLayoutEffect(() => setSteps(guideSteps(role).filter((s) => findTarget(s))), [role]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = steps?.[index];
  const last = steps !== null && index === steps.length - 1;

  const measure = useCallback(() => {
    const el = step && findTarget(step);
    if (!el) return setRect(null);
    const r = el.getBoundingClientRect();
    const target = { left: r.left - PAD, top: r.top - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
    setRect(target);
    const card = cardRef.current?.getBoundingClientRect() ?? { width: 320, height: 180 };
    setCardPos(placeCard(target, card, { width: window.innerWidth, height: window.innerHeight }));
  }, [step]);

  // New step: bring its area into view, then measure.
  useLayoutEffect(() => {
    const el = step && findTarget(step);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
    measure();
    nextRef.current?.focus();
  }, [step, measure]);

  // Escape closes from anywhere, not only while focus is inside the card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Follow the target through window resizes and any scrolling, including the panel's own.
  useEffect(() => {
    window.addEventListener("resize", measure);
    document.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      document.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  if (!steps || !step) {
    // Nothing to show yet (first commit) or nothing on screen to explain.
    if (steps && steps.length === 0) queueMicrotask(onClose);
    return null;
  }

  const go = (to: number) => (to < 0 || to >= steps.length ? onClose() : setIndex(to));

  return (
    <div className="guide-layer">
      {/* Blocks clicks on the page while the guide is open; the dimming is the spotlight's shadow. */}
      <div className="guide-blocker" aria-hidden />
      {rect && (
        <div
          className="guide-spotlight"
          aria-hidden
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      )}
      <div
        ref={cardRef}
        className="guide-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        aria-describedby="guide-body"
        style={cardPos ? { left: cardPos.left, top: cardPos.top } : { visibility: "hidden" }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            go(index + 1);
          } else if (e.key === "ArrowLeft" && index > 0) {
            e.preventDefault();
            go(index - 1);
          } else if (e.key === "Tab") {
            // Keep focus in the card; the page behind it is inert while the guide is open.
            const focusable = [...(cardRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])];
            const i = focusable.indexOf(document.activeElement as HTMLElement);
            const nextI = e.shiftKey ? (i <= 0 ? focusable.length - 1 : i - 1) : (i + 1) % focusable.length;
            e.preventDefault();
            focusable[nextI]?.focus();
          }
        }}
      >
        <div className="guide-card-head">
          <span className="guide-count">
            {index + 1} of {steps.length}
          </span>
          {!last && (
            <button type="button" className="link guide-skip" onClick={onClose}>
              Skip all
            </button>
          )}
        </div>
        <h2 id="guide-title" className="guide-title" aria-live="polite">
          {step.title}
        </h2>
        <p id="guide-body" className="guide-body">
          {step.body}
        </p>
        <div className="guide-actions">
          <button type="button" className="secondary" onClick={() => go(index - 1)} disabled={index === 0}>
            Back
          </button>
          <button ref={nextRef} type="button" onClick={() => go(index + 1)}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function GuideIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.3-2.6 3.9" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}
