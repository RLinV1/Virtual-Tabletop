import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { House } from "@phosphor-icons/react";
import { can, type DiceVisibility, type GridSpec, type Point } from "@vtt/shared";
import { Board, type BoardHandle } from "../board/Board";
import type { TokenDraft } from "../board/placement";
import { Link } from "../Link";
import type { SessionEndReason } from "@vtt/shared";
import { forgetCredentials, loadCredentials, rememberRoomName } from "../net/identity";
import { RoomConnection, useRoomSnapshot, type ConnectionStatus } from "../net/roomConnection";
import { PanelTabs, RoomPanel, isTabId, type TabBadges, type TabId } from "../panels/RoomPanel";
import { outcomeKey, pendingRulings } from "../panels/attackRoll";
import { ActivityLog } from "../panels/ActivityLog";
import type { AttackPick } from "../panels/AttackPanel";
import { gridsEqual, parseGridDraft, toGridDraft, type GridDraft } from "./gridDraft";
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

/** Route for `/r/:roomId`: loads this browser's credential for the room and runs its connection. */
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
  return <Room roomId={roomId} connection={connection} token={creds.guestToken} />;
}

const ENDED_COPY: Record<SessionEndReason, { title: (room: string | null) => string; body: string }> = {
  left: {
    title: (room) => `You left ${room ?? "this room"}`,
    body: "Your seat at this table has ended. If the GM sends you the invite link again, you can join as a new player.",
  },
  revoked: {
    title: (room) => `You were removed from ${room ?? "this room"}`,
    body: "The GM removed you from this table. If they send you an invite link, you can join again as a new player.",
  },
  deleted: {
    title: (room) => `${room ?? "This room"} was deleted`,
    body: "The GM deleted this room and everything in it. It can't be reopened.",
  },
};

/**
 * After Leave table (KAN-58), a removal, or the room being deleted (KAN-72). Deliberately
 * plain: no account prompt, per FRONTEND-CONTRACT §13.1. `roomName` is null when the page
 * loaded after the seat had already ended.
 */
function SessionEnded({ roomName, reason }: { roomName: string | null; reason: SessionEndReason | null }) {
  const copy = ENDED_COPY[reason ?? "left"];
  return (
    <main className="centered">
      <div className="card">
        <h1>{copy.title(roomName)}</h1>
        <p className="muted">{copy.body}</p>
        <Link href="/">Go to the home page</Link>
      </div>
    </main>
  );
}

