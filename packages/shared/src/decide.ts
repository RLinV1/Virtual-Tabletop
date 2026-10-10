import type { Command, DepartureAction } from "./commands";
import { presetOf, tableForPreset } from "./gamePresets";
import { MIN_HP } from "./conditions";
import { formatExpression, parseDiceExpression, rollDice, type AttackContext } from "./dice";
import type { DomainEvent } from "./events";
import { encounterTable, type ResolvedEncounter } from "./encounters";
import { isSnapped, polygonArea, resizedTokenCenter, snapTokenCenter, spreadPositions, type GridSpec, type Point } from "./geometry";
import { canRenderGrid } from "./gridRenderLimit";
import type { SessionEndReason } from "./protocol";
import { inverseOf, undoableAction, undoConflict } from "./undo";
import { concealedFrom, fogConcealsSide, isInFog, templateConcealedFrom } from "./visibility";
import { MAX_GROUP_NAME, MAX_GROUPS, MAX_AREA_TEMPLATES, MAX_LINE_WIDTH_CELLS, MAX_CHECKPOINT_NAME, MAX_FOG_REGIONS, MAX_PLAYERS_PER_ROOM, tableOf, type AreaTemplate, type DiceLookOnTable, type Initiative, type Participant, type RoomState, type TableState, type Token } from "./state";

export type RejectionCode = "forbidden" | "not_found" | "invalid";

export type Decision =
  | { ok: true; events: DomainEvent[] }
  | { ok: false; code: RejectionCode; message: string };

export interface DecideContext {
  newId: () => string;
  /**
   * Float in [0, 1). Injected rather than taken from `Math.random` so `decide` stays
   * deterministic and testable (CLAUDE.md invariant 2). Only dice use it.
   */
  random?: () => number;
  /**
   * The look the acting participant's account owns under the id their `participant.setDiceLook`
   * names, read by the server before deciding (ADR 0018), or null when they own no such look or
   * hold their seat as a guest. Passed in, so `decide` stays pure.
   */
  ownedDiceLook?: DiceLookOnTable | null;
  /**
   * The board as it was at a checkpoint, rebuilt by the server from the log (ADR 0019). Filled
   * only for `checkpoint.restore`; null when the checkpoint can't be rebuilt.
   */
  checkpointTable?: (checkpointId: string) => TableState | null;
  /**
   * The encounter template `encounter.apply` names, read by the server for the acting GM's own
   * account and validated, with its map's address resolved (ADR 0024). Null when it isn't theirs,
   * doesn't exist, can't be read, or its map is gone.
   */
  encounterTemplate?: (templateId: string) => ResolvedEncounter | null;
  /** The room's last committed seq: where a checkpoint saved now points (ADR 0019). */
  lastSeq?: number;
}

/** Permission helpers. Shared so the UI can hide controls, but ONLY the server's check counts. */
export const can = {
  administer: (actor: Participant) => actor.role === "gm",
  moveToken: (actor: Participant, token: Token) =>
    actor.role === "gm" || token.ownerIds.includes(actor.id),
  /** Owners track their own resources; the GM tracks everyone's (FR-TAC-07). */
  editToken: (actor: Participant, token: Token) =>
    actor.role === "gm" || token.ownerIds.includes(actor.id),
  /** Only the GM may roll where players cannot see the result (FR-GM-22). */
  rollHidden: (actor: Participant) => actor.role === "gm",
  /** Whoever placed a template may remove it; the GM may remove any (ADR 0007). */
  removeTemplate: (actor: Participant, template: AreaTemplate) =>
    actor.role === "gm" || template.ownerId === actor.id,
  /** Only the GM rules on attack rolls and applies damage (ADR 0011). */
  ruleRolls: (actor: Participant) => actor.role === "gm",
  /** Who may roll an attack as this token: its owners and the GM (ADR 0010). */
  attackWith: (actor: Participant, token: Token) =>
    actor.role === "gm" || token.ownerIds.includes(actor.id),
};

/**
 * Keeps grid-aligned tokens in a cell when the grid changes (KAN-74, FR-TAC-02): each token that
 * sat snapped on the old grid moves to the nearest snapped spot on the new one, so it stays on
 * the same part of the map. Tokens placed off the grid on purpose are left where they are.
 */
function resnapToGrid(state: RoomState, grid: GridSpec): DomainEvent[] {
  const events: DomainEvent[] = [];
  for (const token of Object.values(state.tokens)) {
    if (!isSnapped(token.position, token.size, state.scene.grid)) continue;
    const to = snapTokenCenter(token.position, token.size, grid);
    if (to.x !== token.position.x || to.y !== token.position.y) {
      events.push({ type: "TokenMoved", tokenId: token.id, from: token.position, to });
    }
  }
  return events;
}

/**
 * Where a token goes when its size changes (KAN-74): a grid-aligned token keeps its top-left
 * cell and stays aligned for its new size. Off-grid tokens, unchanged sizes, and fractional
 * sizes (a footprint that isn't whole cells has no top-left cell to keep) stay put.
 */
function resizedPosition(state: RoomState, token: Token, size: number): Point {
  if (size === token.size || !Number.isInteger(size) || !Number.isInteger(token.size)) return token.position;
  if (!isSnapped(token.position, token.size, state.scene.grid)) return token.position;
  return resizedTokenCenter(token.position, token.size, size, state.scene.grid);
}

/**
 * Turns a validated command into events, or rejects it (FR-GM-15).
 * Pure: the server calls this inside its per-room ordered queue, then appends the events.
 */
