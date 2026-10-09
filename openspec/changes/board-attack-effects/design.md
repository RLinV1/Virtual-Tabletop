## Context

See proposal.md — Why. `BoardView` (`apps/web/src/board/boardView.ts`) renders on demand: `invalidate()` schedules one frame, and a `animations` set of per-frame steps keeps frames coming only while a step returns true (pings, drag previews). Tokens are `TokenView` containers (`body`, `image`, `decor`, `markers`, `label`) positioned at board coordinates and redrawn when a `drawnKey` changes. `RoomConnection.handle` applies live `event` messages with `reduce`; snapshots arrive as `welcome` (initial load, reconnect, resync). A player receives an attack naming a hidden token only as a `resync`, and `RollRuled`/`RollDamageApplied` on hidden targets as `redacted` (visibility.ts).

## Goals / Non-Goals

**Goals:** animations derived purely from live, already-filtered events and the viewer's filtered state; no contract change; bounded render cost.

**Non-Goals:** a general particle system; per-token config; server involvement.

## Decisions

1. **Trigger source: a live-event hook on `RoomConnection`.** Add `onCommitted(fn: (committed, before, after) => void)`, called only from the `event` branch after a successful `reduce`, never from `welcome`. This gives "no replay on load/reload/resync" by construction, and every event it reports is one the server already filtered for this viewer (invariant 3).
   *Alternative:* diff `state.rolls` between renders in React. Rejected: a resync snapshot that adds a roll would animate it, and the React tree must not drive Pixi (CLAUDE.md).

2. **Mapping events → effects in a pure module `board/effects.ts`.** `attackEffectFor(event, stateAfter): AttackEffect | null` returns `{ kind: "strike", from, to }`, `{ kind: "hit" | "miss", at }`, `{ kind: "damage", at, amount }` or null. It returns null when:
   - the roll has no `attack`, or a side is `null` in the viewer's copy;
   - a named token is absent from the viewer's `tokens` or is `hidden` and the viewer is a player (defence in depth; the filter should already have removed it);
   - `RollRuled.verdict` is null.
   For `RollRuled`/`RollDamageApplied` it looks the roll up in the state (the roll carries the target side). Pure and unit-testable without Pixi.

3. **Effects follow tokens, not points.** Attack effects store token ids and read the token container's current position each frame, so a token moving mid-animation carries its effect along. If a token disappears (deleted, hidden by a resync) its effects end immediately.

4. **Shake and tilt are visual offsets on a child, never the container position.** A new `fx` child container inside each `TokenView` holds body/image offsets: shake moves `body`/`image`/`markers` via a wrapper's `pivot`, tilt rotates the art wrapper. `container.position` stays exactly the token's board position, so drag hit-testing and `token.move` never see an offset (invariant 8). Effect graphics set `eventMode = "none"` so they never catch pointer events.

5. **Condition effects table.** `CONDITION_EFFECTS: Record<ConditionId, ConditionEffectSpec>` in `effects.ts`, typed as a total record so adding a condition without an effect fails typecheck. Each spec says whether it `loops` and how to draw it at time `t` (and at rest for reduced motion). Proposed set:
   - blinded — dark veil over the upper half; charmed — small hearts drifting up; frightened — tremble (visual jitter); grappled — tightening ring segments; invisible — art alpha 0.35 with a shimmering edge; paralyzed — static yellow sparks; poisoned — green bubbles rising; prone — art tilted 70°; restrained — chain ring; stunned — stars circling above; unconscious — greyscale tint + "Zz"; concentrating — pulsing blue ring.
   Drawn into a per-token `effects` layer beneath `markers`, so the FR-TAC-08 badges draw on top and are untouched.

6. **Render budget.** A single board-level condition loop step is registered in `animations` while any token on the board has a looping condition (off-screen tokens are not culled; the 30 fps cap bounds the cost), the page is visible (`document.visibilityState`) and motion is allowed. It throttles to 30 fps by skipping frames when less than ~33 ms has passed. It unregisters itself when none remain (checked in `update`). Attack effects are short (≤ 1.2 s) steps in the same set.

7. **Reduced motion.** `matchMedia("(prefers-reduced-motion: reduce)")` read once and on `change`. When set: strike → a static target marker for 600 ms; hit/miss → static icon for 600 ms; damage → static "−N" label for 1 s; conditions → rest pose with no loop registered.

8. **Greyscale for unconscious.** Pixi v8 `ColorMatrixFilter.greyscale` on the art wrapper. Filters cost a render pass; acceptable for a handful of tokens. Removed when the condition clears.

## Risks / Trade-offs

- [Continuous rendering drains battery with many conditioned tokens] → 30 fps cap, stops when tab hidden or reduced motion; spec change recorded in `client-render-performance`.
- [An animation hints at a hidden token] → only filtered events and filtered state are used; effects.ts refuses null/absent/hidden sides; unit tests cover it; visibility-auditor reviews the diff.
- [A long burst of rolls stacks effects] → cap concurrent attack effects at 8, oldest dropped; strikes waiting for their dice are capped at 8 too (oldest dropped), and a landing releases only its own strike; each roll is thrown on its own, so the others keep waiting for their dice or the 5 s fallback.
- [Undoing a ruling replays an effect] → the compensating `RollRuled` looks like any ruling to the client (players never see `ActionUndone`), so it plays the restored verdict's effect. Cosmetic; accepted.
- [Prone tilt conflicts with token rotation] → tilt is applied on the art wrapper on top of `token.rotation`, not replacing it.

## Migration Plan

Web-only; ship with any server. Rollback is a revert.
