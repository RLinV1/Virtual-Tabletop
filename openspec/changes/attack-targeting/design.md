## Context

See proposal.md for why. What exists today:

- **`dice.roll { expression, visibility }`** → `DiceRolled { roll }`. Here `roll` is `{ id, expression, byParticipantId, dice, modifier, total, visibility }`, and `RoomState.rolls` keeps the last `ROLL_LOG_LIMIT` rolls. `decide` only checks that `gm` visibility is GM-only. `filterStateForViewer` drops `gm` rolls, and `filterEventForViewer` redacts them.
- **Pings** are ephemeral (`{ type: "ping", at }`) and sent through `connection.ephemeral` from `Board.tsx`.
- **The board has no token selection.** A token press starts a drag only when the tool is `select`. Otherwise the press falls through to the stage, which is how Measure and Area work over tokens. `place-token-on-board` added a similar temporary mode (`placement`) that ignores the rail tools and ends with `Esc` or a right-click.
- **Token controls live in the panels.** My tokens lists owned tokens; the GM's roster lists every token.
- **Hidden tokens** are in the GM's state and absent from players' state. A player can only learn of one through a missing filter.

## Goals / Non-Goals

**Goals:**
- One roll record that says who attacked whom, which survives reloads, renames and deletions.
- No new path by which a hidden token's ID or name reaches a player.
- Reuse the dice pipeline, the roll log, the 3D dice tray and GM-only rolls unchanged.

**Non-Goals:**
- Any rule knowledge on the server. The server checks who may attack with what, never whether an attack is legal by the game's rules.
- Syncing the targeting line (later ephemeral work).

## Decisions

### 1. Extend `dice.roll` instead of adding an `attack.roll` command
The command gains an optional `attack: { actorTokenId, targetTokenId, label? }`, and `DiceRoll` gains an optional `attack`.
- **Alternative:** a new `attack.roll` command with an `AttackRolled` event. It is cleaner in isolation, but it would duplicate expression parsing, randomness, GM-only handling, the roll log, the dice tray and the activity log line.
- **Why this option:** an attack roll *is* a dice roll with a caption, and phase 2's "Roll damage" button will reuse the same context.
- **Cost:** it changes an existing schema, so it needs ADR 0010 and the Real-Time Architecture owner's review.

### 2. The event stores token names and whether each token was hidden, filled in by `decide`
The client sends only IDs and a label. `decide` resolves the tokens and writes:

```
roll.attack = {
  actor:  { tokenId, name, hidden } | null,
  target: { tokenId, name, hidden } | null,
  label:  string | null,
}
```

- `decide` always writes both sides. `null` appears only in player-filtered copies (Decision 3).
- `name` is copied at roll time, so the roll log reads correctly after a rename or delete. The roll panel renders from `state.rolls`, which has no event replay to recover old names. This follows the carry-the-old-value principle of invariant 6.
- **Alternative:** store IDs only and look names up at render time. That breaks on deletion.
- `hidden` records whether that token was hidden when rolled. `reduce` also sets it on `TokenHiddenSet { hidden: true }`, and it is never cleared. It means "players must never see this side".
- **Label:** trimmed, max 40 characters, empty becomes `null`.

### 3. Players get the hidden side replaced by `null`
- **`filterStateForViewer`**, for a player, maps public rolls. An attack side becomes `null` when either:
  - its `hidden` flag is set (hidden at roll time or at any point since), or
  - its token is currently hidden.

  A token that was only ever visible, even once deleted, keeps its name, which the player already saw. A token that was hidden stays `null` after a reveal, rename or delete. Otherwise:
  - a rename-then-reveal would show the name it had while hidden;
  - a hide-then-delete would tell players the hidden token is gone.
- **`filterEventForViewer`:** for a public `DiceRolled` where either side has `hidden: true`, or names a token hidden in the pre-event state, it returns `resync`, so the filtered snapshot carries the stripped roll. `gm` rolls stay `redacted`.
  - **Alternative:** add an "event with rewritten payload" kind to `FilteredEvent`. That widens a contract every event goes through, just for one rare case: the GM attacking in public with a hidden token.
  - **Why resync is enough:** it already exists for reveals and initiative, and costs one snapshot.
- **Hide or reveal after the roll:** `TokenHiddenSet` already causes a resync, so state filtering covers hiding a token after its roll with no extra event handling.
- **GM view:** the GM always gets rolls unfiltered.

### 4. Authorization: `can.attackWith` = owner or GM
It matches `moveToken` but is named separately, so the rule can diverge later.
- **Checks, in order:**
  1. The attacker exists and is visible to the actor (hidden counts as `not_found` for players).
  2. `can.attackWith` passes, else `forbidden`.
  3. The target exists and is visible, else `not_found`.
  4. The target differs from the attacker, else `invalid`.
  5. The existing visibility and expression checks.
- The server does not check the expression, turn or range. The Attack section's dice picker chooses the expression, so a damage roll goes through the same command as the attack roll.

