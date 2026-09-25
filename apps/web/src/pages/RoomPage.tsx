import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { House } from "@phosphor-icons/react";
import { Board, type BoardHandle } from "../board/Board";
import { Link } from "../Link";
import { forgetCredentials, loadCredentials } from "../net/identity";
import { RoomConnection, useRoomSnapshot, type ConnectionStatus } from "../net/roomConnection";
import { RoomPanel } from "../panels/RoomPanel";
import { ActivityLog } from "../panels/ActivityLog";
import { LeaveTable } from "../panels/LeaveTable";
import { ResolveDepartureModal } from "../panels/ResolveDeparture";
import { DepartureNotices } from "../ui/DepartureNotice";
import { SectionCollapseProvider } from "../ui/PanelSection";
import { ParticipantsButton } from "../ui/ParticipantsButton";
import { ShareButton } from "../ui/ShareButton";
import { GuideIcon, GuideTour } from "../ui/GuideTour";
import { isBoolean, usePersistentState } from "../ui/usePersistentState";

/** Below this the panel becomes tabs and sits under the board (FR-PL-03). */
const COMPACT_WIDTH = 720;

/**
 * Tracks the narrow-screen breakpoint.
 *
 * matchMedia rather than a resize listener: it fires once per crossing instead of on every
 * pixel, and it is correct on the very first render — a phone must not paint the desktop
 * layout and then reflow.
 */
function useCompactLayout() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(`(max-width: ${COMPACT_WIDTH}px)`);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(`(max-width: ${COMPACT_WIDTH}px)`).matches,
    () => false,
  );
}


const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: "Connecting…",
  open: "Connected",
  reconnecting: "Reconnecting…",
  unauthorized: "No access",
  ended: "Left the room",
};

export function RoomPage({ roomId }: { roomId: string }) {
  const creds = useMemo(() => loadCredentials(roomId), [roomId]);
  const connection = useMemo(() => (creds ? new RoomConnection(roomId, creds.guestToken) : null), [roomId, creds]);

  useEffect(() => {
    if (!connection) return;
    connection.start();
    return () => connection.stop();
  }, [connection]);

  if (!creds || !connection) {
    return (
      <main className="centered">
        <div className="card">
          <h1>No access to this room</h1>
          <p className="muted">Ask the GM for an invite link.</p>
        </div>
      </main>
    );
  }
  return <Room roomId={roomId} connection={connection} inviteCode={creds.inviteCode} token={creds.guestToken} />;
}

/**
 * After Leave table (KAN-58). Deliberately plain: no account prompt, per FRONTEND-CONTRACT
 * §13.1. `roomName` is null when the page loaded after the seat had already ended.
 */
function SessionEnded({ roomName }: { roomName: string | null }) {
  return (
    <main className="centered">
      <div className="card">
        <h1>{roomName ? `You left ${roomName}` : "You left this room"}</h1>
        <p className="muted">
          Your seat at this table has ended. If the GM sends you the invite link again, you can join as a new player.
        </p>
        <Link href="/">Go to the home page</Link>
      </div>
    </main>
  );
}

