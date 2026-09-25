# ADR 0005 — Grid line style

**Status:** Accepted — reviewed by the Real-Time Architecture owner (Raymond), 2026-09-24 · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0004-asset-library.md`
**Owner:** Real-Time Architecture (Raymond) · **Change:** `openspec/changes/grid-line-style`

## Context

GMs want to choose the grid's line colour, thickness and opacity, so the grid stays visible on dark maps and can be toned down on busy ones. Every participant must see the same grid. The grid is `GridSpec`, an existing contract in `packages/shared` that is used by `grid.set`/`GridSet`, by `scene.setMap`/`MapSet.gridChange`, and by library map rows (ADR 0004). Stored events and library rows are JSON and are not re-validated when read back.

## Decision

Add three **optional** fields to `GridSpec`:

- `lineColor?: string`, matching `^#[0-9a-fA-F]{6}$` (the token colour rule)
- `lineWidth?: number`, in board pixels, from 0.5 to 8. The UI offers the presets `GRID_LINE_WIDTHS = [1, 2, 3, 4, 6]`.
- `lineOpacity?: number`, a fraction from 0.05 to 1. The floor keeps an applied grid from becoming invisible by accident.

Absent means the historical look: `#000000`, width 1, opacity 0.35. One pure resolver, `gridLineStyle(grid)`, supplies the defaults, and every reader (board, preview, tests) uses it.

No new command or event. The style is part of the grid, so it travels through `grid.set` → `GridSet { grid, previous }`, and through a library placement's `MapSet.gridChange`. Both already carry the complete replaced `GridSpec`, so undo restores the style (invariant 6), and `decide`/`reduce` need no new branches.

## Consequences

- **Backward compatible.** Every existing event, room and library row stays valid and renders unchanged. There's no migration, and no event upcasting is needed.
- **Why optional and not `.default()`.** Defaults would only be filled on paths that zod-parse, and stored events don't. Optional fields plus one resolver keep every path consistent.
- **Visibility.** The grid is public, so `filterStateForViewer`/`filterEventForViewer` are unchanged (invariant 3).
- **Board coordinates.** Width is in board pixels (invariant 8), so it scales with zoom identically for everyone.
- **Old clients.** A client built before this change drops the unknown fields when it re-sends a grid, which resets the style to the default until the next apply. That's acceptable during a rolling deploy.

## Alternatives considered

- **A separate `grid.style.set` command and `GridStyleSet` event.** Rejected: it would split one "Apply grid" into two undo steps, and would need its own `previous`, library plumbing and activity-log line, all for data that is conceptually part of the grid.
- **Per-viewer grid style, kept locally.** Rejected: the request is for the GM's choice to be what everyone sees.