### 5. Targeting is a board tool that the rail doesn't show
- `BoardTool` gains `{ kind: "attack"; attackerId }`.
- The Attack section's **Pick on board** calls `BoardHandle.startAttack(tokenId)`, which remembers the current tool and switches to it. Leaving targeting (`Esc`, right-click, a pick, or the attacker disappearing from state) restores the remembered tool.
- A pick is reported through a new `Board` prop, `onPickTarget(attackerId, targetId)`. It no longer opens a dialog.
- `BoardHandle` also gains `showPing(at)`, so the section can show its own ping locally (the relay doesn't echo pings to the sender).
- **Why a tool and not a `placement`-style flag:** the tool machinery already swaps cursors, clears marks on change, and routes token presses to the stage.
- **In `BoardView`:**
  - The crosshair cursor is added to `TOOL_CURSORS`.
  - The hovered target is found by hit-testing token discs from state on pointer move. Tokens the viewer can't move have no pointer events of their own, so per-token `pointerover` would miss them.
  - The line and distance label are drawn in the overlay layer using `measure(attackerCenter, targetCenter, grid, false)`.
  - A left press on a token other than the attacker calls a new `pickTarget(tokenId)` callback.
  - Pixi stays in `board/`, per the conventions.
- **Distance:** center to center, snapped. That is exact for 1-cell tokens and a hint for large ones.

### 6. The Attack section
A new `panels/AttackPanel.tsx`, rendered in the Play tab by `RoomPanel` below My tokens. React only; it never touches Pixi.
- **Shared target.** `RoomPage` holds `{ attackerId, targetId }`. It passes it to `AttackPanel` and sets it from `Board`'s `onPickTarget`, since the board and the section are siblings.
  - The target is dropped when it leaves the viewer's state (deleted, or hidden from a player) or when it becomes the attacker.
  - It is kept after a roll: the target lock.
  - **Alternative:** keep the target inside `Board`. That would make the board own form state it never shows.
- **Attacker list.** Tokens passing the client-side `can.attackWith` hint. The preselection is the viewer's token with the active turn, else the first.
- **Target list.** Visible tokens other than the attacker, sorted by `measure(attacker, token, grid, false).units`. `targetsByDistance` is a pure helper in `panels/attackRoll.ts`, unit-tested without React.
- **Dice picker.** Die-type buttons (d4, d6, d8, d10, d12, d20, d100), a count stepper (1–20) and a modifier input (−99…99). `attackExpression({ count, sides, modifier })` builds `NdX`, `NdX+M` or `NdX-M`, which `parseDiceExpression` always accepts.
  - **Alternative:** a free-text expression, as in the Dice tab. It is more flexible but slower, and it can produce invalid input.
- **Browser-local memory** via `usePersistentState`, validated on read like every other key:
  - `vtt.attack.last`: `tokenId → { count, sides, modifier, label }`, the settings last rolled with that token. It replaces the unreleased `vtt.attack.bonus`, which is simply ignored.
  - `vtt.attack.saved`: `tokenId → { name, count, sides, modifier, label }[]`, at most 8 per token. The name defaults to the label, or else to the expression.
  - Both hooks live in `AttackPanel`, which stays mounted with the Play tab, so a save always lands. The earlier dialog lost its save when it unmounted in the same update.
- **Roll:**
  1. `connection.command({ type: "dice.roll", expression, visibility, attack })`.
  2. Only if the roll is accepted and `shouldPingTarget` passes (a public roll with a visible target), send the ping at the target's current center and show it locally with `BoardHandle.showPing`. The check reads the connection's state *after* the ack, not the token as it was when Roll was pressed. Otherwise a hide landing while the roll is in flight would still be pinged; every event before the roll arrives ahead of its ack. A double-click or double-tap that ends a board pick is not a ping, for the same reason. The ping is never sent before acceptance or for a hidden target: the relay does not filter pings, so that ping would show players where the target stands.
  3. Refusals show inline in the section.
- **Result.** The section shows the viewer's latest attack roll (latest `state.rolls` entry by them with attack context) in the existing `DiceTray` and a `RollRow`-style line. They share the tray's landing behaviour with `DicePanel`.
- **GM notes.**
  - A **GM-only** checkbox.
  - When the roll would be public and a hidden token is involved, a note warns that players will see the label.
- **Removed:** `AttackDialog.tsx`, `AttackButton.tsx`, and the Attack buttons in `MyTokens` and `TokenRoster`.

### 7. Display
- `formatAttackRoll(roll)` in `packages/shared` builds "Aria → Goblin 2 · Longsword · 1d20+5 = 17", with "Unknown" for a `null` side. The roll log and the activity log share it.
- The activity log sentence is "Tomas rolled an attack: Aria → Goblin 2 with Longsword, 1d20+5: 17", plus " (GM only)" as today.

## Risks / Trade-offs

- **[Public roll with a hidden attacker reveals something]:** the label, e.g. "Shadow claws". It is the GM's choice to roll publicly. → The Attack section shows a note when the GM picks public with a hidden token.
- **[Phones: Pick on board is covered]:** on a compact layout the sidebar sits over the board. → The distance-sorted target list is the primary way to pick there. Pick on board still works once the sidebar is closed.
- **[Saved attacks are per browser]:** a player on a new device starts with none. → Stated in the section. Syncing them would need room or account state (a non-goal).
- **[Resync per public hidden-token attack]:** one snapshot per player. This is rare and GM-driven. → Acceptable, and the same cost as a reveal.
- **[Nullable sides exist only for filtered copies]:** the schema allows a state `decide` never produces. → `decide` tests assert both sides are always present, and the client renders `null` as "Unknown".
- **[Token stats are not filtered]:** AC and HP are visible to players today. → Out of scope here. This feature deliberately never shows AC.
- **[Old client, new server]:** an old reducer passes through a `DiceRolled` with `attack` and ignores the field. → Nothing breaks. The coordinated web and server deploy is as usual.

## Migration Plan

- `attack` is optional on both the command and `DiceRoll`, so no data migration is needed. Existing event logs replay unchanged.
- **Rollback:** older code parses `DiceRoll` with a non-strict zod object, so it drops the unknown `attack` key and shows the roll as a plain roll.
- **Merge order:** ADR 0010 must be approved before the `packages/shared` schema change merges.
