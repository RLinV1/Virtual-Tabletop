## Context

See proposal.md for the why. This builds directly on `attack-targeting`, which is implemented on `feat/attack-targeting` but not yet archived.
- **Rolls today.** `DiceRoll.attack = { actor, target, label }`, where each side is `{ tokenId, name, hidden } | null`. The server fills in names and hidden flags. Players get a hidden side as `null`, and `reduce` marks a side hidden for good once its token is hidden.
- **State keeps only recent rolls.** `state.rolls` holds the last `ROLL_LOG_LIMIT` (30) rolls. Older rolls exist only in the event log.
- **HP changes.** `token.setStats` → `TokenStatsSet { tokenId, stats, previous }`, allowed for the token's owner or the GM. HP ranges from −999 to 9999. The web quick buttons let HP go negative.
- **Play tab.** Holds My tokens, the Attack section (`AttackPanel.tsx`) and Initiative. The Dice tab's `RollRow` renders the log with `formatAttackRoll`.
- **Visibility.** `filterEventForViewer` decides pass, redacted or resync per event, given the state before the event. GM-only rolls are dropped or redacted for players.
- **Undo (FR-REC-02)** is not built. Events still carry what they replace, for when it is.

## Goals / Non-Goals

**Goals:**
- A ruling and a damage application are ordinary commands, authorized on the server and recorded as events.
- Applying damage can't double-apply or work from stale HP.
- No new path for hidden information to reach players.

**Non-Goals:**
- Any hit/miss logic, suggestion or AC comparison on the server. The GM sees AC as plain text.
- A ruling queue stored in state. The Rulings list is derived from `state.rolls`.

## Decisions

### 1. The roll type lives on the attack context
- `AttackContext` gains `kind: "toHit" | "damage"`, with a zod `.default("toHit")`. Every stored `DiceRolled` without it parses as To hit, so no migration is needed.
- `dice.roll.attack` gains an optional `kind` with the same default. `decide` copies it through unchanged.
- **Alternative: don't distinguish.** Every roll would offer both Hit/Miss and Apply. The GM's list would be twice as busy, and players would see "Waiting for the GM" on damage rolls. Rejected; the user chose this option.
- **Alternative: infer the type from the label** ("Damage…"). Fragile and language-bound. Rejected.
- The type is informational. It changes which actions the GM is offered and how the roll reads; the server gates nothing else on it. A player who mislabels a roll only changes the GM's list.

### 2. The verdict lives on the roll, set by a new event
- **Command:** `roll.rule { rollId, verdict: "hit" | "miss" | null }`. `null` clears the verdict.
- **Event:** `RollRuled { rollId, verdict, previous }`, carrying the replaced verdict (invariant 6).
- `DiceRoll` gains an optional `verdict: "hit" | "miss"`. Absent means not ruled.
- `decide` checks, in order:
  1. The actor is the GM (`can.administer`), otherwise `forbidden`.
  2. The roll is in `state.rolls`, otherwise `not_found` ("That roll is too old to rule on").
  3. It has attack context of kind `toHit`, otherwise `invalid`.
  4. The verdict differs from the current one, otherwise `invalid`.
- Stored events are loaded by a cast, not parsed, so the `kind` default never runs on replay. `reduce` fills in `kind: "toHit"` on `DiceRolled` for an attack roll without one. Otherwise attack rolls stored before this change would be treated as damage rolls and could never be ruled.
- `reduce` maps over `state.rolls` and sets or clears the verdict. If the roll isn't there, it does nothing rather than throwing. `decide` already guarantees the roll exists when the event is made, and doing nothing keeps replay safe if `ROLL_LOG_LIMIT` ever shrinks.
- **Alternative: a separate `rulings` map in state.** It would need its own trimming to follow the roll window, and its own filtering. Keeping the verdict on the roll means it is filtered, trimmed and rendered together with the roll.

### 3. Applying damage is a server command that emits two events
- **Command:** `roll.applyDamage { rollId }`, GM only.
- `decide` checks:
  - the roll is in `state.rolls` (`not_found`);
  - it is a damage roll (`invalid`);
  - `damageApplied` is not already set (`invalid`);
  - the target token still exists (`not_found`);
  - the target's `hp` is not `null` (`invalid`).
- It then emits, in order:
  1. `TokenStatsSet { tokenId, stats: { ...stats, hp: max(−999, hp − amount) }, previous: stats }`, the existing event, so the existing visibility, reducer and log handling apply as they are. It is left out when HP wouldn't change (zero damage, or already at −999), so there is no no-op stats event.
  2. `RollDamageApplied { rollId, amount }`, where `amount = max(0, roll.total)`. `reduce` sets `damageApplied: true` on the roll, doing nothing if the roll is missing.
- `amount` is recorded so the log reads "7 damage" without looking at the roll again.
- There is no floor at 0 HP. The app is system-agnostic, and the existing quick buttons allow negative HP.
- **Alternative: the client sends `token.setStats` with HP it calculated itself.** It works from HP that may be stale, a double tap applies twice, and nothing links the change to the roll. Rejected.
- **Alternative: one new event holding both changes.** It would duplicate the stats handling and its hidden-token filtering. Rejected.

