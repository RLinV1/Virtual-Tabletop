import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { House } from "@phosphor-icons/react";
import { can, filterStateForViewer, isActive, type DiceVisibility, type GridSpec, type Participant, type Point } from "@vtt/shared";
import { Board, type BoardHandle, type DiceBoard } from "../board/Board";
import { PendingDrops, type DiceDrop } from "../board/diceDrops";
import type { TokenDraft } from "../board/placement";
import { Link } from "../Link";
import type { SessionEndReason } from "@vtt/shared";
import { useAccount } from "../account/accountStore";
import { signInFor } from "../account/safeNext";
import { forgetCredentials, loadCredentials, rememberRoomName } from "../net/identity";
import type { DiceSkin } from "../ui/diceSkin";
import { useActiveDiceLook, useDiceLooks } from "../ui/diceSkinStore";
import { readySkin, tableSkin, usePreloadTableLooks, useShowOthersDice } from "../ui/tableLooks";
import { ensureSeat } from "../net/seats";
import { KeepSeatNotice } from "../ui/KeepSeatNotice";
import { RoomConnection, useRoomSnapshot, type ConnectionStatus } from "../net/roomConnection";
import { ChatPanel } from "../panels/ChatPanel";
import { PanelTabs, RoomPanel, isTabId, type TabBadges, type TabId } from "../panels/RoomPanel";
import { trayRoll, type RollThrow } from "../panels/DicePanel";
import { outcomeKey, pendingRulings } from "../panels/attackRoll";
import { ActivityLog } from "../panels/ActivityLog";
import type { AttackPick } from "../panels/AttackPanel";
import { useEncounterReset } from "../panels/attackSession";
import { gridsEqual, parseGridDraft, toGridDraft, type GridDraft } from "./gridDraft";
import { LeaveTable } from "../panels/LeaveTable";
import { ResolveDepartureModal } from "../panels/ResolveDeparture";
import { DepartureNotices } from "../ui/DepartureNotice";
import { TurnNotice } from "../ui/TurnNotice";
import { RollCard } from "../ui/RollCard";
import { SectionCollapseProvider } from "../ui/PanelSection";
import { ParticipantsButton } from "../ui/ParticipantsButton";
import { PreviewBanner } from "../ui/PreviewBanner";
import { previewConnection } from "../net/previewConnection";
import { ShareButton } from "../ui/ShareButton";
import { GuideIcon, GuideTour } from "../ui/GuideTour";
import { isBoolean, usePersistentState } from "../ui/usePersistentState";

/** The set without `id`; the same set when it wasn't there, so nothing re-renders. */
function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!set.has(id)) return set;
  const next = new Set(set);
  next.delete(id);
  return next;
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

/**
 * Route for `/r/:roomId`: loads this browser's credential for the room and runs its connection.
 * With none stored, a signed-in person's seat is resumed on this device (room-membership).
 */