export function decide(
  state: RoomState,
  actor: Participant,
  command: Command,
  ctx: DecideContext,
): Decision {
  switch (command.type) {
    case "scene.setMap":
      if (!can.administer(actor)) return forbidden();
      if (!canRenderGrid((command.grid ?? state.scene.grid).cellSize, command.map)) {
        return reject("invalid", "Grid cell size creates too many lines for this map.");
      }
      // One event, not MapSet + GridSet: a library map and its grid are one undoable step (ADR 0004).
      return accept(
        command.grid
          ? {
              type: "MapSet",
              map: command.map,
              previous: state.scene.map,
              gridChange: { grid: command.grid, previous: state.scene.grid },
            }
          : { type: "MapSet", map: command.map, previous: state.scene.map },
        ...(command.grid ? resnapToGrid(state, command.grid) : []),
      );

    case "scene.setGrid":
      if (!can.administer(actor)) return forbidden();
      if (!canRenderGrid(command.grid.cellSize, state.scene.map)) {
        return reject("invalid", "Grid cell size creates too many lines for this map.");
      }
      return accept(
        { type: "GridSet", grid: command.grid, previous: state.scene.grid },
        ...resnapToGrid(state, command.grid),
      );

    case "token.create": {
      if (!can.administer(actor)) return forbidden();
      const off = presetRefusal(state, { attacks: command.attacks.length > 0, conditions: command.conditions.length > 0, ac: command.stats.ac });
      if (off) return off;
      const ownerError = checkOwners(state, command.ownerIds);
      if (ownerError) return ownerError;
      if (!command.name.trim()) return reject("invalid", "Token name can't be blank.");
      if (command.stats.hp !== null && command.stats.maxHp !== null && command.stats.hp > command.stats.maxHp) {
        return reject("invalid", "Current HP cannot exceed maximum HP");
      }
      if (new Set(command.conditions).size !== command.conditions.length) return reject("invalid", "A condition is listed twice.");
      return accept(...createTokens(state, {
        name: command.name,
        position: command.position,
        size: command.size,
        rotation: normalizeRotation(command.rotation),
        color: command.color,
        imageUrl: command.imageUrl,
        assetId: command.assetId,
        ownerIds: command.ownerIds,
        hidden: command.hidden,
        stats: command.stats,
        conditions: command.conditions,
        ...(command.attacks.length > 0 ? { attacks: command.attacks } : {}),
      }, command.count, ctx));
    }

    case "token.duplicate": {
      if (!can.administer(actor)) return forbidden();
      const original = state.tokens[command.tokenId];
      if (!original) return notFound("token");
      // Everything but identity and the remembered initiative score, which belongs to the original.
      const { id: _id, initiative: _initiative, ...copy } = original;
      // Beside the original, never on it: its own square is the first spot the spread offers.
      const created = createTokens(state, copy, command.count, ctx, { besideOrigin: true });
      // Copies join the original's group, in the same action (KAN-82).
      const groupId = state.tokenGroups[original.id];
      const grouped: DomainEvent[] = groupId && state.groups[groupId]
        ? [{ type: "TokensGrouped", groupId, changes: created.flatMap((e) => (e.type === "TokenCreated" ? [{ tokenId: e.token.id, previous: null }] : [])) }]
        : [];
      return accept(...created, ...grouped);
    }

    case "group.create": {
      if (!can.administer(actor)) return forbidden();
      const name = command.name.trim();
      const invalid = groupNameProblem(state, name);
      if (invalid) return reject("invalid", invalid);
      if (Object.keys(state.groups).length >= MAX_GROUPS) return reject("invalid", `A room holds at most ${MAX_GROUPS} groups.`);
      return accept({ type: "GroupCreated", group: { id: ctx.newId(), name } });
    }

    case "group.rename": {
      if (!can.administer(actor)) return forbidden();
      const group = state.groups[command.groupId];
      if (!group) return notFound("group");
      const name = command.name.trim();
      if (name === group.name) return reject("invalid", "That is already the group's name.");
      const invalid = groupNameProblem(state, name, group.id);
      if (invalid) return reject("invalid", invalid);
      return accept({ type: "GroupRenamed", groupId: group.id, name, previous: group.name });
    }

    case "group.delete": {
      if (!can.administer(actor)) return forbidden();
      const group = state.groups[command.groupId];
      if (!group) return notFound("group");
      const members = Object.entries(state.tokenGroups).filter(([, g]) => g === group.id).map(([tokenId]) => tokenId);
      return accept({ type: "GroupDeleted", group, members });
    }

    case "group.assign": {
      if (!can.administer(actor)) return forbidden();
      if (command.groupId !== null && !state.groups[command.groupId]) return notFound("group");
      const missing = command.tokenIds.find((id) => !state.tokens[id]);
      if (missing) return notFound("token");
      const changes = [...new Set(command.tokenIds)]
        .map((tokenId) => ({ tokenId, previous: state.tokenGroups[tokenId] ?? null }))
        .filter((c) => c.previous !== command.groupId);
      if (changes.length === 0) {
        return reject("invalid", command.groupId === null ? "Those tokens are not in a group." : "Those tokens are already in that group.");
      }
      return accept({ type: "TokensGrouped", groupId: command.groupId, changes });
    }

    case "token.move": {
      const token = state.tokens[command.tokenId];
      // A player asking about a token they can't see (hidden, or under fog) gets the same answer
      // as a missing one, so rejections don't leak that it exists (FR-GM-23, ADR 0016).
      if (!token || concealedFrom(state.fog, token, actor)) return notFound("token");
      if (!can.moveToken(actor, token)) return forbidden();
      return accept({
        type: "TokenMoved",
        tokenId: token.id,
        from: token.position,
        to: command.to,
      });
    }

    case "token.configure": {
      const token = state.tokens[command.tokenId];
      if (!token || concealedFrom(state.fog, token, actor)) return notFound("token");
      if (!can.editToken(actor, token)) return forbidden();
      const changes = command.changes;
      const gmFields = changes.name !== undefined || changes.position !== undefined || changes.size !== undefined ||
        changes.rotation !== undefined || changes.imageUrl !== undefined || changes.assetId !== undefined ||
        changes.ownerIds !== undefined || changes.hidden !== undefined;
      if (gmFields && !can.administer(actor)) return forbidden();
      const off = presetRefusal(state, { conditions: (changes.conditions?.length ?? 0) > 0, ac: changes.stats?.ac ?? null });
      if (off) return off;
      if (changes.name !== undefined && !changes.name.trim()) return reject("invalid", "Token name can't be blank.");
      if (changes.stats && changes.stats.hp !== null && changes.stats.maxHp !== null && changes.stats.hp > changes.stats.maxHp) {
        return reject("invalid", "Current HP cannot exceed maximum HP");
      }
      if (changes.ownerIds) {
        const ownerError = checkOwners(state, changes.ownerIds);
        if (ownerError) return ownerError;
      }
      const imageUrl = changes.imageUrl;
      const assetId = changes.assetId;
      const imageChanged = imageUrl !== undefined || assetId !== undefined;
      if (imageChanged && (imageUrl === undefined || assetId === undefined)) {
        return reject("invalid", "Image URL and asset must be changed together.");
      }
      if (imageUrl === null && assetId !== null) {
        return reject("invalid", "An image asset requires an image URL.");
      }

      const name = changes.name === undefined ? token.name : uniqueTokenName(state, changes.name, token.id);
      const size = changes.size ?? token.size;
      const rotation = changes.rotation === undefined ? token.rotation : normalizeRotation(changes.rotation);
      const position = changes.position ?? resizedPosition(state, token, size);
      const moved: DomainEvent | null = position.x !== token.position.x || position.y !== token.position.y
        ? { type: "TokenMoved", tokenId: token.id, from: token.position, to: position }
        : null;
      // Fog follows the same rule as hiding (ADR 0016): into fog first, out of fog last.
      const fogged = (p: Point) => isInFog(state.fog, p);
      const intoFog = moved !== null && fogged(position) && !fogged(token.position);
      const outOfFog = moved !== null && !fogged(position) && fogged(token.position);
      const events: DomainEvent[] = [];
      // Hide before any secret edit is broadcast; reveal only after every edit is applied.
      const hiddenEvent: DomainEvent | null = changes.hidden !== undefined && changes.hidden !== token.hidden
        ? { type: "TokenHiddenSet", tokenId: token.id, hidden: changes.hidden, previous: token.hidden }
        : null;
      if (hiddenEvent && changes.hidden) events.push(hiddenEvent);
      if (moved && intoFog) events.push(moved);
      if (name !== token.name || size !== token.size || rotation !== token.rotation) {
        events.push({ type: "TokenAppearanceSet", tokenId: token.id, name, size, rotation,
          previous: { name: token.name, size: token.size, rotation: token.rotation } });
      }
      if (moved && !intoFog && !outOfFog) events.push(moved);
      if (imageUrl !== undefined && assetId !== undefined &&
        (imageUrl !== token.imageUrl || assetId !== (token.assetId ?? null))) {
        events.push({ type: "TokenImageSet", tokenId: token.id, imageUrl, assetId,
          previous: { imageUrl: token.imageUrl, assetId: token.assetId ?? null } });
      }
      if (changes.stats && (changes.stats.hp !== token.stats.hp || changes.stats.maxHp !== token.stats.maxHp || changes.stats.ac !== token.stats.ac)) {
        events.push({ type: "TokenStatsSet", tokenId: token.id, stats: changes.stats, previous: token.stats });
      }
      if (changes.conditions) {
        const conditions = [...new Set(changes.conditions)];
        if (conditions.length !== token.conditions.length || conditions.some((c) => !token.conditions.includes(c))) {
          events.push({ type: "TokenConditionsSet", tokenId: token.id, conditions, previous: token.conditions });
        }
      }
      if (changes.ownerIds) {
        const ownerIds = [...new Set(changes.ownerIds)];
        if (ownerIds.length !== token.ownerIds.length || ownerIds.some((id) => !token.ownerIds.includes(id))) {
          events.push({ type: "TokenOwnersSet", tokenId: token.id, ownerIds, previous: token.ownerIds });
        }
      }
      if (moved && outOfFog) events.push(moved);
      if (hiddenEvent && !changes.hidden) events.push(hiddenEvent);
      return accept(...events);
    }

    case "token.setAppearance": {
      if (!can.administer(actor)) return forbidden();
      const token = state.tokens[command.tokenId];
      if (!token) return notFound("token");
      if (!command.name.trim()) return reject("invalid", "Token name can't be blank.");
      const name = uniqueTokenName(state, command.name, token.id);
      const rotation = normalizeRotation(command.rotation);
      if (name === token.name && command.size === token.size && rotation === token.rotation) return { ok: true, events: [] };
      const position = resizedPosition(state, token, command.size);
      const appearance: DomainEvent = {
        type: "TokenAppearanceSet",
        tokenId: token.id,
        name,
        size: command.size,
        rotation,
        previous: { name: token.name, size: token.size, rotation: token.rotation },
      };
      if (position === token.position) return accept(appearance);
      const moved: DomainEvent = { type: "TokenMoved", tokenId: token.id, from: token.position, to: position };
      // Into fog: move first, so the new name is never sent to players (ADR 0016).
      const intoFog = isInFog(state.fog, position) && !isInFog(state.fog, token.position);
      return intoFog ? accept(moved, appearance) : accept(appearance, moved);
    }

    case "token.delete": {
      if (!can.administer(actor)) return forbidden();
      const token = state.tokens[command.tokenId];
      if (!token) return notFound("token");
      return accept({ type: "TokenDeleted", token });
    }

    case "token.setOwners": {
      if (!can.administer(actor)) return forbidden();
      const token = state.tokens[command.tokenId];
      if (!token) return notFound("token");
      const ownerError = checkOwners(state, command.ownerIds);
      if (ownerError) return ownerError;
      return accept({
        type: "TokenOwnersSet",
        tokenId: token.id,
        ownerIds: [...new Set(command.ownerIds)],
        previous: token.ownerIds,
      });
    }

    case "token.setHidden": {
      if (!can.administer(actor)) return forbidden();
      const token = state.tokens[command.tokenId];
      if (!token) return notFound("token");
      if (token.hidden === command.hidden) return { ok: true, events: [] };
      return accept({
        type: "TokenHiddenSet",
        tokenId: token.id,
        hidden: command.hidden,
        previous: token.hidden,
      });
    }

    case "token.setStats": {
      const token = state.tokens[command.tokenId];
      if (!token || concealedFrom(state.fog, token, actor)) return notFound("token");
      if (!can.editToken(actor, token)) return forbidden();
      const off = presetRefusal(state, { ac: command.stats.ac });
      if (off) return off;
      if (command.stats.hp !== null && command.stats.maxHp !== null && command.stats.hp > command.stats.maxHp) {
        return reject("invalid", "Current HP cannot exceed maximum HP");
      }
      return accept({
        type: "TokenStatsSet",
        tokenId: token.id,
        stats: command.stats,
        previous: token.stats,
      });
    }

    case "token.setImage": {
      if (!can.administer(actor)) return forbidden();
      const token = state.tokens[command.tokenId];
      if (!token) return notFound("token");
      if (token.imageUrl === command.imageUrl && (token.assetId ?? null) === command.assetId) {
        return reject("invalid", `${token.name} already has that image.`);
      }
      return accept({
        type: "TokenImageSet",
        tokenId: token.id,
        imageUrl: command.imageUrl,
        assetId: command.assetId,
        previous: { imageUrl: token.imageUrl, assetId: token.assetId ?? null },
      });
    }

    case "token.setConditions": {
      const token = state.tokens[command.tokenId];
      if (!token || concealedFrom(state.fog, token, actor)) return notFound("token");
      if (!can.editToken(actor, token)) return forbidden();
      const off = presetRefusal(state, { conditions: command.conditions.length > 0 });
      if (off) return off;
      return accept({
        type: "TokenConditionsSet",
        tokenId: token.id,
        conditions: [...new Set(command.conditions)],
        previous: token.conditions,
      });
    }

    case "initiative.start": {
      if (!can.administer(actor)) return forbidden();
      const unknown = command.entries.find((e) => !state.tokens[e.tokenId]);
      if (unknown) return notFound("token");
      // Sort here, not on the client: turn order is authoritative state, and two clients
      // sorting a tie differently would diverge. Ties break by token id for determinism.
      const order = [...command.entries]
        .sort((a, b) => b.score - a.score || a.tokenId.localeCompare(b.tokenId))
        .map((e) => e.tokenId);
      const deduped = [...new Set(order)];
      if (deduped.length !== order.length) return reject("invalid", "A token appears twice in the order");
      return accept({
        type: "InitiativeStarted",
        initiative: { order: deduped, activeIndex: 0, round: 1 },
        previous: state.initiative,
        scores: command.entries.map((e) => ({
          tokenId: e.tokenId,
          score: e.score,
          previous: state.tokens[e.tokenId]?.initiative ?? null,
        })),
      });
    }

    case "initiative.advance": {
      if (!can.administer(actor)) return forbidden();
      const current = state.initiative;
      if (!current) return reject("invalid", "No encounter is running");
      return accept({
        type: "InitiativeAdvanced",
        initiative: advance(current),
        previous: current,
      });
    }

    case "initiative.end": {
      if (!can.administer(actor)) return forbidden();
      if (!state.initiative) return { ok: true, events: [] };
      return accept({ type: "InitiativeEnded", previous: state.initiative });
    }

    case "dice.roll": {
      let attack: AttackContext | undefined;
      if (command.attack) {
        // Authorization first; a token the actor can't see is answered as a missing one (ADR 0010).
        const visible = (id: string) => {
          const token = state.tokens[id];
          return token && !concealedFrom(state.fog, token, actor) ? token : null;
        };
        const attacker = visible(command.attack.actorTokenId);
        if (!attacker) return notFound("token");
        if (!can.attackWith(actor, attacker)) return forbidden();
        const target = visible(command.attack.targetTokenId);
        if (!target) return notFound("token");
        if (target.id === attacker.id) return reject("invalid", "A token can't attack itself");
        // An unowned token under fog is concealed on the roll for good, like a hidden one (ADR 0016).
        const side = (t: Token) => ({ tokenId: t.id, name: t.name, hidden: t.hidden || fogConcealsSide(state, t) });
        attack = { actor: side(attacker), target: side(target), label: command.attack.label || null, kind: command.attack.kind };
        const off = presetRefusal(state, { attacks: true });
        if (off) return off;
      }
      if (command.visibility === "gm" && !can.rollHidden(actor)) return forbidden();
      const parsed = parseDiceExpression(command.expression);
      if (!parsed.ok) return reject("invalid", parsed.message);
      const random = ctx.random;
      if (!random) return reject("invalid", "Dice are unavailable");
      const { dice, total } = rollDice(parsed.expression, random);
      return accept({
        type: "DiceRolled",
        roll: {
          id: ctx.newId(),
          expression: formatExpression(parsed.expression),
          byParticipantId: actor.id,
          dice,
          modifier: parsed.expression.modifier,
          total,
          visibility: command.visibility,
          ...(attack && { attack }),
        },
      });
    }

    case "roll.rule": {
      // The GM rules afterwards; nobody asks before rolling, and the app never decides (ADR 0011).
      if (!can.ruleRolls(actor)) return forbidden();
      const rulingOff = presetRefusal(state, { attacks: true });
      if (rulingOff) return rulingOff;
      const roll = state.rolls.find((r) => r.id === command.rollId);
      if (!roll) return reject("not_found", "That roll is too old to rule on");
      if (roll.attack?.kind !== "toHit") return reject("invalid", "Only to-hit attack rolls take a ruling");
      const previous = roll.verdict ?? null;
      if (previous === command.verdict) {
        return reject("invalid", command.verdict ? `That roll is already a ${command.verdict}` : "That roll has no ruling");
      }
      return accept({ type: "RollRuled", rollId: roll.id, verdict: command.verdict, previous });
    }

    case "roll.applyDamage": {
      if (!can.ruleRolls(actor)) return forbidden();
      const damageOff = presetRefusal(state, { attacks: true });
      if (damageOff) return damageOff;
      const roll = state.rolls.find((r) => r.id === command.rollId);
      if (!roll) return reject("not_found", "That roll is too old to apply");
      if (roll.attack?.kind !== "damage") return reject("invalid", "Only damage rolls can be applied");
      if (roll.damageApplied) return reject("invalid", "That damage has already been applied");
      // The GM's copy always has both sides; a missing target was deleted.
      const target = roll.attack.target ? state.tokens[roll.attack.target.tokenId] : undefined;
      if (!target) return notFound("token");
      if (target.stats.hp === null) return reject("invalid", `${target.name} has no HP to change`);
      // Worked out here from current HP, so a stale screen or a second tap can't apply twice.
      const amount = Math.max(0, roll.total);
      const hp = Math.max(MIN_HP, target.stats.hp - amount);
      const applied: DomainEvent = { type: "RollDamageApplied", rollId: roll.id, amount };
      // Nothing to change (no damage, or already at the floor): just mark the roll applied.
      if (hp === target.stats.hp) return accept(applied);
      return accept({ type: "TokenStatsSet", tokenId: target.id, stats: { ...target.stats, hp }, previous: target.stats }, applied);
    }

    case "template.place": {
      // Only the GM hides things from players, as with hidden tokens and GM-only rolls.
      if (command.gmOnly && !can.administer(actor)) return forbidden();
      if (Object.keys(state.templates).length >= MAX_AREA_TEMPLATES) {
        return reject("invalid", `A room can hold at most ${MAX_AREA_TEMPLATES} area templates. Remove some first.`);
      }
      // A width only means something on a line, and at most 10 cells of this room's grid (KAN-35).
      const width = command.shape === "line" ? command.width : undefined;
      if (width !== undefined && width > MAX_LINE_WIDTH_CELLS * state.scene.grid.unitsPerCell) {
        return reject("invalid", `A line is at most ${MAX_LINE_WIDTH_CELLS * state.scene.grid.unitsPerCell} ${state.scene.grid.unitLabel} wide.`);
      }
      return accept({
        type: "TemplatePlaced",
        template: {
          id: ctx.newId(),
          shape: command.shape,
          origin: command.origin,
          toward: command.toward,
          size: command.size,
          ...(width !== undefined && { width }),
          ownerId: actor.id,
          gmOnly: command.gmOnly,
        },
      });
    }

    case "template.remove": {
      const template = state.templates[command.templateId];
      // A template the player can't see (GM-only, or someone else's under fog) answers like a missing one (FR-GM-23).
      if (!template || templateConcealedFrom(state.fog, template, actor)) return notFound("template");
      if (!can.removeTemplate(actor, template)) return forbidden();
      return accept({ type: "TemplateRemoved", template });
    }

    case "fog.add": {
      if (!can.administer(actor)) return forbidden();
      if (Object.keys(state.fog).length >= MAX_FOG_REGIONS) {
        return reject("invalid", `A room can hold at most ${MAX_FOG_REGIONS} fog regions. Remove some first.`);
      }
      const { region } = command;
      const points: Point[] = region.shape === "rect"
        ? [
            { x: Math.min(region.from.x, region.to.x), y: Math.min(region.from.y, region.to.y) },
            { x: Math.max(region.from.x, region.to.x), y: Math.min(region.from.y, region.to.y) },
            { x: Math.max(region.from.x, region.to.x), y: Math.max(region.from.y, region.to.y) },
            { x: Math.min(region.from.x, region.to.x), y: Math.max(region.from.y, region.to.y) },
          ]
        : region.points;
      // A line or a point conceals nothing and can't be clicked to remove; refuse it.
      if (Math.abs(polygonArea(points)) < 1) return reject("invalid", "A fog region needs some area.");
      return accept({ type: "FogAdded", region: { id: ctx.newId(), shape: region.shape, points } });
    }

    case "fog.remove": {
      if (!can.administer(actor)) return forbidden();
      const region = state.fog[command.regionId];
      if (!region) return notFound("fog region");
      return accept({ type: "FogRemoved", region });
    }

    case "participant.rename": {
      const displayName = command.displayName.trim();
      if (!displayName) return reject("invalid", BLANK_NAME);
      if (isDisplayNameTaken(state, displayName, actor.id)) return reject("invalid", nameTaken(displayName));
      return accept({
        type: "ParticipantRenamed",
        participantId: actor.id,
        displayName,
        previous: actor.displayName,
      });
    }

    case "participant.setDiceLook": {
      // Only your own seat: there is no target to name. Only your own look: the server resolved
      // the id against your account before this ran (ADR 0018).
      const current = actor.diceLook ?? null;
      if (command.lookId === null) {
        return current ? accept({ type: "ParticipantDiceLookSet", participantId: actor.id, look: null, previous: current }) : accept();
      }
      const owned = ctx.ownedDiceLook ?? null;
      if (!owned || owned.lookId !== command.lookId) return reject("forbidden", "You can only use your own dice looks.");
      if (current?.lookId === owned.lookId && current.version === owned.version) return accept();
      return accept({ type: "ParticipantDiceLookSet", participantId: actor.id, look: owned, previous: current });
    }

    case "participant.clearDiceLook": {
      if (!can.administer(actor)) return forbidden();
      const target = state.participants[command.participantId];
      if (!target) return notFound("participant");
      if (target.id === actor.id) return reject("invalid", "Choose Classic in your Dice panel to change your own dice.");
      if (!isActive(target)) return reject("invalid", `${target.displayName} is no longer in this room.`);
      if (!target.diceLook) return accept();
      return accept({ type: "ParticipantDiceLookSet", participantId: target.id, look: null, previous: target.diceLook });
    }

    case "participant.leave":
      // The room would be left without anyone who can administer it. The GM's way out is
      // the Home link, which only closes their socket (ADR 0006).
      if (can.administer(actor)) return reject("invalid", "The GM can't leave their own room.");
      return accept({ type: "ParticipantLeft", participant: actor });

    case "participant.revoke": {
      if (!can.administer(actor)) return forbidden();
      const target = state.participants[command.participantId];
      if (!target) return notFound("participant");
      if (target.id === actor.id) return reject("invalid", "You can't remove yourself.");
      if (target.role === "gm") return reject("invalid", "The GM can't be removed.");
      if (!isActive(target)) return reject("invalid", `${target.displayName} is no longer in the room.`);
      return accept({ type: "ParticipantRevoked", participant: target });
    }

    case "participant.resolveDeparture":
      if (!can.administer(actor)) return forbidden();
      return resolveDeparture(state, command.participantId, command.actions);

    case "chat.send": {
      // Any active participant may talk. The socket layer already refuses ended seats; this is the authority.
      if (!isActive(actor)) return forbidden();
      // The sender comes from the actor, never from the payload (the command is strict) (ADR 0015).
      return accept({
        type: "ChatMessageSent",
        message: { id: ctx.newId(), senderId: actor.id, senderName: actor.displayName, text: command.text },
      });
    }

    case "history.undo": {
      if (!can.administer(actor)) return forbidden();
      const entry = undoableAction(state.undo, command.commandId);
      if (!entry) return reject("invalid", "That action can no longer be undone.");
      // Never clobber a newer change: refuse unless every value the action set is still current.
      const conflict = undoConflict(state, entry);
      if (conflict) return reject("invalid", conflict);
      // Reverse order, so an editor save's "hide first, reveal last" stays safe when undone (ADR 0013).
      return accept(...entry.events.map(inverseOf).reverse().flat(), { type: "ActionUndone", commandId: entry.commandId });
    }

    case "checkpoint.create": {
      if (!can.administer(actor)) return forbidden();
      const name = command.name.trim();
      if (!name) return reject("invalid", "Give the checkpoint a name.");
      if (name.length > MAX_CHECKPOINT_NAME) return reject("invalid", `Checkpoint names are at most ${MAX_CHECKPOINT_NAME} characters.`);
      if (ctx.lastSeq === undefined) return reject("invalid", "Checkpoints can't be saved here.");
      return accept({ type: "CheckpointCreated", checkpoint: { id: ctx.newId(), name, seq: ctx.lastSeq } });
    }

    case "encounter.apply": {
      if (!can.administer(actor)) return forbidden();
      // A template that is another account's reads exactly like one that does not exist.
      const encounter = ctx.encounterTemplate?.(command.templateId) ?? null;
      if (!encounter) return reject("invalid", "That encounter template isn't available.");
      return accept({
        type: "EncounterApplied",
        templateId: encounter.id,
        name: encounter.name,
        // A template saved in another game's room loads without the features this room has off (KAN-63).
        applied: tableForPreset(encounterTable(encounter, ctx.newId), presetOf(state)),
        previous: tableOf(state),
      });
    }

    case "checkpoint.restore": {
      if (!can.administer(actor)) return forbidden();
      const checkpoint = state.checkpoints.find((c) => c.id === command.checkpointId);
      if (!checkpoint) return notFound("checkpoint");
      const restored = ctx.checkpointTable?.(checkpoint.id) ?? null;
      if (!restored) return reject("invalid", `Checkpoint "${checkpoint.name}" can't be restored right now.`);
      return accept({ type: "CheckpointRestored", checkpointId: checkpoint.id, name: checkpoint.name, restored, previous: tableOf(state) });
    }
  }
}

