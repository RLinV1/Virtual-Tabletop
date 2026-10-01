import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { House } from "@phosphor-icons/react";
import { can, type DiceRoll, type DiceVisibility, type GridSpec, type Point } from "@vtt/shared";
import { Board, type BoardHandle, type DiceBoard } from "../board/Board";
import type { TokenDraft } from "../board/placement";
import { Link } from "../Link";
import type { SessionEndReason } from "@vtt/shared";
import { forgetCredentials, loadCredentials, rememberRoomName } from "../net/identity";
import { RoomConnection, useRoomSnapshot, type ConnectionStatus } from "../net/roomConnection";
import { PanelTabs, RoomPanel, isTabId, type TabBadges, type TabId } from "../panels/RoomPanel";
import { trayRoll } from "../panels/DicePanel";
import { outcomeKey, pendingRulings } from "../panels/attackRoll";
import { ActivityLog } from "../panels/ActivityLog";
import type { AttackPick } from "../panels/AttackPanel";
import { useEncounterReset } from "../panels/attackSession";
import { gridsEqual, parseGridDraft, toGridDraft, type GridDraft } from "./gridDraft";
import { LeaveTable } from "../panels/LeaveTable";
import { ResolveDepartureModal } from "../panels/ResolveDeparture";
import { DepartureNotices } from "../ui/DepartureNotice";
import { TurnNotice } from "../ui/TurnNotice";
import { BoardDice } from "../ui/BoardDice";
import { SectionCollapseProvider } from "../ui/PanelSection";
import { ParticipantsButton } from "../ui/ParticipantsButton";
import { ShareButton } from "../ui/ShareButton";
import { GuideIcon, GuideTour } from "../ui/GuideTour";
import { isBoolean, usePersistentState } from "../ui/usePersistentState";

/** How long a dice drop from another viewer waits for its roll (ADR 0014). */
const DROP_WAIT_MS = 5000;

/** The waiting drop that belongs to this roll: the same person, the same dice, not too long ago. */
function dropFor(drops: Map<string, { expression: string; from: Point; to: Point; at: number }>, roll: DiceRoll) {
  const drop = drops.get(roll.byParticipantId);
  return drop && drop.expression === roll.expression && performance.now() - drop.at <= DROP_WAIT_MS ? drop : undefined;
}

