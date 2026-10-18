import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MIN_PANEL_WIDTH, PanelResizeHandle, clampPanelWidth, isPanelWidth, maxPanelWidth } from "../src/ui/PanelResizeHandle";

describe("sidebar resize (room-sidebar-layout)", () => {
  it("keeps the width between the minimum and 60% of the window", () => {
    expect(clampPanelWidth(10, 1600)).toBe(MIN_PANEL_WIDTH);
    expect(clampPanelWidth(5000, 1600)).toBe(720);
    expect(clampPanelWidth(5000, 800)).toBe(480);
    expect(clampPanelWidth(400.4, 1600)).toBe(400);
    expect(maxPanelWidth(300)).toBe(MIN_PANEL_WIDTH);
  });

  it("accepts only a sane stored width, or null for the default", () => {
    expect(isPanelWidth(null)).toBe(true);
    expect(isPanelWidth(400)).toBe(true);
    for (const bad of [100, 5000, NaN, "400", undefined]) expect(isPanelWidth(bad)).toBe(false);
  });

  it("renders a labelled, focusable vertical separator", () => {
    Object.assign(globalThis, { window: { innerWidth: 1600 } });
    const html = renderToStaticMarkup(<PanelResizeHandle width={400} onWidth={() => {}} />);
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-label="Resize sidebar"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-valuenow="400"');
  });
});
