# ADR 0038: Attack styles, the GM nuke, reduced animations and library animations

**Status:** Proposed - needs review by the Real-Time Architecture owner · **Changes:** `openspec/changes/flashy-attack-animations`
**Owner:** Real-Time Architecture (Raymond)

## Context

Every attack played one built-in strike. GMs asked for distinct melee, ranged and magic looks, a GM-only map-wide "nuke" that does real damage, a way to turn animations down for the whole table, and their own animations kept in the asset library.

## Decision

**Animations are data.** `AnimationDef` (`packages/shared/src/animation.ts`) is a flat, bounded zod object: a shape (19 strike shapes plus `nuke`), duration, colours, size, particles, glow, shake, flash, and optional motion settings (count, spread, arc, trail, spin, gravity, rings, accent, particle look). Optional fields read as the shape's default preset, so older stored definitions still parse. One renderer in `apps/web/src/board/fx.ts` plays any definition; built-ins are values of the same type.

**Schema changes to existing types** (all additive and optional):
- `AttackContext.style?: "melee" | "ranged" | "magic"`, sent with `dice.roll`.
- `AttackContext.animation?` and `AttackPreset.animation?` (a strike definition, never `nuke`). `decide` copies the actor's matching named attack's animation onto the roll; any animation a client sends on a roll is stripped by the command schema.
- `RoomState.reducedEffects: boolean` (public, default false), set by the GM-only `room.setReducedEffects` → `ReducedEffectsSet { enabled, previous }`.

**New command and events.** GM-only `nuke.detonate { amount 1–999, origin, animation? }` emits one `TokenStatsSet` per token with HP (hidden ones included, each with `previous`), then `MapNuked { amount, origin, animation? }`. `MapNuked` names no token and passes every filter unchanged; the existing filters already redact a hidden token's `TokenStatsSet` from players, and each board draws numbers only on tokens in its own copy. `MapNuked` is reversible: its inverse `MapNukeUndone` plays nothing, and `canUndo` accepts a stats batch that contains `MapNuked`.

**Library.** New table `library_animations` (migration 0016), GM-owned, at most 100 per owner (count and insert under a per-owner advisory lock). Routes `GET/POST /api/library/animations`, `PATCH/DELETE /api/library/animations/:id`; creating needs an account, another owner's id answers 404, every write is parsed with `AnimationDef`. Library animations are copied into attacks, never referenced, so players need no library access and later library edits never change a room.

## Consequences

Rolls carry up to one small definition each (bounded by the schema and the roll log limit). Effective reduced motion is the viewer's OS preference OR the room setting; the room setting cannot turn a viewer's own preference off. `pixi-filters` is added for the nuke's shockwave; glow is a blurred additive copy of the effect, not a bloom filter.