/** How long the board says what was just rolled (attack-section-compact). */
const ROLL_POPUP_MS = 4000;

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
  const { status, state, you, seq, snapshots, endReason, refusal } = useRoomSnapshot(connection);
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
  // Ending the encounter clears the target and the last roll, but keeps the attacker and named attacks (attack-panel-encounter-reset).
  const attackReset = useEncounterReset(roomId, state, you?.id ?? null, () => setAttackPick((p) => ({ ...p, targetId: null })));
  const showPing = useCallback((at: Point) => boardRef.current?.showPing(at), []);
  const diceBoard = useMemo<DiceBoard>(
    () => ({
      aimThrow: (client, velocity) => boardRef.current?.aimThrow(client, velocity) ?? null,
      throwDice: (t, roll, onLanded) => boardRef.current?.throwDice(t, roll, onLanded) ?? false,
    }),
    [],
  );
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

  // Every roll is thrown once, for everyone who can see it (attack-section-compact): a public roll
  // over the board with a popup of the result, a private (GM-only) roll in the GM's panel tray. Kept
  // here, not in a panel, so the board and the panels agree on when the dice have landed. Undefined
  // until the room loads. Every full snapshot (load, reconnect, resync) resets it to that snapshot's
  // latest roll: rolls already on the table then, including ones made while offline, aren't thrown.
  const latestRoll = state?.rolls[state.rolls.length - 1];
  const [landed, setLanded] = useState<{ id: string | null; live: boolean } | undefined>(undefined);
  const [popupRollId, setPopupRollId] = useState<string | null>(null);
  // A die dragged onto the map (throw-dice-on-board): while it waits to learn which roll it made,
  // rolls newer than `after` are held off the centred board throw; once known, `dropped` is the
  // roll whose dice land where it was let go, on this viewer's board, instead of in the centre.
  const [dropHold, setDropHold] = useState<{ after: string | null } | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const seenSnapshots = useRef(0);
  useEffect(() => {
    if (!state || seenSnapshots.current === snapshots) return;
    seenSnapshots.current = snapshots;
    setLanded({ id: latestRoll?.id ?? null, live: false });
    setPopupRollId(null);
    setDropHold(null);
    setDropped(null);
  }, [state, latestRoll, snapshots]);
  const throwingRoll = latestRoll && landed !== undefined && latestRoll.id !== landed.id ? latestRoll : undefined;
  const latestRollId = useRef(latestRoll?.id);
  latestRollId.current = latestRoll?.id;
  const landRoll = useCallback((rollId: string) => {
    // Dice dropped on the map land on their own clock; if a newer roll has arrived meanwhile, it is
    // the one in the air now, and landing the older one must not mark it landed or replay it.
    if (rollId !== latestRollId.current) return;
    setLanded({ id: rollId, live: true });
    setPopupRollId(rollId);
  }, []);
  const holdThrow = useCallback((after: string | null) => setDropHold({ after }), []);
  const releaseThrow = useCallback((rollId: string | null) => {
    setDropHold(null);
    setDropped(rollId);
  }, []);
  // Dice drops from other viewers (ADR 0014): where someone let a die go, kept briefly until their
  // roll arrives, so the throw replays at the same spot here instead of in the centre.
  const pendingDrops = useRef(new Map<string, { expression: string; from: Point; to: Point; at: number }>());
  useEffect(() => {
    const stop = connection.onEphemeral((from, payload) => {
      if (payload.type === "diceDrop") pendingDrops.current.set(from, { ...payload, at: performance.now() });
    });
    return () => {
      stop();
    };
  }, [connection]);
  const [replayed, setReplayed] = useState<string | null>(null);
  const replayDrop =
    throwingRoll && throwingRoll.visibility !== "gm" && throwingRoll.id !== replayed ? dropFor(pendingDrops.current, throwingRoll) : undefined;
  useEffect(() => {
    if (!throwingRoll || !replayDrop) return;
    const roll = throwingRoll;
    pendingDrops.current.delete(roll.byParticipantId);
    setReplayed(roll.id);
    // The same throw as on the thrower's board: its path is seeded by the roll and the two points.
    // Your own roll, replayed in another of your tabs, wears your dice look (dice-image-skins).
    const look = { ...trayRoll(roll), skinned: roll.byParticipantId === you?.id };
    const shown = boardRef.current?.throwDice({ rollId: roll.id, from: replayDrop.from, to: replayDrop.to }, look, () => landRoll(roll.id));
    // Where it can't be animated here (reduced motion, say), it's thrown as any other roll.
    if (shown) setDropped(roll.id);
  }, [throwingRoll, replayDrop, landRoll, you?.id]);
  /** The public roll the centred board throw shows: not one dropped on the map, nor one a drop is waiting for. */
  const centredRoll =
    throwingRoll &&
    throwingRoll.visibility !== "gm" &&
    throwingRoll.id !== dropped &&
    !replayDrop &&
    !(dropHold && throwingRoll.id !== dropHold.after)
      ? throwingRoll
      : undefined;
  // A private roll lands in a panel tray: the Attack section's for your own attack, else the Dice
  // section's. With that tray out of view there is nothing to watch, so it lands at once.
  const diceVisible = tab === "dice" && !(sidebarCollapsed && !compact);
  const privateTrayShown =
    throwingRoll?.visibility === "gm" &&
    (diceVisible || (playVisible && !!throwingRoll.attack && throwingRoll.byParticipantId === you?.id));
  const privateUnseen = throwingRoll?.visibility === "gm" && !privateTrayShown;
  useEffect(() => {
    if (privateUnseen && throwingRoll) landRoll(throwingRoll.id);
  }, [privateUnseen, throwingRoll, landRoll]);
  useEffect(() => {
    if (!popupRollId) return;
    const timer = window.setTimeout(() => setPopupRollId(null), ROLL_POPUP_MS);
    return () => window.clearTimeout(timer);
  }, [popupRollId]);
  const popupRoll = popupRollId ? state?.rolls.find((r) => r.id === popupRollId) : undefined;
  const rollThrow = {
    rollId: throwingRoll?.id ?? null,
    justLandedId: landed?.live ? landed.id : null,
    onLanded: landRoll,
    hold: holdThrow,
    release: releaseThrow,
  };

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
          {you.role === "gm" && <ActivityLog roomId={state.roomId} token={token} seq={seq} state={state} connection={connection} />}
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
        notices={
          // Always mounted, so screen readers register the live region before a notice lands in it.
          <div className="board-notices" role="status" aria-live="polite">
            {you.role === "gm" && <DepartureNotices state={state} onReview={setReviewing} />}
            <TurnNotice state={state} you={you} onFocusToken={focusToken} />
          </div>
        }
        overlay={
          <BoardDice
            throwing={centredRoll}
            droppedId={dropped}
            youId={you.id}
            popup={popupRoll}
            rollerName={(roll) => state.participants[roll.byParticipantId]?.displayName ?? "Someone"}
            onLanded={landRoll}
          />
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
              attackReset={attackReset}
              rollThrow={rollThrow}
              onPickOnBoard={pickOnBoard}
              onShowPing={showPing}
              diceBoard={diceBoard}
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