/**
 * Turns the GM's per-token choices into existing token events (ADR 0006). Every action is
 * validated before any event is produced, so the command is all-or-nothing.
 */
function resolveDeparture(state: RoomState, participantId: string, actions: DepartureAction[]): Decision {
  const departed = state.participants[participantId];
  if (!departed) return notFound("participant");
  if (isActive(departed)) return reject("invalid", `${departed.displayName} hasn't left the room.`);

  const seen = new Set<string>();
  for (const a of actions) {
    if (seen.has(a.tokenId)) return reject("invalid", "A token appears twice in the resolution");
    seen.add(a.tokenId);
    const token = state.tokens[a.tokenId];
    if (!token) return notFound("token");
    if (!token.ownerIds.includes(departed.id)) {
      return reject("invalid", `${token.name} is no longer owned by ${departed.displayName}.`);
    }
    if (a.action === "reassign") {
      const to = state.participants[a.to];
      if (!to) return notFound("participant");
      if (to.role !== "player" || !isActive(to)) {
        return reject("invalid", `${to.displayName} can't be given tokens: choose a player who is still in the room.`);
      }
    }
  }

  const events = actions.map((a): DomainEvent => {
    const token = state.tokens[a.tokenId]!;
    switch (a.action) {
      case "delete":
        return { type: "TokenDeleted", token };
      case "unassign":
        return {
          type: "TokenOwnersSet",
          tokenId: token.id,
          ownerIds: token.ownerIds.filter((id) => id !== departed.id),
          previous: token.ownerIds,
        };
      case "reassign":
        return {
          type: "TokenOwnersSet",
          tokenId: token.id,
          ownerIds: [...new Set(token.ownerIds.map((id) => (id === departed.id ? a.to : id)))],
          previous: token.ownerIds,
        };
    }
  });
  return { ok: true, events };
}