/** The room once a credential exists: board, side panel, and the connection's terminal screens. */
function Room({ roomId, connection, token }: { roomId: string; connection: RoomConnection; token: string }) {
  const { status, state, you, seq, endReason, refusal } = useRoomSnapshot(connection);
  const [reviewing, setReviewing] = useState<string | null>(null);

  // The seat is gone for good, on every tab that shared it: forget it, so the invite link
  // offers the join form rather than bouncing back to a room that refuses us (ADR 0006).
  // Also when the server no longer knows the credential (room deleted, seat gone), so the
  // home page's joined list drops it (KAN-64). Not on `not_found`: a room that failed to load
  // may come back, and forgetting the seat would lose it for good.
  useEffect(() => {
    if (status === "ended" || refusal === "unauthorized") forgetCredentials(roomId);
  }, [status, refusal, roomId]);
  // So the home page's joined list names this room (KAN-64).
  const roomName = state?.name;
  useEffect(() => {
    if (roomName) rememberRoomName(roomId, roomName);
  }, [roomId, roomName]);
  const boardRef = useRef<BoardHandle>(null);
  const compact = useCompactLayout();
  const focusToken = useCallback((tokenId: string) => boardRef.current?.focusToken(tokenId), []);
  // Who attacks whom (attack-targeting): chosen in the Play tab's Attack section or on the board.
  const [attackPick, setAttackPick] = useState<AttackPick>({ attackerId: null, targetId: null });
  const pickOnBoard = useCallback((attackerId: string) => boardRef.current?.startAttack(attackerId), []);
  const pickTarget = useCallback((attackerId: string, targetId: string) => setAttackPick({ attackerId, targetId }), []);
  const showPing = useCallback((at: Point) => boardRef.current?.showPing(at), []);
  // The GM's "Roll privately" for attacks: here, so leaving the Play tab doesn't reset it.
  const [attackVisibility, setAttackVisibility] = useState<DiceVisibility>("public");
  const [gridDraft, setGridDraft] = useState<GridDraft | null>(null);
  const [gridPreview, setGridPreview] = useState<GridSpec | null>(null);
  const [gridApplying, setGridApplying] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);
  const gridApplyGeneration = useRef(0);
  const gridApplyInFlight = useRef(false);
  const committedGrid = state?.scene.grid;
  const sceneKey = state && JSON.stringify([
    state.scene.map?.url, state.scene.map?.assetId, state.scene.map?.width, state.scene.map?.height,
    state.scene.grid.cellSize, state.scene.grid.offsetX, state.scene.grid.offsetY,
    state.scene.grid.unitsPerCell, state.scene.grid.unitLabel,
    state.scene.grid.lineColor, state.scene.grid.lineWidth, state.scene.grid.lineOpacity,
  ]);

  // A new map, committed grid, or role invalidates a draft tied to the previous scene.
  useEffect(() => {
    setGridDraft(null);
    setGridPreview(null);
    setGridError(null);
  }, [sceneKey, you?.role]);

  const changeGridDraft = useCallback((draft: GridDraft) => {
    setGridDraft(draft);
    const parsed = parseGridDraft(draft, state?.scene.map);
    // An incomplete field leaves the last valid preview visible while the GM edits it.
    if (parsed && committedGrid) setGridPreview(gridsEqual(parsed, committedGrid) ? null : parsed);
    setGridError(null);
  }, [committedGrid, state?.scene.map]);

  const cancelGridDraft = useCallback(() => {
    // A sent command may still finish, but its response no longer belongs to this editor.
    gridApplyGeneration.current += 1;
    setGridDraft(null);
    setGridPreview(null);
    setGridError(null);
  }, []);

  const applyGrid = useCallback(async (grid: GridSpec): Promise<boolean> => {
    if (gridApplyInFlight.current) return false;
    gridApplyInFlight.current = true;
    const generation = gridApplyGeneration.current;
    setGridApplying(true);
    setGridError(null);
    try {
      const result = await connection.command({ type: "scene.setGrid", grid });
      if (generation !== gridApplyGeneration.current) return false;
      if (!result.ok) setGridError(result.message);
      return result.ok;
    } catch (error) {
      if (generation !== gridApplyGeneration.current) return false;
      setGridError(error instanceof Error ? error.message : "Could not apply grid");
      return false;
    } finally {
      gridApplyInFlight.current = false;
      setGridApplying(false);
    }
  }, [connection]);
  const placeToken = useCallback((draft: TokenDraft) => boardRef.current?.placeToken(draft), []);
  const [sidebarCollapsed, setSidebarCollapsed] = usePersistentState("vtt.ui.sidebar", false, isBoolean);
  const [tab, setTab] = usePersistentState<TabId>("vtt.ui.tab", "play", isTabId);
  const [guideOpen, setGuideOpen] = useState(false);
  const guideButtonRef = useRef<HTMLButtonElement>(null);
  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    guideButtonRef.current?.focus();
  }, []);

  // The attacker follows the turn onto a token the viewer controls, even after they picked
  // another; a pick made after that sticks until the next turn change (attack-ux-polish). Kept
  // here, not in the Attack section, so a turn that passes while Play isn't showing still counts.
  const activeTurnId = state?.initiative?.order[state.initiative.activeIndex] ?? null;
  const activeToken = activeTurnId ? state?.tokens[activeTurnId] : undefined;
  const controlsActive = !!(activeToken && you && can.attackWith(you, activeToken));
  useEffect(() => {
    if (!controlsActive || !activeTurnId) return;
    setAttackPick((p) => (p.attackerId === activeTurnId ? p : { attackerId: activeTurnId, targetId: p.targetId === activeTurnId ? null : p.targetId }));
  }, [activeTurnId, controlsActive]);

  // Play-tab indicator (attack-ux-polish): the GM's pending rulings, or a dot when the GM has
  // ruled on a player's latest roll since they last had Play in view.
  const playVisible = tab === "play" && !(sidebarCollapsed && !compact);
  const pendingCount = state && you?.role === "gm" ? pendingRulings(state).length : 0;
  const myLatest = state && you ? [...state.rolls].reverse().find((r) => r.attack && r.byParticipantId === you.id) : undefined;
  const outcome = outcomeKey(myLatest);
  /** The outcome last seen with Play in view; undefined until the room has loaded. */
  const [seenOutcome, setSeenOutcome] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (state && (playVisible || seenOutcome === undefined)) setSeenOutcome(outcome);
  }, [state, playVisible, outcome, seenOutcome]);
  const tabBadges: TabBadges = pendingCount > 0
    ? { play: { count: pendingCount, label: `${pendingCount} ${pendingCount === 1 ? "ruling" : "rulings"} pending` } }
    : you?.role !== "gm" && !playVisible && outcome && seenOutcome !== undefined && outcome !== seenOutcome
      ? { play: { label: "new ruling" } }
      : {};

  if (status === "ended") return <SessionEnded roomName={state?.name ?? null} reason={endReason} />;

  if (status === "unauthorized") {
    return (
      <main className="centered">
        <div className="card">
          <h1>No access to this room</h1>
          <p className="muted">
            Your invite may have been revoked, or the room may have been deleted. Ask the GM for a new link.
          </p>
        </div>
      </main>
    );
  }

  if (!state || !you) {
    return <main className="centered" aria-busy="true">{STATUS_LABEL[status]}</main>;
  }

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
      {/* Who is here and what the sidebar shows, above the board and the panel alike. */}
      <header className="room-topbar">
        <div className="topbar-start">
          {/* The GM has rooms, a library and "Create room" to get back to, all on the GM
              dashboard; a player came from an invite and just closes the tab (room-navigation). */}
          {you.role === "gm" && (
            <Link href="/gm-dashboard" className="tool-button" title="Back to your GM dashboard">
              <House size={16} aria-hidden="true" />
              Home
            </Link>
          )}
          <h1 className="room-title">{state.name}</h1>
        </div>
        <div className="topbar-center">
          <ParticipantsButton state={state} you={you} connection={connection} onReviewDeparture={setReviewing} />
        </div>
        <div className="topbar-end">
          {!compact && (
            <PanelTabs
              className="tabbar topbar-tabs"
              isGm={you.role === "gm"}
              badges={tabBadges}
              tab={tab}
              onTab={(next, reselected) => {
                // A hidden sidebar opens on the tab pressed; pressing the open tab hides it.
                if (collapsed) {
                  setTab(next);
                  setSidebarCollapsed(false);
                } else if (reselected) setSidebarCollapsed(true);
                else setTab(next);
              }}
            />
          )}
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
          {/* Last, in the top-right corner: visible with the sidebar shown or hidden. */}
          {you.role === "gm" && <ShareButton roomId={roomId} token={token} />}
        </div>
      </header>
      {/* Same element, same position in both states: collapsing must never remount the
          canvas or reset the viewer's zoom and pan. */}
      <Board
        ref={boardRef}
        connection={connection}
        state={state}
        you={you}
        gridPreview={you.role === "gm" ? gridPreview : null}
        onPickTarget={pickTarget}
        notices={you.role === "gm" ? <DepartureNotices state={state} onReview={setReviewing} /> : undefined}
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
            <span className={`status status-${status}`} role="status">
              {STATUS_LABEL[status]} · seq {seq}
            </span>
            {/* A div, not a p: Leave table renders its confirmation <dialog> in here. */}
            <div className="whoami">
              You are <strong>{you.displayName}</strong> ({you.role === "gm" ? "GM" : "player"})
              {/* Players only: the GM can't leave their own room; Home is their way out. */}
              {you.role === "player" && (
                <>
                  {" · "}
                  <LeaveTable connection={connection} state={state} you={you} />
                </>
              )}
            </div>
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
              attackPick={attackPick}
              onAttackPick={setAttackPick}
              onPickOnBoard={pickOnBoard}
              onShowPing={showPing}
              attackVisibility={attackVisibility}
              onAttackVisibility={setAttackVisibility}
              gridDraft={gridDraft ?? toGridDraft(state.scene.grid)}
              hasGridDraft={gridDraft !== null}
              onGridDraftChange={changeGridDraft}
              onGridDraftCancel={cancelGridDraft}
              onGridApply={applyGrid}
              gridApplying={gridApplying}
              gridError={gridError}
              onPlaceToken={placeToken}
              compact={compact}
              tab={tab}
              onTab={setTab}
              tabBadges={tabBadges}
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
