## Why

Attacks on the board play one plain animation for every token: a generic strike line, then a flash. A sword swing, an arrow and a fireball all look the same, and nothing in the product lets a GM make a big dramatic moment. Flashier, readable effects make the table feel alive, and a GM-only "nuke" gives the GM a showpiece that also applies real area damage.

## What Changes

- **Attack styles.** An attack roll may carry a style: `melee`, `ranged` or `magic`. The attack panel gets a three-way style picker. When none is chosen the client infers it from distance (adjacent target is melee, farther is ranged). Each style plays its own effect: a glowing sword slash arc, a projectile with a trail, and a charged magic bolt with a burst. Hit, miss and damage endings keep their current behaviour.
- **Pixi effects layer.** The strike part of an attack is drawn by a new `board/fx.ts` module inside the PixiJS board, using `Graphics` and Pixi's built-in `ParticleContainer`, with `pixi-filters` (`AdvancedBloomFilter`) for glow. The DOM `EffectsOverlay` keeps condition effects and the hit, miss and damage-number endings.
- **GM nuke.** A new GM-only command `nuke.detonate` (amount, epicenter) damages every token that has HP. It emits one `TokenStatsSet` per token (each carrying the stats it replaced) plus a new `MapNuked` event. Every viewer's board then plays a full-map blast: expanding shockwave (`ShockwaveFilter`), bloom, flash, screen shake and a floating damage number on each token the viewer can see.
- **Presets as data.** Every look (colours, durations, particle counts, sizes) lives as a plain, serializable object in `effectPresets.ts`, so a later in-game animation editor can edit them. The editor itself is out of scope.
- **Undo.** The nuke is one undoable action: undo restores every token's HP. Undo does not replay the visual.
- **Dependency.** Add `pixi-filters` to `apps/web`. No other new dependency.
- **Schema change** in `packages/shared` (`AttackContext.style`, `nuke.detonate`, `MapNuked`, `MapNukeUndone`): needs an ADR (0038) and Real-Time Architecture owner review.

## Capabilities

### New Capabilities

- `gm-nuke`: the GM-only whole-map blast, its damage, its visibility rules, undo and reduced-motion behaviour.

### Modified Capabilities

- `board-attack-effects`: the attack animation is no longer one built-in default; it depends on the attack's style.
- `attack-rolls`: adds the optional attack style and its picker.

## Impact

- `packages/shared`: `dice.ts` (`AttackStyle`, `AttackContext.style`), `commands.ts` (`nuke.detonate`, style on the attack roll command), `events.ts` (`MapNuked`, `MapNukeUndone`), `decide.ts`, `reducer.ts`, `undo.ts`, `visibility.ts`, `activityLog.ts`.
- `apps/server`: no new route; the existing command pipeline carries it. Integration tests added.
- `apps/web`: `board/effectPresets.ts`, `board/effects.ts` (`attackEffectFor` returns the style; add nuke effect), new `board/fx.ts`, `board/boardView.ts`, `EffectsOverlay.tsx` (strike moves out), attack panel style picker, GM nuke control, `package.json`.
- Docs: `docs/adr/0038-attack-styles-and-nuke.md`.
- Risk: `pixi-filters` on the whole world container is costly on weak GPUs, so the filters run only while a nuke plays.