export function RoomPage({ roomId }: { roomId: string }) {
  const account = useAccount();
  const [creds, setCreds] = useState(() => loadCredentials(roomId));
  const [resuming, setResuming] = useState<"idle" | "trying" | "failed">("idle");
  const connection = useMemo(() => (creds ? new RoomConnection(roomId, creds.guestToken) : null), [roomId, creds]);

  useEffect(() => {
    if (creds || account.status !== "signedIn" || resuming !== "idle") return;
    setResuming("trying");
    ensureSeat(roomId).then(setCreds, () => setResuming("failed"));
  }, [creds, account.status, resuming, roomId]);

  useEffect(() => {
    if (!connection) return;
    connection.start();
    return () => connection.stop();
  }, [connection]);

  if (!creds || !connection) {
    const waiting = account.status === "loading" || (account.status === "signedIn" && resuming !== "failed");
    if (waiting) return <main className="centered" aria-busy="true">Opening…</main>;
    return (
      <main className="centered">
        <div className="card">
          <h1>No access to this room</h1>
          <p className="muted">Ask the GM for an invite link.</p>
          {account.status === "signedOut" && (
            <p className="muted">
              Already in this room on another device? <Link href={signInFor(`/r/${roomId}`)}>Sign in</Link> to open your seat
              here.
            </p>
          )}
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
  signed_out: {
    title: () => "You signed out on this device",
    body: "Your seat is kept on your account. Sign in again to come back to it, here or on any other device.",
  },
};

/**
 * After Leave table (KAN-58), a removal, or the room being deleted (KAN-72). Deliberately
 * plain: no account prompt, per FRONTEND-CONTRACT §13.1. `roomName` is null when the page
 * loaded after the seat had already ended.
 */
function SessionEnded({ roomId, roomName, reason }: { roomId: string; roomName: string | null; reason: SessionEndReason | null }) {
  const copy = ENDED_COPY[reason ?? "left"];
  return (
    <main className="centered">
      <div className="card">
        <h1>{copy.title(roomName)}</h1>
        <p className="muted">{copy.body}</p>
        {reason === "signed_out" && <Link href={signInFor(`/r/${roomId}`)}>Sign in again</Link>}
        <Link href="/">Go to the home page</Link>
      </div>
    </main>
  );
}

/** The room once a credential exists: board, side panel, and the connection's terminal screens. */
function Room({ roomId, connection, token }: { roomId: string; connection: RoomConnection; token: string }) {
  const { status, state, you, seq, endReason, refusal } = useRoomSnapshot(connection);
  const [reviewing, setReviewing] = useState<string | null>(null);
  // The GM previewing the room as one player (gm-view-as-player): the same filter the server
  // applies, run here on the GM's full state. Read-only: its connection refuses every command.
  const [viewAs, setViewAs] = useState<string | null>(null);
  const viewed = viewAs ? state?.participants[viewAs] : undefined;
  const preview = useMemo(
    () => (state && you?.role === "gm" && viewed && viewed.role === "player" && isActive(viewed) ? { you: viewed, state: filterStateForViewer(state, viewed) } : null),
    [state, you?.role, viewed],
  );
  useEffect(() => {
    if (viewAs && !preview && state) setViewAs(null);
  }, [viewAs, preview, state]);
  const shownConnection = useMemo(
    () => (preview ? previewConnection(connection, preview.you.displayName) : connection),
    [connection, preview?.you.id, preview?.you.displayName],
  );

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
    const mapKey = JSON.stringify(connection.snapshot.state?.scene.map);
    const accepted = connection.snapshot.state?.scene.grid;
    const stillCurrent = (ok: boolean) => {
      const snapshot = connection.snapshot;
      return generation === gridApplyGeneration.current && snapshot.you?.role === "gm"
        && mapKey === JSON.stringify(snapshot.state?.scene.map)
        && !!snapshot.state && !!accepted
        && gridsEqual(snapshot.state.scene.grid, ok ? grid : accepted);
    };
    setGridApplying(true);
    setGridError(null);
    try {
      const result = await connection.command({ type: "scene.setGrid", grid });
      if (!stillCurrent(result.ok)) return false;
      if (!result.ok) setGridError(result.message);
      return result.ok;
    } catch (error) {
      if (!stillCurrent(false)) return false;
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

  // Rolls on this viewer's screen (throw-dice-on-board). Each roll is on its own, so any number
  // can be made in a row without one cutting into another:
  // - yours lands on your board where you let the die go, or for Roll, in the middle of it;
  // - someone else's lands where they let theirs go, replayed from their dice drop (ADR 0014);
  //   one rolled with Roll only gets the result card;
  // - a private (GM-only) roll is thrown in the GM's panel tray, off the board (board-dice-rolls).
  // A roll is `airborne` until its dice land; then the card in the board's corner says what it
  // was. Rolls that come in a snapshot (load, reconnect) are already on the table: never thrown.
  // Your own dice on the board stay `onBoard` until they've faded, and you can't roll again until
  // then, so a throw is never covered by the next one.
  const [airborne, setAirborne] = useState<ReadonlySet<string>>(() => new Set());
  const [onBoard, setOnBoard] = useState<ReadonlySet<string>>(() => new Set());
  const [landedId, setLandedId] = useState<string | null>(null);
  const [cardRollId, setCardRollId] = useState<string | null>(null);
  const land = useCallback((rollId: string) => {
    setAirborne((s) => without(s, rollId));
    setLandedId(rollId);
    setCardRollId(rollId);
  }, []);
  const drops = useRef(new PendingDrops());
  useEffect(() => {
    const stop = connection.onEphemeral((from, payload) => {
      if (payload.type === "diceDrop") drops.current.add(from, { expression: payload.expression, from: payload.from, to: payload.to }, performance.now());
    });
    return () => {
      stop();
    };
  }, [connection]);
  const expectDrop = useCallback(
    (drop: DiceDrop) => drops.current.add(connection.snapshot.you?.id ?? "", drop, performance.now()),
    [connection],
  );
  // A private roll lands in a panel tray: the Attack section's for your own attack, else the Dice
  // section's. With that tray out of view there is nothing to watch, so it lands at once.
  const diceVisible = tab === "dice" && !(sidebarCollapsed && !compact);
  const trays = useRef({ diceVisible, playVisible });
  trays.current = { diceVisible, playVisible };
  // Which look each public roll is drawn in (shared-dice-looks, ADR 0018): the roller's look on the
  // table; for your own roll with none on the table (a guest seat), your browser's look, which only
  // you see; for other people's, classic if you turned their looks off.
  const ownLook = useActiveDiceLook();
  const [showOthersDice] = useShowOthersDice();
  usePreloadTableLooks(state);
  const diceFor = useRef((_rollerId: string, _mine: boolean): DiceSkin | null => null);
  diceFor.current = (rollerId, mine) => {
    const onTable = connection.snapshot.state?.participants[rollerId]?.diceLook;
    if (mine) return readySkin(onTable ? tableSkin(onTable) : ownLook);
    return showOthersDice && onTable ? readySkin(tableSkin(onTable)) : null;
  };
  useSyncOwnDiceLook(connection, roomId, status === "open" ? (you ?? null) : null);
  useEffect(() => {
    const stop = connection.onRolled((roll) => {
      const mine = roll.byParticipantId === connection.snapshot.you?.id;
      if (roll.visibility === "gm") {
        const { diceVisible, playVisible } = trays.current;
        if (diceVisible || (playVisible && mine && roll.attack)) setAirborne((s) => new Set(s).add(roll.id));
        else land(roll.id);
        return;
      }
      const board = boardRef.current;
      const aim = drops.current.take(roll, performance.now()) ?? (mine ? board?.centreAim() : null);
      // Every public roll wears its roller's dice look, for everyone (shared-dice-looks).
      const look = { ...trayRoll(roll), skin: diceFor.current(roll.byParticipantId, mine) };
      // Not where it can't be animated (reduced motion, say): then it lands at once.
      const gone = () => setOnBoard((s) => without(s, roll.id));
      const thrown = !!aim && !!board?.throwDice({ rollId: roll.id, from: aim.from, to: aim.to }, look, () => land(roll.id), gone);
      if (!thrown) return land(roll.id);
      setAirborne((s) => new Set(s).add(roll.id));
      if (mine) setOnBoard((s) => new Set(s).add(roll.id));
    });
    return () => {
      stop();
    };
  }, [connection, land]);
  // A private roll whose tray has gone (another tab, or a newer roll in its place) lands now.
  const latestRollId = state?.rolls.at(-1)?.id;
  useEffect(() => {
    for (const id of airborne) {
      const roll = state?.rolls.find((r) => r.id === id);
      const inTray = (diceVisible && id === latestRollId) || (playVisible && id === myLatest?.id);
      if (!roll || (roll.visibility === "gm" && !inTray)) land(id);
    }
  }, [airborne, state, diceVisible, playVisible, latestRollId, myLatest, land]);
  useEffect(() => {
    if (!cardRollId) return;
    const timer = window.setTimeout(() => setCardRollId(null), ROLL_POPUP_MS);
    return () => window.clearTimeout(timer);
  }, [cardRollId]);
  // The card shows only rolls the viewed player could see, so a GM-only roll vanishes when a preview starts.
  const cardRoll = cardRollId ? (preview?.state ?? state)?.rolls.find((r) => r.id === cardRollId) : undefined;
  // Your dice are still showing: on the board until they fade, or in a private tray until they land.
  const rolling = onBoard.size > 0 || !!state?.rolls.some((r) => airborne.has(r.id) && r.byParticipantId === you?.id);
  const rollThrow: RollThrow = { airborne, rolling, justLandedId: landedId, onLanded: land, expectDrop };

  if (status === "ended") return <SessionEnded roomId={roomId} roomName={state?.name ?? null} reason={endReason} />;

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
  const shownState = preview?.state ?? state;
  const shownYou = preview?.you ?? you;

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
          {you.role === "gm" && !preview && (
            <Link href="/gm-dashboard" className="tool-button" title="Back to your GM dashboard">
              <House size={16} aria-hidden="true" />
              Home
            </Link>
          )}
          <h1 className="room-title">{state.name}</h1>
        </div>
        <div className="topbar-center">
          <ParticipantsButton state={state} you={you} connection={shownConnection} onReviewDeparture={setReviewing} onViewAs={setViewAs} viewingAs={viewAs} readOnly={!!preview} />
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
          {you.role === "gm" && !preview && <ActivityLog roomId={state.roomId} token={token} seq={seq} state={state} connection={connection} />}
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
          {you.role === "gm" && !preview && <ShareButton roomId={roomId} token={token} />}
        </div>
      </header>
      {/* Same element, same position in both states: collapsing must never remount the
          canvas or reset the viewer's zoom and pan. */}
      <Board
        ref={boardRef}
        connection={shownConnection}
        state={shownState!}
        you={shownYou!}
        readOnly={!!preview}
        gridPreview={you.role === "gm" && !preview ? gridPreview : null}
        onPickTarget={pickTarget}
        landedRollId={landedId}
        notices={
          // Always mounted, so screen readers register the live region before a notice lands in it.
          <div className="board-notices" role="status" aria-live="polite">
            {you.role === "gm" && !preview && <DepartureNotices state={state} onReview={setReviewing} />}
            <TurnNotice state={shownState!} you={shownYou!} onFocusToken={focusToken} />
            <KeepSeatNotice roomId={roomId} token={token} name={you.displayName} />
          </div>
        }
        overlay={<RollCard roll={cardRoll} rollerName={(roll) => shownState!.participants[roll.byParticipantId]?.displayName ?? "Someone"} />}
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
              You are <strong>{shownYou!.displayName}</strong> ({shownYou!.role === "gm" ? "GM" : "player"})
              {/* Players only: the GM can't leave their own room; Home is their way out. */}
              {shownYou!.role === "player" && !preview && (
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
              connection={shownConnection}
              state={shownState!}
              you={shownYou!}
              readOnly={!!preview}
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
      {/* Read-only while previewing: the same refusing connection and the viewed player's state. */}
      <ChatPanel connection={shownConnection} state={shownState!} />
      {preview && <PreviewBanner name={preview.you.displayName} onExit={() => setViewAs(null)} />}
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

/**
 * Keeps your look on the table in step with the look you chose (shared-dice-looks, ADR 0018): when
 * you enter the room, and whenever you choose another look, choose Classic, or edit the one in
 * use. Only then: if the GM puts your dice back to classic, they stay classic until you choose
 * again or come back into the room. Only for a signed-in seat kept on the account; a guest's look
 * stays on their own screen. The server checks the look is yours; this only asks.
 */
function useSyncOwnDiceLook(connection: RoomConnection, roomId: string, you: Participant | null) {
  const { looks, activeId, ready, kept } = useDiceLooks();
  const active = looks.find((l) => l.id === activeId) ?? null;
  const wantId = active?.id ?? null;
  const wantVersion = active?.updatedAt ?? null;
  // Read when needed, not a reason to sync: a change made by someone else (a GM reset) is respected.
  const onTable = useRef(you?.diceLook ?? null);
  onTable.current = you?.diceLook ?? null;
  // Read as it renders: keeping the seat on the account (KeepSeatNotice) re-renders the room.
  const seatKept = loadCredentials(roomId)?.viaAccount === true;
  useEffect(() => {
    if (!you || !ready || kept !== "account" || !seatKept) return;
    const table = onTable.current;
    const same = wantId === (table?.lookId ?? null) && (wantId === null || wantVersion === table?.version);
    if (!same) void connection.command({ type: "participant.setDiceLook", lookId: wantId });
    // Not on `onTable`: see above.
  }, [connection, you?.id, ready, kept, seatKept, wantId, wantVersion]);
}
