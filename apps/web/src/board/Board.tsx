import { CornersOut } from "@phosphor-icons/react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_TOKEN_COLOR, EMPTY_STATS, type GridSpec, type Participant, type Point, type RoomState } from "@vtt/shared";
import type { RoomConnection } from "../net/roomConnection";
import { DEFAULT_TOOL_OPTIONS, ToolRail, toolFor, type ToolOptions } from "../ui/ToolRail";
import { BoardView } from "./boardView";
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
}

/** What the roster and initiative list can ask the canvas to do (FR-GM-24). */
export interface BoardHandle {
  focusToken(tokenId: string): void;
  /** Let the GM choose the square for a token filled in by Add token (place-token-on-board). */
  placeToken(draft: TokenDraft): void;
}

const PLACING_HINT = "Click a square to place the token · drag to pan · hold Alt to place freely · Esc to cancel";

const HINTS: Record<BoardTool["kind"], string> = {
  select: "Drag to pan · scroll to zoom · double-click to ping · hold Alt to place freely",
  measure: "Drag to measure · hold Alt to measure freely · Esc to stop",
  draw: "Drag to draw · only you can see drawings · Esc to stop",
  area: "Drag to size and aim · click to place the chosen size · hold Alt to place freely · everyone at the table sees areas",
  erase: "Click or drag over your marks and areas to erase them · Esc to stop",
};

/** With GM only ticked, the areas are the GM's alone; saying "everyone sees them" would mislead. */
const GM_ONLY_AREA_HINT = "Drag to size and aim · click to place the chosen size · GM only: players won't see these areas";

/** Keys typed into a field belong to that field, not to the board. */
function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
}

/** The PixiJS board plus its React toolbar and notices; Pixi objects stay inside `BoardView`. */
export const Board = forwardRef<BoardHandle, Props>(function Board({ connection, state, you, gridPreview, toolbar, notices }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<BoardView | null>(null);
  const latest = useRef({ state, you, gridPreview });
  latest.current = { state, you, gridPreview };
  const [tool, setTool] = useState<BoardTool>({ kind: "select" });
  const [toolOptions, setToolOptions] = useState<ToolOptions>(DEFAULT_TOOL_OPTIONS);
  const toolRef = useRef(tool);
  toolRef.current = tool;
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

    return () => {
      disposed = true;
      stopEphemeral();
      if (viewRef.current === view) {
        view.destroy();
        viewRef.current = null;
      }
    };
  }, [connection]);

  useEffect(() => {
    viewRef.current?.update(state, you);
  }, [state, you]);

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
  useEffect(() => {
    if (tool.kind === "select") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || isTyping(e.target) || document.querySelector("dialog[open]")) return;
      setTool({ kind: "select" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool.kind]);

  useImperativeHandle(ref, () => ({
    focusToken: (tokenId: string) => viewRef.current?.focusToken(tokenId),
    placeToken: (next: TokenDraft) => {
      // The rail's tools would compete with placing for the same clicks.
      setTool({ kind: "select" });
      setPlacing({ draft: next, busy: false, error: null });
    },
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
          setTool((current) => toolFor(current.kind, options));
        }}
        onClear={() => viewRef.current?.clearMarks()}
      />
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
            <button type="button" className="secondary" onClick={() => setPlacing(null)}>
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