function Room({
  roomId,
  connection,
  inviteCode,
  token,
}: {
  roomId: string;
  connection: RoomConnection;
  inviteCode?: string;
  token: string;
}) {
  const { status, state, you, seq } = useRoomSnapshot(connection);
  const [reviewing, setReviewing] = useState<string | null>(null);

  // The seat is gone for good, on every tab that shared it: forget it, so the invite link
  // offers the join form rather than bouncing back to a room that refuses us (ADR 0006).
  useEffect(() => {
    if (status === "ended") forgetCredentials(roomId);
  }, [status, roomId]);
  const boardRef = useRef<BoardHandle>(null);
  const compact = useCompactLayout();
  const focusToken = useCallback((tokenId: string) => boardRef.current?.focusToken(tokenId), []);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState("vtt.ui.sidebar", false, isBoolean);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideButtonRef = useRef<HTMLButtonElement>(null);
  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    guideButtonRef.current?.focus();
  }, []);

  if (status === "ended") return <SessionEnded roomName={state?.name ?? null} />;

  if (status === "unauthorized") {
    return (
      <main className="centered">
        <div className="card">
          <h1>No access to this room</h1>
          <p className="muted">Your invite may have been revoked. Ask the GM for a new link.</p>
        </div>
      </main>
    );
  }

  if (!state || !you) {
    return <main className="centered" aria-busy="true">{STATUS_LABEL[status]}</main>;
  }

  const participants = Object.values(state.participants);
  // The rail is a desktop affordance. On a phone the panel is already below the board, so
  // the remembered preference is ignored there and applies again once the window widens.
  const collapsed = sidebarCollapsed && !compact;

  return (
    <div className={["room", compact && "compact", collapsed && "sidebar-collapsed"].filter(Boolean).join(" ")}>
      {/* Keyboard and screen-reader users should not have to tab through the canvas,
          which is a single non-navigable element, to reach the controls. */}
      <a
        className="skip-link"
        href="#room-panel"
        onClick={(e) => {
          e.preventDefault();
          setSidebarCollapsed(false);
          // After the expand renders, so focus does not land on a hidden body.
          requestAnimationFrame(() => document.getElementById("room-panel")?.focus());
        }}
      >
        Skip to room controls
      </a>
      {/* Same element, same position in both states: collapsing must never remount the
          canvas or reset the viewer's zoom and pan. */}
      <Board
        ref={boardRef}
        connection={connection}
        state={state}
        you={you}
        notices={you.role === "gm" ? <DepartureNotices state={state} onReview={setReviewing} /> : undefined}
        toolbar={
          <>
            {/* The GM has rooms, a library and "Create room" to get back to, all on the GM
                dashboard; a player came from an invite and just closes the tab (room-navigation). */}
            {you.role === "gm" && (
              <Link href="/gm-dashboard" className="tool-button" title="Back to your GM dashboard">
                <House size={16} aria-hidden="true" />
                Home
              </Link>
            )}
            <ParticipantsButton participants={participants} />
            {you.role === "gm" && <ActivityLog roomId={state.roomId} token={token} seq={seq} />}
            <button
              ref={guideButtonRef}
              type="button"
              className="tool-button"
              data-tour="guide"
              title="A quick tour of this page"
              onClick={() => {
                // The sidebar's steps need it open. It animates open, and its sections have
                // no width until it has, so wait out the transition before starting.
                const wait = collapsed && !matchMedia("(prefers-reduced-motion: reduce)").matches ? 220 : 0;
                setSidebarCollapsed(false);
                window.setTimeout(() => setGuideOpen(true), wait);
              }}
            >
              <GuideIcon />
              Guide
            </button>
          </>
        }
      />
      <aside className="panel" id="room-panel" tabIndex={-1} aria-label="Room controls">
        {!compact && (
          // A tab on the panel's inner edge, vertically centred. With the panel collapsed to
          // zero width it sits on the right edge of the screen. It stays mounted in both
          // states, so collapsing from it keeps focus on it.
          <button
            type="button"
            className="sidebar-handle"
            data-tour="sidebar-handle"
            aria-expanded={!collapsed}
            aria-controls="room-panel-body"
            aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            title={collapsed ? "Show sidebar" : "Hide sidebar"}
            onClick={() => setSidebarCollapsed((c) => !c)}
          >
            <Chevron pointsLeft={collapsed} />
          </button>
        )}
        <div className="panel-body" id="room-panel-body" hidden={collapsed}>
          {/*
            On a phone this header competes with the board for a screen that has neither to
            spare, so it collapses to one line: room name, who you are, and connection state.
          */}
          <header className="panel-header">
            <div className="panel-title-row">
              <h1>{state.name}</h1>
              {you.role === "gm" && inviteCode && <ShareButton inviteCode={inviteCode} />}
            </div>
            <span className={`status status-${status}`} role="status">
              {STATUS_LABEL[status]} · seq {seq}
            </span>
            <p className="whoami">
              You are <strong>{you.displayName}</strong> ({you.role === "gm" ? "GM" : "player"})
              {/* Players only: the GM can't leave their own room; Home is their way out. */}
              {you.role === "player" && (
                <>
                  {" · "}
                  <LeaveTable connection={connection} state={state} you={you} />
                </>
              )}
            </p>
          </header>
          {/*
            One panel for both roles. A player needs the turn order, their own token's
            resources and the shared dice log as much as the GM does; what differs is the
            administration section, and the server enforces that regardless.
          */}
          <SectionCollapseProvider>
            <RoomPanel
              connection={connection}
              state={state}
              you={you}
              token={token}
              onFocusToken={focusToken}
              compact={compact}
              onReviewDeparture={setReviewing}
            />
          </SectionCollapseProvider>
        </div>
      </aside>
      {guideOpen && <GuideTour role={you.role} onClose={closeGuide} />}
      {you.role === "gm" && (
        <ResolveDepartureModal
          connection={connection}
          state={state}
          participantId={reviewing}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  );
}

function Chevron({ pointsLeft }: { pointsLeft: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={pointsLeft ? "M7.5 2.5 4 6l3.5 3.5" : "M4.5 2.5 8 6l-3.5 3.5"} />
    </svg>
  );
}
