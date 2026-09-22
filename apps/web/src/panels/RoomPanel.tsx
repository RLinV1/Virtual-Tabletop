import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Participant, RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { GmPanel } from "../pages/GmPanel";
import { DicePanel } from "./DicePanel";
import { InitiativeTracker } from "./InitiativeTracker";
import { MyTokens } from "./MyTokens";
import { TokenRoster } from "./TokenRoster";

/**
 * The room's side panel, composed per role and per screen size (FR-PL-03).
 *
 * Ordered by what the viewer acts on most: their own tokens, then the turn they are
 * waiting for, then the roster, then dice. GM administration comes last because it is
 * setup, not play.
 *
 * On a narrow screen the same content becomes tabs. A single scrolling column would bury
 * the board under several screens of controls, and the board is the point — a player on a
 * phone should never have to scroll to see where their character is standing.
 *
 * Composition is by ownership and role, never by hiding: a player is not sent GM data and
 * then told not to look at it. The administration controls simply are not rendered, and
 * the server would refuse the commands anyway (FR-GM-15).
 */

type TabId = "play" | "tokens" | "dice" | "gm";

interface Props {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  inviteCode?: string;
  token: string;
  onFocusToken: (tokenId: string) => void;
  /** True on narrow screens, where the panel becomes tabbed. */
  compact: boolean;
}

export function RoomPanel({ connection, state, you, inviteCode, token, onFocusToken, compact }: Props) {
  const isGm = you.role === "gm";
  const [tab, setTab] = useState<TabId>("play");
  const baseId = useId();
  /** Set when the arrow keys moved the selection, so focus can follow it. */
  const movedByKeyboard = useRef(false);

  // In the ARIA tabs pattern focus must travel with the selection. Without this the user
  // is left focused on a tab that now has tabIndex -1, the next arrow press comes from a
  // detached element, and a screen reader never announces the tab they just moved to.
  useEffect(() => {
    if (!movedByKeyboard.current) return;
    movedByKeyboard.current = false;
    document.getElementById(`${baseId}-tab-${tab}`)?.focus();
  }, [tab, baseId]);

  // Role is server-owned, so it can change under us. Don't strand the panel on a tab that
  // no longer exists.
  useEffect(() => {
    if (tab === "gm" && !isGm) setTab("play");
  }, [tab, isGm]);

  const sections: Record<TabId, ReactNode> = {
    play: (
      <>
        <MyTokens connection={connection} state={state} you={you} onFocusToken={onFocusToken} />
        <InitiativeTracker connection={connection} state={state} you={you} onFocusToken={onFocusToken} />
        {/* Compact hides the participants section in the header; it reappears here as a
            single inline line, since knowing who is in the room still matters. */}
        {compact && (
          <section className="panel-section">
            <h2>Participants</h2>
            <p className="who-list">
              {Object.values(state.participants)
                .map((p) => `${p.displayName}${p.role === "gm" ? " (GM)" : ""}`)
                .join(" · ")}
            </p>
          </section>
        )}
      </>
    ),
    tokens: <TokenRoster connection={connection} state={state} you={you} onFocusToken={onFocusToken} />,
    dice: <DicePanel connection={connection} state={state} isGm={isGm} />,
    gm: isGm ? (
      <GmPanel connection={connection} state={state} inviteCode={inviteCode} token={token} />
    ) : null,
  };

  if (!compact) {
    return (
      <>
        {sections.play}
        {sections.tokens}
        {sections.dice}
        {sections.gm}
      </>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: "play", label: "Play" },
    { id: "tokens", label: "Tokens" },
    { id: "dice", label: "Dice" },
    ...(isGm ? [{ id: "gm" as const, label: "Manage" }] : []),
  ];

  return (
    <div className="tabbed">
      <div className="tabbar" role="tablist" aria-label="Room panels">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={tab === t.id}
            // Only the active panel is rendered, so pointing at an absent id on the others
            // would be a dangling reference.
            aria-controls={tab === t.id ? `${baseId}-panel-${t.id}` : undefined}
            // Roving tabindex: the tablist is one tab stop, arrows move within it.
            tabIndex={tab === t.id ? 0 : -1}
            className={tab === t.id ? "tab selected" : "tab"}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => {
              const i = tabs.findIndex((x) => x.id === tab);
              const next =
                e.key === "ArrowRight" ? tabs[(i + 1) % tabs.length]
                : e.key === "ArrowLeft" ? tabs[(i - 1 + tabs.length) % tabs.length]
                : e.key === "Home" ? tabs[0]
                : e.key === "End" ? tabs.at(-1)
                : null;
              if (!next) return;
              e.preventDefault();
              movedByKeyboard.current = true;
              setTab(next.id);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${tab}`}
        aria-labelledby={`${baseId}-tab-${tab}`}
        tabIndex={0}
        className="tabpanel"
      >
        {sections[tab]}
      </div>
    </div>
  );
}