/** Owners must exist and still be in the room: a departed player can't be handed a token. */
function checkOwners(state: RoomState, ownerIds: string[]): Decision | null {
  for (const id of ownerIds) {
    const owner = state.participants[id];
    if (!owner) return reject("not_found", `Unknown participant ${id}`);
    if (!isActive(owner)) return reject("invalid", `${owner.displayName} has left the room.`);
  }
  return null;
}


/** Comparison key for names: "raymond", "Raymond " and "RAYMOND" are one name (KAN-61, KAN-62). */
export const normalizeName = (name: string) => name.normalize("NFC").trim().toLocaleLowerCase("en-US");
/** Display names compare the same way as every other name. Kept for KAN-61 callers. */
export const normalizeDisplayName = normalizeName;

/** True when a token other than `exceptId` already uses `name` in this room. Hidden tokens count. */
export function isTokenNameTaken(state: RoomState, name: string, exceptId?: string) {
  const key = normalizeName(name);
  return Object.values(state.tokens).some((t) => t.id !== exceptId && normalizeName(t.name) === key);
}

const MAX_TOKEN_NAME = 60;

/**
 * The name a new token actually gets (KAN-62): `name` trimmed if it's free, otherwise its base
 * plus the lowest free number from 2 ("Goblin" -> "Goblin 2"). A typed trailing number is part of
 * the suffix, so a taken "Goblin 2" becomes "Goblin 3", not "Goblin 2 2". Depends on `state` only,
 * so it's deterministic; the result goes into `TokenCreated`, so replay never re-runs it.
 */
