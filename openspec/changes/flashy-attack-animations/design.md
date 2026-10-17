## Context

`attackEffectFor` (`board/effects.ts`) already maps live events to a small `AttackEffect` per viewer under the FR-GM-23 visibility rules. `EffectsOverlay.tsx` draws it as DOM (framer-motion, tsparticles) above the Pixi canvas. HP damage today is `roll.applyDamage` → `TokenStatsSet` + `RollDamageApplied`. Batches containing `TokenStatsSet` are undoable only if they also contain `RollDamageApplied` (`undo.ts: canUndo`). The attack roll has no notion of weapon style.

## Goals / Non-Goals

**Goals:** distinct, flashy melee / ranged / magic strikes; a GM-only map-wide nuke with real damage; presets as plain data; all within the event pipeline and visibility rules.

**Non-Goals:** the in-game animation editor (a later project; presets are shaped to allow it); per-creature custom effects; sound; persisting effect choices per token.

## Decisions

1. **Add `pixi-filters`, nothing else.** It supplies `ShockwaveFilter` and `AdvancedBloomFilter` and is compatible with Pixi v8. Slashes, projectiles and bursts use `Graphics` and Pixi's built-in `ParticleContainer` (documented as experimental, so the particle code sits behind one small helper in `fx.ts`). Rejected: `@pixi/particle-emitter` (v8 support unverified), more tsparticles presets (not suited to a board-wide blast), GSAP (the Pixi ticker and existing framer-motion cover tweening).

2. **New `board/fx.ts` inside the Pixi board.** Filters apply to Pixi display objects, not DOM, so strikes and the nuke must live in Pixi. `BoardView` owns it, which also honours "Pixi code stays in `board/`". The DOM overlay keeps conditions, hit/miss and damage numbers. Tradeoff: the strike moves from DOM to Pixi, and its tests move with it.

3. **Presets are plain data.** `effectPresets.ts` exports `ATTACK_STYLE_PRESETS: Record<AttackStyle, StrikePreset>` and `NUKE_PRESET`: only JSON-serializable numbers, strings and arrays, validated by a zod schema. `fx.ts` is the only interpreter. A future editor edits that data and needs no engine change. No editor code, storage or UI is added now.

4. **Style is an optional field on `AttackContext`.** `style: AttackStyle.optional()` is backward compatible with stored events. The roll command's attack field gains the same optional field. When absent, `attackEffectFor` infers melee or ranged from distance in grid cells (≤ 1.5 is melee). Rejected: guessing from the attack label (fragile), a per-creature attack preset field (wider change, not requested).

5. **Nuke is a command, not an ephemeral relay.** `nuke.detonate { amount, origin }` → `decide` (GM only; `presetRefusal` for attacks) → one `TokenStatsSet` per damaged token + `MapNuked { amount, origin }`. HP is computed in `decide` from current HP and floored at `MIN_HP`. Invariants 1–3, 5, 6 hold: `reduce` treats `MapNuked` as a log-only event, and each `TokenStatsSet` carries `previous`. Two nukes are two separate actions by design.

6. **`MapNuked` names no token.** Like `RollDamageApplied`, it can then pass through `filterEventForViewer` unchanged. Hidden tokens' `TokenStatsSet` are already withheld from players by the existing filter. The client builds damage numbers from the viewer's own token copies by comparing HP before and after the batch, so a hidden token never gets a number.

7. **Undo.** Add `MapNuked` to `REVERSIBLE_EVENT_TYPES` with inverse `MapNukeUndone` (new, carries the same amount and origin). Extend `canUndo` so a batch with `TokenStatsSet` is also undoable when it contains `MapNuked`. The existing stale-value conflict check covers a later HP edit. The client plays no effect for `MapNukeUndone`.

8. **Performance.** Filters are attached to the board's world container only while a blast plays (about 1.5 s) and removed on finish. Concurrent attack effects stay capped by `MAX_ATTACK_EFFECTS`; one blast at a time. Particle counts come from the preset and are clamped by a constant.

9. **Reduced motion** reuses `prefersReducedMotion` / `watchReducedMotion` from `effects.ts`: static markers for strikes, a static tint plus numbers for the nuke.

## Risks / Trade-offs

- Whole-map filters can drop frames on weak GPUs → short duration, removed immediately, no looping.
- `ParticleContainer` is experimental in Pixi → isolated in one helper; fall back to plain `Sprite`s if it breaks.
- Moving the strike from DOM to Pixi changes the existing `board-effects-react-overlay` seam → keep `attackEffectFor` and `attackPlan` as the pure contract and port only the drawing.
- The nuke is one click and powerful → confirm dialog before sending; undo available.
- Schema changes need ADR 0038 and architecture-owner review before merge.

## Migration Plan

Additive only: new optional field, new command, new events. Old events replay unchanged. Rollback = revert the commits; stored `MapNuked` events would then fail to parse, so ship the shared schema first and keep it once any room has used it.

## Open Questions

- Should the nuke show a preview of tokens that would fall to the floor? Assumed no for v1: a plain confirm dialog.
- Should players see who detonated? Assumed no: the activity log reads "GM detonated a nuke (12)".
