import { useRef, useState } from "react";
import { isActive, pendingDepartures, type Participant, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { Modal } from "./Modal";
import { PopoverButton } from "./Popover";

/**
 * Who is in the room, on demand (room-sidebar-layout: Participants on demand).
 *
 * The list is reference information, not something anyone acts on mid-encounter, so it no
 * longer takes a permanent slot in the sidebar. `participants` comes from the server's
 * filtered snapshot; nothing here is persisted. Only active participants are listed.
 *
 * The GM also gets Remove on each player (FR-GM-20). The confirmation is a sibling of the
 * popover, not inside it: the popover closes on any press outside itself, and that would
 * unmount a modal living in it.
 */
export function ParticipantsButton({
  state,
  you,
  connection,
  onReviewDeparture,
}: {
  state: RoomState;
  you: Participant;
  connection: RoomConnection;
  /** Opens the token review for a participant who is no longer in the room. */
  onReviewDeparture: (participantId: string) => void;
}) {
  // Someone who left or was removed stays in state for history, but is no longer here (ADR 0006).
  const participants = Object.values(state.participants).filter(isActive);
  const count = participants.length;
  const [removing, setRemoving] = useState<Participant | null>(null);
  const isGm = you.role === "gm";

  return (
    <>
      <PopoverButton
        label={`Participants, ${count}`}
        title="Participants"
        tourId="participants"
        buttonContent={
          <>
            <PeopleIcon />
            <span className="icon-count" aria-hidden>
              {count}
            </span>
          </>
        }
      >
        <ul className="plain participant-list">
          {participants.map((p) => (
            <li key={p.id}>
              <span className="participant-name">{p.displayName}</span>
              {p.role === "gm" && <span className="badge">GM</span>}
              {isGm && p.role === "player" && (
                <button
                  type="button"
                  className="link danger participant-remove"
                  aria-label={`Remove ${p.displayName} from the room`}
                  onClick={() => setRemoving(p)}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      </PopoverButton>
      {isGm && (
        <RemoveParticipant
          connection={connection}
          state={state}
          target={removing}
          onClose={() => setRemoving(null)}
          onRemoved={(id) => {
            setRemoving(null);
            onReviewDeparture(id);
          }}
        />
      )}
    </>
  );
}

/** "Remove Sam from this room?" Names the player and says what happens to their tokens and the link. */
function RemoveParticipant({
  connection,
  state,
  target,
  onClose,
  onRemoved,
}: {
  connection: RoomConnection;
  state: RoomState;
  target: Participant | null;
  onClose: () => void;
  /** Called after a successful remove when the player still owns tokens, to open their review. */
  onRemoved: (participantId: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const owned = target ? Object.values(state.tokens).filter((t) => t.ownerIds.includes(target.id)).length : 0;

  /** Closes the confirmation unless a removal is in flight. */
  const close = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  /** Sends `participant.revoke`, then opens the token review if the player still owns tokens. */
  async function remove() {
    if (!target) return;
    setBusy(true);
    setError(null);
    const result = await connection.command({ type: "participant.revoke", participantId: target.id });
    setBusy(false);
    if (!result.ok) return setError(result.message);
    // Read the pending list from the connection, not this render: it's already reduced there.
    const latest = connection.snapshot.state;
    const pending = latest ? pendingDepartures(latest).some((d) => d.participant.id === target.id) : false;
    if (pending) onRemoved(target.id);
    else onClose();
  }

  return (
    <Modal open={!!target} title={target ? `Remove ${target.displayName} from this room?` : "Remove"} onClose={close} initialFocus={cancelRef}>
      {target && (
        <div className="leave-confirm">
          <p>
            <strong>{target.displayName}</strong> is disconnected straight away, on every device, and can't come back
            with this seat.
          </p>
          <p>
            {owned === 0
              ? "They don't control any tokens."
              : `Their ${owned === 1 ? "token stays" : `${owned} tokens stay`} on the board under your control, and you choose what happens to ${owned === 1 ? "it" : "them"} next.`}
          </p>
          <p className="muted">
            They can still join again as a new player with the current invite link. To stop that, reset the link from
            Share.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="row modal-actions">
            <button ref={cancelRef} type="button" className="secondary" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="danger-fill" onClick={() => void remove()} disabled={busy}>
              {busy ? "Removing…" : `Remove ${target.displayName}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PeopleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.3c2.2.7 3.5 2.8 3.5 5.7" />
    </svg>
  );
}
