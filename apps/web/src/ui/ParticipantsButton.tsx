import type { Participant } from "@vtt/shared";
import { PopoverButton } from "./Popover";

/**
 * Who is in the room, on demand (room-sidebar-layout: Participants on demand).
 *
 * The list is reference information, not something anyone acts on mid-encounter, so it no
 * longer takes a permanent slot in the sidebar. `participants` comes from the server's
 * filtered snapshot; nothing here is persisted.
 */
export function ParticipantsButton({ participants }: { participants: Participant[] }) {
  const count = participants.length;
  return (
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
          </li>
        ))}
      </ul>
    </PopoverButton>
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