export function uniqueTokenName(state: RoomState, name: string, exceptId?: string): string {
  const trimmed = name.trim();
  const taken = new Set(Object.values(state.tokens).filter((t) => t.id !== exceptId).map((t) => normalizeName(t.name)));
  if (!taken.has(normalizeName(trimmed))) return trimmed;
  const base = trimmed.replace(/\s+\d+$/, "") || trimmed;
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`;
    const candidate = base.slice(0, MAX_TOKEN_NAME - suffix.length).trimEnd() + suffix;
    if (!taken.has(normalizeName(candidate))) return candidate;
  }
}

/**
 * The `TokenCreated` events for `count` copies of `base` (KAN-70, KAN-82): spread over the nearest
 * free squares around `base.position`, each named against the room and the copies before it.
 */
function createTokens(
  state: RoomState,
  base: Omit<Token, "id">,
  count: number,
  ctx: DecideContext,
  { besideOrigin = false } = {},
): DomainEvent[] {
  const spread = spreadPositions(
    base.position, base.size, besideOrigin ? count + 1 : count, state.scene.grid, state.scene.map,
    Object.values(state.tokens).map((t) => ({ position: t.position, size: t.size })),
  );
  const positions = besideOrigin ? spread.slice(1) : spread;
  let named = state;
  return positions.map((position) => {
    // Duplicates are numbered, not rejected: placing five goblins is routine (KAN-62).
    const token: Token = { ...base, id: ctx.newId(), name: uniqueTokenName(named, base.name), position };
    named = { ...named, tokens: { ...named.tokens, [token.id]: token } };
    return { type: "TokenCreated", token };
  });
}

/** Why `name` can't name a group, or null (KAN-82): blank, too long, or another group's. */
export function groupNameProblem(state: RoomState, name: string, exceptId?: string): string | null {
  if (!name) return "Give the group a name.";
  if (name.length > MAX_GROUP_NAME) return `Group names are at most ${MAX_GROUP_NAME} characters.`;
  const taken = Object.values(state.groups).some((g) => g.id !== exceptId && normalizeName(g.name) === normalizeName(name));
  return taken ? `There is already a group named "${name}".` : null;
}

/** Keep persisted angles compact while accepting any finite angle from clients. */
const normalizeRotation = (degrees: number) => ((degrees % 360) + 360) % 360;

/**
 * Whether a participant is still in the room: holds their name, may act, may connect, may own
 * tokens. A participant stops by leaving or by being removed by the GM (ADR 0006, FR-GM-20).
 */
export const isActive = (participant: Participant) => !participant.left && !participant.revoked;

/** How the UI names an inactive participant: removed by the GM, or left on their own (ADR 0006). */
export const inactiveLabel = (participant: Participant) => (participant.revoked ? "removed" : "left");

/** Why a participant's seat ended, or null while they are still in the room. */
export const endReason = (participant: Participant): SessionEndReason | null =>
  participant.revoked ? "revoked" : participant.left ? "left" : null;

/** Departed participants still named as a token owner: what the GM has yet to resolve (ADR 0006). */
export function pendingDepartures(state: RoomState): { participant: Participant; tokenIds: string[] }[] {
  return Object.values(state.participants)
    .filter((p) => !isActive(p))
    .map((participant) => ({
      participant,
      tokenIds: Object.values(state.tokens)
        .filter((t) => t.ownerIds.includes(participant.id))
        .map((t) => t.id),
    }))
    .filter((d) => d.tokenIds.length > 0);
}

/** True when an active participant other than `exceptId` already uses `name` in this room. */
export function isDisplayNameTaken(state: RoomState, name: string, exceptId?: string) {
  const key = normalizeDisplayName(name);
  return Object.values(state.participants).some(
    (p) => p.id !== exceptId && isActive(p) && normalizeDisplayName(p.displayName) === key,
  );
}

/** Server-side detail so the join route can pick 400 vs 409. Never sent to clients. */
export type JoinRejectionReason = "blank" | "room_full" | "name_taken";
export type JoinDecision =
  | { ok: true; events: DomainEvent[] }
  | { ok: false; code: RejectionCode; message: string; reason: JoinRejectionReason };

/**
 * Joining is an unauthenticated HTTP action with no actor, so it isn't a `Command`; this is its
 * `decide`. The server runs it inside the room's ordered queue, so two joins racing for one name
 * can't both pass (KAN-61), and joins racing for the last seat can't pass the cap (room-player-cap).
 * A full room is the answer whatever the name, so nobody is asked to change a name that won't help.
 */
export function decideJoin(state: RoomState, participant: Participant): JoinDecision {
  const displayName = participant.displayName.trim();
  if (!displayName) return { ok: false, code: "invalid", message: BLANK_NAME, reason: "blank" };
  if (activePlayerCount(state) >= MAX_PLAYERS_PER_ROOM) {
    return { ok: false, code: "invalid", message: ROOM_FULL_MESSAGE, reason: "room_full" };
  }
  if (isDisplayNameTaken(state, displayName)) {
    return { ok: false, code: "invalid", message: nameTaken(displayName), reason: "name_taken" };
  }
  return { ok: true, events: [{ type: "ParticipantJoined", participant: { ...participant, displayName } }] };
}

/** Players holding a seat: the GM, and anyone who left or was removed, are not counted (room-player-cap). */
export function activePlayerCount(state: RoomState) {
  return Object.values(state.participants).filter((p) => p.role === "player" && isActive(p)).length;
}

const BLANK_NAME = "Display name can't be blank.";
const ROOM_FULL_MESSAGE = `This room is full: it holds ${MAX_PLAYERS_PER_ROOM} players. Ask the GM for a seat.`;
const nameTaken = (name: string) => `The name "${name}" is already taken in this room. Choose another name.`;

/**
 * Next turn. Wrapping past the last entry starts a new round (FR-GM-21).
 * Entries whose token was deleted mid-encounter are skipped rather than removed, because
 * `order` is carried in the event and history is never rewritten.
 */
function advance(current: Initiative): Initiative {
  const next = current.activeIndex + 1;
  return next >= current.order.length
    ? { ...current, activeIndex: 0, round: current.round + 1 }
    : { ...current, activeIndex: next };
}

/**
 * Refuses a command that uses a rules feature the room's game preset turns off (KAN-63, ADR 0027).
 * Called after authorization, so a player still gets "forbidden" for what they may never do.
 */
function presetRefusal(state: RoomState, uses: { attacks?: boolean; conditions?: boolean; ac?: number | null }): Decision | null {
  const preset = presetOf(state);
  if (uses.attacks && !preset.features.attacks) return reject("invalid", `Attack rolls are off in ${preset.name}.`);
  if (uses.conditions && !preset.features.conditions) return reject("invalid", `Conditions are off in ${preset.name}.`);
  if (uses.ac != null && !preset.features.armorClass) return reject("invalid", `AC is off in ${preset.name}.`);
  return null;
}

const accept = (...events: DomainEvent[]): Decision => ({ ok: true, events });
const reject = (code: RejectionCode, message: string): Decision => ({ ok: false, code, message });
const forbidden = () => reject("forbidden", "You are not allowed to do that");
const notFound = (what: string) => reject("not_found", `No such ${what}`);
