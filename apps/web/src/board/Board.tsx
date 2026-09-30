import { CornersOut } from "@phosphor-icons/react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_TOKEN_COLOR, EMPTY_STATS, type GridSpec, type Participant, type Point, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { DEFAULT_TOOL_OPTIONS, ToolRail, toolFor, type ToolOptions } from "../ui/ToolRail";
import { BoardView } from "./boardView";
import { MAX_ATTACK_EFFECTS, attackEffectFor, type AttackEffect } from "./effects";
import { autoPlacementPoint, type PlacementGhost, type TokenDraft } from "./placement";
import type { BoardTool } from "./tools";

interface Props {
  connection: RoomConnection;
  state: RoomState;
  you: Participant;
  gridPreview: GridSpec | null;
  /** Plain React controls shown top left, before Fit (e.g. the participants button). */
  toolbar?: ReactNode;
  /** Notices pinned to the top right of the board, e.g. the GM's "Sam left the table". */
  notices?: ReactNode;
  /** Drawn over the map, under the toolbar and notices; never takes pointer input. */
  overlay?: ReactNode;
  /** The roll whose dice have just landed; an attack's strike plays then, not while they are in the air (KAN-76). */
  landedRollId?: string | null;
  /** The viewer clicked the token `attackerId` attacks, in Pick on board (attack-targeting). */
  onPickTarget?: (attackerId: string, targetId: string) => void;
}

/** What the roster and initiative list can ask the canvas to do (FR-GM-24). */
export interface BoardHandle {
  focusToken(tokenId: string): void;
  /** Let the GM choose the square for a token filled in by Add token (place-token-on-board). */
  placeToken(draft: TokenDraft): void;
  /** Pick a target on the board for `tokenId` to attack; the pick goes to `onPickTarget` (attack-targeting). */
  startAttack(tokenId: string): void;
  /** Show a ping on this viewer's board only, e.g. the one an attack roll just sent. */
  showPing(at: Point): void;
}

const PLACING_HINT = "Click a square to place the token · drag to pan · hold Alt to place freely · Esc to cancel";

const HINTS: Record<BoardTool["kind"], string> = {
  select: "Drag to pan · scroll to zoom · double-click to ping · hold Alt to place freely",
  measure: "Drag to measure · hold Alt to measure freely · Esc to stop",
  draw: "Drag to draw · only you can see drawings · Esc to stop",
  area: "Drag to size and aim · click to place the chosen size · hold Alt to place freely · everyone at the table sees areas",
  erase: "Click or drag over your marks and areas to erase them · Esc to stop",
  attack: "Click the token to attack · Esc or right-click to cancel",
};

/** With GM only ticked, the areas are the GM's alone; saying "everyone sees them" would mislead. */
const GM_ONLY_AREA_HINT = "Drag to size and aim · click to place the chosen size · GM only: players won't see these areas";

/** A strike waits for its dice at most this long, in case their landing is never reported. */
const STRIKE_WAIT_MS = 5000;

