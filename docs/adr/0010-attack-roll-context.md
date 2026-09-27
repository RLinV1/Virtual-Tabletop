# ADR 0010 — Attack context on dice rolls

**Status:** Proposed — awaiting review by the Real-Time Architecture owner · **Extends:** `docs/adr/0001-event-model.md`, `docs/adr/0003-tactical-state.md`
**Change:** `openspec/changes/attack-targeting` · **Requirements:** FR-TAC-05, FR-TAC-09, FR-GM-22, FR-GM-23

## Context

An attack at the table is a ping, a `1d20+N` roll and a sentence in voice chat. The roll log keeps only the roll ("Aria rolled 1d20+5: 17"), so once the ping fades nobody can tell who attacked whom. The Attack action (`attack-targeting`) lets a participant pick an attacking token and a target on the board and roll. The roll needs to remember both tokens and an optional label ("Longsword").

README §7 excludes attack resolution. The server must not learn rules: no AC comparison, no damage, no turn or range enforcement. It only has to record what the roll was for and keep hidden tokens hidden (FR-GM-23).

## Decision

Extend the existing `dice.roll` command and `DiceRoll` rather than add an `attack.roll` command. An attack roll is a dice roll with a caption. A separate command would duplicate parsing, randomness, GM-only rolls, the roll log, the dice tray and the activity log line. It would also leave the later "Roll damage" follow-up with two paths to choose from.

- **Command.** `dice.roll` gains optional `attack: { actorTokenId, targetTokenId, label? }`, where `label` is trimmed and at most 40 characters.
- **Event.** `DiceRoll` gains optional `attack: { actor: AttackSide | null, target: AttackSide | null, label: string | null }`, where `AttackSide` is `{ tokenId, name, hidden }`.
  - `decide` fills in `name` and `hidden` from state at roll time.
  - The roll panel renders from `state.rolls`, which has no event replay to recover an old name. Storing the roll-time name keeps "Goblin 2" readable after a rename or deletion, in the spirit of invariant 6.
  - `hidden` is also set by `reduce` whenever a named token is hidden later (`TokenHiddenSet`). Once set it stays set, so the filter never has to guess about a token that was since revealed, renamed or deleted.
  - `decide` always writes both sides. `null` only appears in player-filtered copies.
- **Authorization (`decide`, in order).**
  1. The attacker exists and is visible to the actor (`not_found` otherwise, the same as a missing token).
  2. `can.attackWith` passes: owner or GM (`forbidden` otherwise).
  3. The target exists and is visible (`not_found` otherwise).
  4. The target is not the attacker (`invalid` otherwise).
  5. The existing GM-only and expression checks.

  The expression, turn order and range are not checked.
- **Visibility (invariant 3).**
  - `filterStateForViewer`: for a player, an attack side of a public roll becomes `null` when `side.hidden` is set or its token is hidden now. A side that was ever hidden stays `null` after a reveal: showing it would give away the name the token had while hidden and that it was the hidden actor. A token that was only ever visible keeps its name even after deletion, which the player already saw.
  - `filterEventForViewer`: a public `DiceRolled` whose side has `hidden: true`, or names a token hidden in the pre-event state, becomes `resync`, so the player gets the stripped roll through a filtered snapshot. GM-only rolls stay `redacted`.
  - Hiding a token after its roll already causes a resync through `TokenHiddenSet`, and the state filter covers that case.
  - **Pings.** The client pings the target only for an accepted public roll whose target is visible. A ping on a hidden target would show players where it stands.
- **Activity log.** "Tomas rolled an attack: Aria → Goblin 2 with Longsword, 1d20+5: 17", plus " (GM only)" as for other rolls.

## Consequences

- **Backward compatible.** `attack` is optional on both schemas, so existing event logs replay unchanged and there is no migration.
  - Plain rolls behave exactly as before.
  - Code built before this ADR parses `DiceRoll` with a non-strict zod object. It drops the `attack` key and shows a plain roll, so rolling back is safe.
- **A deliberate exception to invariant 6.** `TokenHiddenSet { hidden: true }` also sets `hidden` on every roll side naming that token, and carries only the token's previous `hidden` flag, not the sides it changed. Undoing a hide later (a compensating `TokenHiddenSet { hidden: false }`) leaves those sides concealed, and that is intended: once players saw a side as Unknown, they must never get its name back.
- **Resync cost.** Only for a public roll that names a hidden token, a GM choice that should be rare. The cost is the same as a reveal.
- **Label is the GM's responsibility.** A public roll by a hidden attacker still shows its label ("Shadow claws"). The Attack section warns the GM about this.
- **Not covered here.**
  - A "Roll damage" follow-up, which reuses this same context.
  - A GM one-click apply-damage.
  - A live targeting line for other viewers: an ephemeral message under FR-SYNC-03 that would need its own `EphemeralPayload` change.