### 4. Visibility of the new events
- `filterEventForViewer`, for players: `RollRuled` and `RollDamageApplied` look up their roll in the state before the event. If the roll is GM-only, or not found, the event is `redacted`. Otherwise it passes, with one exception: a `RollDamageApplied` whose target side is concealed (`hidden` on the roll, or hidden before the event) is also `redacted`. "Applied" beside an Unknown target would say the hidden token still exists and tracks HP. Coming straight after a `TokenStatsSet` that players *can* see, when the token was revealed first, it would also name the target.
- `filterStateForViewer` drops `damageApplied` from a player's copy of a roll whose target it blanks, so snapshots agree with the live events.
- Neither event carries token IDs or names, so passing them reveals nothing about hidden tokens. A player's copy of the roll already shows hidden sides as Unknown.
- `TokenStatsSet` keeps its existing rule: redacted when the token was hidden before the event.
- Otherwise `filterStateForViewer` needs nothing new. GM-only rolls are already dropped, and verdicts on public rolls are safe to show: the verdict is the GM's public ruling on a roll the players saw.
- A player's client may hold a public roll that has already left the server's 30-roll window. A `RollRuled` for a roll the client lacks is a no-op in `reduce` there too.

### 5. Activity log
`formatActivity` finds the roll in the state before the event, and uses the names stored on the roll:
- "Dana ruled Aria → Goblin (1d20+5: 17) a hit";
- "…changed the ruling on Aria → Goblin (1d20+5: 17) from a hit to a miss";
- "…cleared the ruling on…";
- "Dana applied 7 damage from Aria → Goblin".

If the roll is missing, it falls back to "an earlier roll". The existing `TokenStatsSet` sentence follows the damage line.

### 6. Web UI
- **Pure helpers in `panels/attackRoll.ts`, unit-tested:**
  - `AttackSettings` and `SavedAttack` gain an optional `kind`. Stored values without it read as `toHit`, and the validators accept both.
  - `pendingRulings(state)` returns the rolls the Rulings list should show: to-hit rolls without a verdict, and damage rolls not yet applied whose target exists and tracks HP, newest first, each with the target's AC or HP.
  - `damageAmount(roll)` returns `max(0, total)`.
- **`formatAttackRoll`** (shared) appends " · Hit", " · Miss" or " · Applied". A damage roll with no label reads "damage" in the label's place.
- **`AttackPanel`:**
  - A **To hit | Damage** toggle (two `aria-pressed` chips) above Dice. The Roll button reads "Roll 1d20+5 to hit Goblin" or "Roll 1d8+3 damage to Goblin".
  - `LatestAttack` shows the outcome: "Waiting for the GM", Hit, Miss, or Applied.
  - After a Hit, **Roll damage** calls back into the form. It sets `kind: "damage"` and applies the first saved attack with `kind === "damage"` for that token, if there is one. The target is unchanged and nothing is rolled.
- **New `RulingsPanel.tsx`,** rendered by `RoomPanel` at the top of the Play tab for the GM only:
  - One row per pending roll: the roll line, "AC 13" or "12/15 HP", and **Hit / Miss** or **Apply −7**.
  - The buttons send `roll.rule` and `roll.applyDamage`. A refusal shows inline.
  - When nothing is pending, a muted "Nothing to rule on."
- **`DicePanel`:** for the GM, `RollRow` shows small Hit/Miss toggles on to-hit attack rolls. Pressing the current verdict clears it. This is how the GM corrects rulings after a roll leaves the Rulings list.
- **No optimistic updates.** Every change arrives through the server event, as elsewhere.

## Risks / Trade-offs

- **[Only the last 30 rolls can be ruled or applied]** → Those are the only ones in state, the list and the log. An older roll is refused as not found with a clear message. Acceptable during play.
- **[Changing a Hit to a Miss after damage was applied doesn't restore HP]** → Deliberate. The app never infers damage from verdicts. The GM fixes HP in the roster; undo will cover it once FR-REC-02 exists.
- **[Applying a GM-only damage roll to a visible target shows players an HP drop]** → Players see the drop, and a redacted seq right after it, so they can tell it came from a hidden roll and work out its total. This is the same as the GM editing HP by hand. The GM should roll publicly or edit HP directly if that matters.
- **[A visible HP drop can match a public roll's total]** → When a target is visible, or revealed before applying, players see its HP change. Even with "Applied" withheld, a drop equal to a public roll's total can hint at a link. That can't be removed without refusing the command, and is accepted.
- **[Players can read AC and HP from token stats today]** → An existing gap, out of scope. The Rulings list shows AC to the GM only, but that hides nothing new.
- **[The type is chosen by the roller]** → A wrong type only changes which buttons the GM gets. The GM can still judge the number, and the player can re-roll with the right type.

## Migration Plan

- `kind` has a default, and `verdict` and `damageApplied` are optional, so existing rooms and event logs replay unchanged.
- **Rollback:** older builds use non-strict zod objects, so they drop the new fields. But `assertNever` in an old reducer would throw on `RollRuled` and `RollDamageApplied`. The web and server must deploy together, as for every event addition (see ADR 0007).
- **Order:** ADR 0011 needs approval before the shared schema change merges. `attack-targeting` should merge and be archived first.
