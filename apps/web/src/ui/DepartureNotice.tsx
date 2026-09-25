import { useEffect, useRef, useState } from "react";
import { isActive, pendingDepartures, type RoomState } from "@vtt/shared";

/**
 * Tells the GM when a player leaves the table (KAN-58, ADR 0006).
 *
 * Only departures seen happening in this session produce a notice: the first snapshot's
 * departed players are remembered silently, so a reload doesn't replay old news. Anything
 * still unresolved after a dismiss or reload stays listed in the GM panel.
 */
export function DepartureNotices({ state, onReview }: { state: RoomState; onReview: (participantId: string) => void }) {
  const known = useRef<Set<string> | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

  useEffect(() => {
    const departed = Object.values(state.participants).filter((p) => !isActive(p)).map((p) => p.id);
    if (known.current === null) {
      known.current = new Set(departed);
      return;
    }
    const fresh = departed.filter((id) => !known.current!.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => known.current!.add(id));
    setNotices((n) => [...n, ...fresh]);
  }, [state.participants]);

  const pending = new Set(pendingDepartures(state).map((d) => d.participant.id));
  const dismiss = (id: string) => setNotices((n) => n.filter((x) => x !== id));

  return (
    // Always mounted, so screen readers register the live region before a notice lands in it.
    <div className="board-notices" role="status" aria-live="polite">
      {notices.map((id) => {
        const name = state.participants[id]?.displayName ?? "A player";
        return (
          <div key={id} className="board-notice">
            <p>
              <strong>{name}</strong> left the table.
              {!pending.has(id) && " They didn't control any tokens."}
            </p>
            <div className="row">
              {pending.has(id) && (
                <button
                  type="button"
                  className="small"
                  onClick={() => {
                    dismiss(id);
                    onReview(id);
                  }}
                >
                  Review tokens
                </button>
              )}
              <button type="button" className="small secondary" onClick={() => dismiss(id)} aria-label={`Dismiss: ${name} left`}>
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