/** Keys typed into a field belong to that field, not to the board. */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** The PixiJS board plus its React toolbar and notices; Pixi objects stay inside `BoardView`. */
export const Board = forwardRef<BoardHandle, Props>(function Board({ connection, state, you, gridPreview, toolbar, notices, overlay, landedRollId, onPickTarget }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  /** Strikes waiting for their thrown dice to land, by roll id, oldest first (KAN-76). */
  const waitingStrikes = useRef(new Map<string, { effect: AttackEffect; timer: number }>());
  const latest = useRef({ state, you, gridPreview, onPickTarget });
  latest.current = { state, you, gridPreview, onPickTarget };
  const [tool, setTool] = useState<BoardTool>({ kind: "select" });
  const [toolOptions, setToolOptions] = useState<ToolOptions>(DEFAULT_TOOL_OPTIONS);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  /** The tool to go back to once an attack's target is picked or cancelled. */
  const beforeAttack = useRef<BoardTool>({ kind: "select" });
  const endAttack = () => setTool((current) => (current.kind === "attack" ? beforeAttack.current : current));
  /** The token Add token handed over, until it is on the board or cancelled. */
  const [placing, setPlacing] = useState<{ draft: TokenDraft; busy: boolean; error: string | null } | null>(null);
  const placingRef = useRef(placing);
  placingRef.current = placing;
  const draft = placing?.draft ?? null;
  const ghost = useMemo<PlacementGhost | null>(
    () =>
      draft && {
        name: draft.name,
        size: draft.size ?? 1,
        rotation: draft.rotation ?? 0,
        color: draft.color ?? DEFAULT_TOKEN_COLOR,
        imageUrl: draft.imageUrl ?? null,
        hidden: draft.hidden ?? false,
        stats: draft.stats ?? EMPTY_STATS,
      },
    [draft],
  );
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  const placeAutomaticallyRef = useRef<HTMLButtonElement>(null);

  /** Create the token at `at`. One at a time: a second click while the first is in flight does nothing. */
  const place = async (at: Point) => {
    const current = placingRef.current;
    if (!current || current.busy) return;
    placingRef.current = { ...current, busy: true };
    setPlacing(placingRef.current);
    const result = await connection.command({ ...current.draft, position: at });
    // Keep the draft on a rejection, so the GM can read why and try another square.
    setPlacing((now) => (now?.draft !== current.draft ? now : result.ok ? null : { ...now, busy: false, error: result.message }));
  };
  const placeRef = useRef(place);
  placeRef.current = place;

  useEffect(() => {
    const view = new BoardView(hostRef.current!, {
      moveToken: async (tokenId, to) => {
        const result = await connection.command({ type: "token.move", tokenId, to });
        if (!result.ok) console.warn("Move rejected:", result.message);
        return result.ok;
      },
      dragPreview: (tokenId, at) => connection.ephemeral({ type: "tokenDragPreview", tokenId, at }),
      ping: (at) => connection.ephemeral({ type: "ping", at }),
      placeTemplate: async (template) => {
        const result = await connection.command({ type: "template.place", ...template });
        if (!result.ok) console.warn("Area rejected:", result.message);
        return result.ok;
      },
      removeTemplate: async (templateId) => {
        const result = await connection.command({ type: "template.remove", templateId });
        if (!result.ok) console.warn("Area removal rejected:", result.message);
        return result.ok;
      },
      placeToken: (at) => void placeRef.current(at),
      cancelPlacement: () => setPlacing(null),
      pickTarget: (attackerId, targetId) => {
        endAttack();
        latest.current.onPickTarget?.(attackerId, targetId);
      },
      cancelAttack: () => endAttack(),
    });

    let disposed = false;
    view.init().then(() => {
      if (disposed) return view.destroy();
      viewRef.current = view;
      view.setGridPreview(latest.current.gridPreview);
      view.update(latest.current.state, latest.current.you);
      view.setTool(toolRef.current);
      view.setPlacement(ghostRef.current);
    });
    const stopEphemeral = connection.onEphemeral((_from, payload) => {
      if (payload.type === "ping") view.showPing(payload.at, 0x3498db);
      else if (payload.type === "tokenDragPreview") view.showDragPreview(payload.tokenId, payload.at);
    });

    // Live events only, already filtered for this viewer; a snapshot never gets here (KAN-76).
    const stopCommitted = connection.onCommitted((committed, _before, after) => {
      const viewer = latest.current.you;
      const effect = attackEffectFor(committed.event, after, viewer);
      if (!effect) return;
      // Every public roll is thrown over the board first: the strike leaves when the dice land.
      // Rulings and damage have no dice and play at once.
      if (effect.kind === "strike" && committed.event.type === "DiceRolled") {
        const rollId = committed.event.roll.id;
        // A flood of rolls must not pile up strikes and timers: keep only the newest few.
        const waiting = waitingStrikes.current;
        while (waiting.size >= MAX_ATTACK_EFFECTS) {
          const [oldest, strike] = waiting.entries().next().value!;
          window.clearTimeout(strike.timer);
          waiting.delete(oldest);
        }
        const timer = window.setTimeout(() => {
          waitingStrikes.current.delete(rollId);
          viewRef.current?.playAttackEffect(effect);
        }, STRIKE_WAIT_MS);
        waitingStrikes.current.set(rollId, { effect, timer });
      } else {
        viewRef.current?.playAttackEffect(effect);
      }
    });

    return () => {
      disposed = true;
      stopEphemeral();
      stopCommitted();
      waitingStrikes.current.forEach((waiting) => window.clearTimeout(waiting.timer));
      waitingStrikes.current.clear();
      if (viewRef.current === view) {
        view.destroy();
        viewRef.current = null;
      }
    };
  }, [connection]);

  useEffect(() => {
    viewRef.current?.update(state, you);
  }, [state, you]);

  // Landing a roll releases its strike. Earlier ones whose dice were replaced mid-air are
  // dropped, not played in a burst nobody would see.
  useEffect(() => {
    const waiting = waitingStrikes.current;
    if (!landedRollId || !waiting.has(landedRollId)) return;
    for (const [rollId, strike] of [...waiting]) {
      waiting.delete(rollId);
      window.clearTimeout(strike.timer);
      if (rollId === landedRollId) {
        viewRef.current?.playAttackEffect(strike.effect);
        break;
      }
    }
  }, [landedRollId]);

  useEffect(() => {
    viewRef.current?.setGridPreview(gridPreview);
  }, [gridPreview]);

  useEffect(() => {
    viewRef.current?.setTool(tool);
  }, [tool]);

  useEffect(() => {
    viewRef.current?.setPlacement(ghost);
  }, [ghost]);

  // Keyboard path: put focus on "Place automatically". Add token starts placing only once its
  // dialog has closed and handed focus back, so nothing takes it away again.
  useEffect(() => {
    if (draft) placeAutomaticallyRef.current?.focus();
  }, [draft]);

  // Escape cancels placing, unless it is meant for a field or an open dialog.
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      e.preventDefault();
      setPlacing(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

  // Escape puts the board back to Select, unless it is meant for a field or an open dialog.
  // An attack being aimed goes back to whatever tool was in use before it.
  useEffect(() => {
    if (tool.kind === "select") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      if (toolRef.current.kind === "attack") endAttack();
      else setTool({ kind: "select" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool.kind]);

  // The attacker can vanish while its target is being picked: deleted, or hidden from a player.
  const attackerId = tool.kind === "attack" ? tool.attackerId : null;
  const attackerGone = attackerId !== null && !state.tokens[attackerId];
  useEffect(() => {
    if (attackerGone) endAttack();
  }, [attackerGone]);

  useImperativeHandle(ref, () => ({
    focusToken: (tokenId: string) => viewRef.current?.focusToken(tokenId),
    placeToken: (next: TokenDraft) => {
      // The rail's tools would compete with placing for the same clicks.
      setTool({ kind: "select" });
      setPlacing({ draft: next, busy: false, error: null });
    },
    startAttack: (tokenId: string) => {
      // Aiming and placing would compete for the same click; the aim wins.
      setPlacing(null);
      if (toolRef.current.kind !== "attack") beforeAttack.current = toolRef.current;
      setTool({ kind: "attack", attackerId: tokenId });
    },
    showPing: (at: Point) => viewRef.current?.showPing(at),
  }), []);

  return (
    <div className="board" data-tour="board">
      <div ref={hostRef} className="board-canvas" />
      <div className="board-toolbar">
        {toolbar}
        <button type="button" className="tool-button" data-tour="fit" onClick={() => viewRef.current?.resetView()} title="Fit the map to the screen">
          <CornersOut size={16} aria-hidden="true" />
          Fit
        </button>
      </div>
      {gridPreview && <p className="grid-preview-label" role="status">Preview · Not applied</p>}
      <ToolRail
        active={tool.kind}
        options={toolOptions}
        unitLabel={state.scene.grid.unitLabel}
        isGm={you.role === "gm"}
        onSelect={(kind) => {
          setPlacing(null);
          setTool(toolFor(kind, toolOptions));
        }}
        onOptions={(options) => {
          setToolOptions(options);
          setTool((current) => (current.kind === "attack" ? current : toolFor(current.kind, options)));
        }}
        onClear={() => viewRef.current?.clearMarks()}
      />
      {overlay}
      {notices}
      {placing && (
        <div className="placement-bar">
          <p aria-live="polite">
            Placing <strong>{placing.draft.name}</strong>: click a square on the map.
          </p>
          {placing.error && <p role="alert" className="error">{placing.error}</p>}
          <div className="row">
            <button
              ref={placeAutomaticallyRef}
              type="button"
              className="secondary"
              disabled={placing.busy}
              onClick={() => void place(autoPlacementPoint(state, placing.draft.size ?? 1))}
            >
              Place automatically
            </button>
            <button type="button" className="secondary" disabled={placing.busy} onClick={() => setPlacing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <p className="board-hint">
        {placing ? PLACING_HINT : tool.kind === "area" && tool.gmOnly ? GM_ONLY_AREA_HINT : HINTS[tool.kind]}
      </p>
    </div>
  );
});
