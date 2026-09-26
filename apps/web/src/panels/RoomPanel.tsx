import { useEffect, useRef, type ReactNode } from "react";
import { DiceFive, MapTrifold, Sword, UserList } from "@phosphor-icons/react";
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
 * The content is split into tabs on every screen size. On a phone a single scrolling column
 * would bury the board under several screens of controls; on a desktop it mixed play and
 * setup in one long column. The tab buttons live in the room's top bar on wide screens.
 *
 * Composition is by ownership and role, never by hiding: a player is not sent GM data and
 * then told not to look at it. The administration controls simply are not rendered, and
 * the server would refuse the commands anyway (FR-GM-15).
 */

export type TabId = "play" | "tokens" | "dice" | "gm";

export const isTabId = (v: unknown): v is TabId => v === "play" || v === "tokens" || v === "dice" || v === "gm";

/** The panel's tabs for this role. Manage is the GM's only; a player is never offered it. */
export function panelTabs(isGm: boolean): { id: TabId; label: string; icon: ReactNode }[] {
  return [
    { id: "play", label: "Play", icon: <Sword size={16} aria-hidden="true" /> },
    { id: "tokens", label: "Tokens", icon: <UserList size={16} aria-hidden="true" /> },
    { id: "dice", label: "Dice", icon: <DiceFive size={16} aria-hidden="true" /> },
    ...(isGm ? [{ id: "gm" as const, label: "Manage", icon: <MapTrifold size={16} aria-hidden="true" /> }] : []),
  ];
}

/** Ids shared by the tab buttons (in the top bar or the panel) and the one tab panel. */
export const tabButtonId = (tab: TabId) => `room-tab-${tab}`;
export const TAB_PANEL_ID = "room-tabpanel";

/**
 * The tab buttons, as an ARIA tablist with a roving tab stop. Rendered in the room's top bar
 * on wide screens and above the panel on phones; either way they drive the same panel.
 */
export function PanelTabs({
  isGm,
  tab,
  onTab,
  className = "tabbar",
}: {
  isGm: boolean;
  tab: TabId;
  /** `reselected` is true when the already-selected tab was pressed again. */
  onTab: (tab: TabId, reselected: boolean) => void;
  className?: string;
}) {
  const tabs = panelTabs(isGm);
  /** Set when the arrow keys moved the selection, so focus can follow it. */
  const movedByKeyboard = useRef(false);

  // In the ARIA tabs pattern focus must travel with the selection. Without this the user
  // is left focused on a tab that now has tabIndex -1, the next arrow press comes from a
  // detached element, and a screen reader never announces the tab they just moved to.
  useEffect(() => {
    if (!movedByKeyboard.current) return;
    movedByKeyboard.current = false;
    document.getElementById(tabButtonId(tab))?.focus();
  }, [tab]);

  return (
    <div className={className} role="tablist" aria-label="Room panels" data-tour="panel-tabs">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={tabButtonId(t.id)}
          data-tour={`tab-${t.id}`}
          aria-selected={tab === t.id}
          aria-controls={tab === t.id ? TAB_PANEL_ID : undefined}
          // Roving tabindex: the tablist is one tab stop, arrows move within it.
          tabIndex={tab === t.id ? 0 : -1}
          className={tab === t.id ? "tab selected" : "tab"}
          onClick={() => onTab(t.id, tab === t.id)}
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
            onTab(next.id, false);
          }}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

interface Props {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  token: string;
  onFocusToken: (tokenId: string) => void;
  /** True on narrow screens, where the tab buttons sit above the panel instead of in the top bar. */
  compact: boolean;
  tab: TabId;
  onTab: (tab: TabId) => void;
  /** GM only: open the review of a departed player's tokens (KAN-58). */
  onReviewDeparture: (participantId: string) => void;
}

/**
 * Renders the selected tab's sections. The tabs separate what a viewer does at the table
 * (Play, Tokens, Dice) from the GM's setup (Manage), instead of one long column.
 */
export function RoomPanel({ connection, state, you, token, onFocusToken, compact, tab, onTab, onReviewDeparture }: Props) {
  const isGm = you.role === "gm";

  // Role is server-owned, so it can change under us. Don't strand the panel on a tab that
  // no longer exists.
  useEffect(() => {
    if (tab === "gm" && !isGm) onTab("play");
  }, [tab, isGm, onTab]);

  const sections: Record<TabId, ReactNode> = {
    play: (
      <>
        <MyTokens connection={connection} state={state} you={you} onFocusToken={onFocusToken} />
        <InitiativeTracker connection={connection} state={state} you={you} onFocusToken={onFocusToken} />
      </>
    ),
    tokens: <TokenRoster connection={connection} state={state} you={you} token={token} onFocusToken={onFocusToken} />,
    dice: <DicePanel connection={connection} state={state} isGm={isGm} />,
    gm: isGm ? (
      <GmPanel connection={connection} state={state} token={token} onReviewDeparture={onReviewDeparture} />
    ) : null,
  };

  return (
    <div className="tabbed">
      {compact && <PanelTabs isGm={isGm} tab={tab} onTab={(t) => onTab(t)} />}
      <div role="tabpanel" id={TAB_PANEL_ID} aria-labelledby={tabButtonId(tab)} tabIndex={0} className="tabpanel">
        {sections[tab === "gm" && !isGm ? "play" : tab]}
      </div>
    </div>
  );
}
