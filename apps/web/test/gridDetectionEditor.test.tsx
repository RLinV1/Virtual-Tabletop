// @vitest-environment jsdom
import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GRID, type GridDetectionStatus } from "@vtt/shared";
import { api } from "../src/net/api";
import { GridForm } from "../src/pages/GridForm";
import { toGridDraft, withGridSuggestion } from "../src/pages/gridDraft";
import { useGridDetection } from "../src/pages/useGridDetection";

const candidate = { cellSize: 64, offsetX: 7, offsetY: 13, confidence: 0.74 };
const map = { url: "/uploads/map.png", width: 768, height: 648 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});
afterEach(() => vi.restoreAllMocks());

describe("GM grid suggestion editor (FR-GM-03)", () => {
  it("leaves a dirty draft untouched on arrival and copies only alignment after Use suggestion", async () => {
    const pending = deferred<GridDetectionStatus | null>();
    vi.spyOn(api.detection, "library").mockReturnValue(pending.promise);
    const apply = vi.fn(async () => {});
    const cancel = vi.fn();

    function Editor() {
      const [draft, setDraft] = useState(() => toGridDraft({
        ...DEFAULT_GRID, unitsPerCell: 10, unitLabel: "ft", lineColor: "#ffffff", lineWidth: 3,
      }));
      const detection = useGridDetection("library", "gm-token", "map-id");
      return <GridForm
        grid={DEFAULT_GRID} map={map} draft={draft} hasDraft
        onChange={setDraft} onApply={apply} onCancel={cancel} applying={false} error={null}
        detection={detection.status} detectionError={detection.error}
        onUseSuggestion={(value) => setDraft((current) => withGridSuggestion(current, value))}
        onRetryDetection={() => { void detection.retry(); }}
      />;
    }

    render(<Editor />);
    fireEvent.change(screen.getByLabelText("Cell size (px)"), { target: { value: "71" } });
    await act(async () => pending.resolve({ status: "suggested", attempt: 1, candidate }));
    expect((screen.getByLabelText("Cell size (px)") as HTMLInputElement).value).toBe("71");
    expect(screen.getByText(/Low confidence/)).toBeTruthy();
    expect(apply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Use suggestion" }));
    expect((screen.getByLabelText("Cell size (px)") as HTMLInputElement).value).toBe("64");
    expect((screen.getByLabelText("Offset X (px)") as HTMLInputElement).value).toBe("7");
    expect((screen.getByLabelText("Per cell (ft)") as HTMLInputElement).value).toBe("10");
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Apply grid" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(expect.objectContaining({
      cellSize: 64, offsetX: 7, offsetY: 13, unitsPerCell: 10, lineColor: "#ffffff", lineWidth: 3,
    })));
  });

  it("offers Try again only after error and ignores a superseded map response", async () => {
    const old = deferred<GridDetectionStatus | null>();
    const next = deferred<GridDetectionStatus | null>();
    vi.spyOn(api.detection, "library").mockImplementation((_token, id) => id === "old" ? old.promise : next.promise);
    function Probe({ id }: { id: string }) {
      const detection = useGridDetection("library", "gm-token", id);
      return <div>{detection.status?.status ?? "pending"}</div>;
    }
    const view = render(<Probe id="old" />);
    view.rerender(<Probe id="new" />);
    expect(screen.getByText("pending")).toBeTruthy();
    await act(async () => next.resolve({ status: "no_grid", attempt: 1 }));
    await act(async () => old.resolve({ status: "suggested", attempt: 1, candidate }));
    expect(screen.getByText("no_grid")).toBeTruthy();

    const retry = vi.fn();
    const base = {
      grid: DEFAULT_GRID, map, draft: toGridDraft(DEFAULT_GRID), hasDraft: false,
      onChange: vi.fn(), onCancel: vi.fn(), onApply: vi.fn(async () => {}), applying: false, error: null,
      onRetryDetection: retry,
    };
    view.unmount();
    const form = render(<GridForm {...base} detection={{ status: "running", attempt: 1 }} />);
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    form.rerender(<GridForm {...base} detection={{ status: "error", attempt: 1 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
