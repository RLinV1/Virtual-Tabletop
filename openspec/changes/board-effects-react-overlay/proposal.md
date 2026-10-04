## Why

The attack and condition animations drawn inside the PixiJS board (KAN-76) are plain: a dot travelling to the target, a flat flash, a few circles for poison. They read as placeholder art and do not give the table the flashy feedback a fight deserves. Hand-drawing richer particle and motion effects with Pixi `Graphics` is slow to author and hard to tune, whereas mature React libraries already do this well.

## What Changes

- **React effects overlay.** A new layer above the Pixi canvas, in the same position as the existing `ThrownDice` overlay, draws all attack and condition effects. It is positioned from the board's zoom and pan transform (`BoardView.onViewChange`) and token positions, never touches Pixi objects, and has `pointer-events: none`.
- **Libraries.** `framer-motion` drives one-shot motion (strike projectile with a trail, hit flash and impact ring, miss whiff, floating damage numbers). `@tsparticles/react` with `@tsparticles/slim` drives particles (hit sparks, poison bubbles, charm hearts, stun stars, paralysis sparks, concentration motes) through one shared particle canvas for the whole board.
- **Flashier effects.** Attack: a glowing projectile with a fading trail, then an impact burst of sparks on the target. Hit: a bright flash, expanding ring and spark burst. Miss: a visible whiff arc and "Miss" text. Damage: a larger, outlined "−N" that pops and rises. Conditions keep one fixed effect each, redone with particles (poisoned: rising green bubbles with a toxic glow).
- **Pixi keeps the token itself.** Art tilt, squash, greyscale, alpha and tremble (`artStyleFor`) stay in `boardView.ts`, because they change the token's own art. Pixi's old projectile, flash and condition decoration drawing is removed.
- **Unchanged rules.** `attackEffectFor`, `attackPlan` and `loopingConditions` remain the single source of truth for which events animate and for whom. Hidden-token rules (FR-GM-23), reduced motion, the effect cap and "effects never move tokens" all still hold.
- **Client-only.** No commands, events, state or schema changes, so no ADR.

## Non-goals

- New conditions (for example "burning"): the 12 conditions in `@vtt/shared` are unchanged. Fire visuals need a later change that adds a condition.
- Sound, per-user effect choices, or animating snapshots and resyncs.
- Changing what the dice animation (`ThrownDice`) does.

## Capabilities

### New Capabilities
- `board-effects-overlay`: the React overlay that renders attack and condition effects above the board, its positioning, performance budget, input transparency, hidden-token safety and reduced-motion behaviour.

### Modified Capabilities
<!-- None in main specs: board-attack-effects is still an unarchived change. Its visual requirements are reimplemented, not altered. -->

## Impact

- **`apps/web/package.json`:** add `framer-motion`, `@tsparticles/react`, `@tsparticles/slim`, `@tsparticles/engine`.
- **`apps/web/src/board/`:** new `EffectsOverlay.tsx` (React, no Pixi) and `effectPresets.ts` (pure particle and motion configs); `effects.ts` describes condition decoration as preset ids; `boardView.ts` loses its attack projectile and condition decoration drawing but keeps art styling; `Board.tsx` mounts the overlay and feeds it effects.
- **Bundle:** tsparticles slim and framer-motion add weight, so the overlay loads lazily and the board paints first.
- **Tests:** vitest for the pure preset and plan helpers and overlay rendering with mocked particles; a Playwright check in the running app at desktop and mobile widths.
- **`packages/shared`, `apps/server`:** no change.
