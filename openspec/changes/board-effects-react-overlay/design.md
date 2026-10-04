## Context

Effects live in `apps/web/src/board/effects.ts` (pure: which event animates, plans, condition shape tables) and are drawn by `boardView.ts` with Pixi `Graphics`. `Board.tsx` already feeds attack effects to the view and mounts `ThrownDice`, a React overlay that subscribes to the board's transform through `followView` and sits above the canvas. Project rules: React never touches Pixi objects; Pixi code stays in `board/`; effects are client-only and use only the viewer's filtered state.

## Goals / Non-Goals

**Goals:** much flashier attack and condition visuals using React libraries; same trigger and visibility logic; no regression in input, reduced motion, or performance.

**Non-Goals:** new conditions, sound, schema or server changes, changing the dice overlay.

## Decisions

1. **Overlay, modelled on `ThrownDice`.** A new `EffectsOverlay` component subscribes via `followView` to the world transform and converts token board coordinates to screen coordinates (the inverse of `clientToBoard`). It is an absolutely positioned, `pointer-events: none`, `aria-hidden` sibling of the canvas. Rejected: a Pixi particle library. It would zoom better, but the request is for a React library and the project rule keeps a clear Pixi/React split.
2. **framer-motion for one-shot motion, tsparticles for particles.** Strike projectile, trail, flash, ring, whiff and damage number are `motion` elements with keyframes that unmount on completion. Condition particles use `@tsparticles/react` v3 (slim bundle), one small 2D canvas per conditioned token (capped at 12). The React wrapper reloads a canvas whenever its options change, so a single shared canvas would reset every particle on each change. Attack impact sparks are framer-motion elements, not particles.
3. **Keep `effects.ts` as the source of truth.** `attackEffectFor` and `attackPlan` are unchanged, so visibility rules and durations keep their existing tests. `CONDITION_EFFECTS` keeps `art` (tilt, squash, greyscale, alpha, tremble) for Pixi and replaces `draw` shapes with a `preset` id. A new pure `effectPresets.ts` maps a preset id and radius to a tsparticles options object, and attack kinds to motion keyframes, so presets are unit-testable without a DOM.
4. **Pixi keeps token art styling.** Tilt, squash, greyscale and tremble change the token art and its jitter must stay in sync with the token container, so they remain in `boardView.ts`. The old projectile, flash and decoration drawing there is deleted so two systems never draw the same effect.
5. **Hidden safety.** The overlay takes the viewer's own `RoomState` and the effect list `attackEffectFor` already filtered. Condition emitters are derived from `state.tokens` of that state, skipping any token not present or hidden from the viewer. A token that leaves the viewer's state loses its emitter on the next render.
6. **Budget.** Attack effects are capped at `MAX_ATTACK_EFFECTS` (8). Condition emitters are capped at 12, ranked by distance from the view centre and recomputed on view change at most every 250 ms. tsparticles `fpsLimit` is 30 to match the existing loop budget; `pauseOnBlur` and a page-visibility check stop it when hidden. With no emitters and no motion elements the particle canvas is unmounted.
7. **Lazy load.** `EffectsOverlay` loads with `React.lazy` after the board's first frame. Until it loads, effects queue (bounded by the cap) and are dropped if older than their plan duration. The engine initialises once through `initParticlesEngine` with only `loadSlim`.
8. **Reduced motion.** The overlay uses `prefersReducedMotion` and `watchReducedMotion` from `effects.ts`. When true it renders only static `motion` elements, with no animation and no tsparticles mount.
9. **Tests.** Unit tests for presets, caps and ranking; component tests with tsparticles mocked, asserting the overlay is `aria-hidden` with `pointer-events: none` and that hidden tokens produce no emitter; Playwright verification of an attack, Hit, Miss, damage and the poisoned effect at desktop and mobile widths, including zoom and pan.

## Risks / Trade-offs

- **Bundle size and startup:** two libraries add weight. Mitigation: lazy load and tsparticles slim only.
- **Overlay drifting from the canvas on zoom or pan:** the overlay uses the same transform source as `ThrownDice` and updates on every view change; verified in Playwright.
- **Many conditioned tokens:** capped at 12 emitters, 30 fps, single canvas.
- **tsparticles v3 API churn:** pin versions and keep all tsparticles options inside `effectPresets.ts`.
- **Stale effect flash after lazy load:** drop effects older than their plan duration.

## Migration Plan

Client-only and behind no flag: ship the overlay and remove the Pixi effect drawing in the same change. Rollback is reverting the change; no data or protocol is touched.

## Open Questions

- Should a "burning" condition be added later so fire visuals have a home? That needs a shared schema change and an ADR, so it is out of scope here.
