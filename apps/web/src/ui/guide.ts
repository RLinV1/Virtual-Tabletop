/**
 * The guided tour's content and card placement (room-sidebar-layout: Guided tour on demand).
 *
 * Pure data and geometry, so the step list and positioning are unit-tested without a DOM.
 * Each step names a `data-tour` target; the tour skips any step whose target is not on
 * screen, so one list serves desktop, the phone tabs and a collapsed section alike.
 */

export type Role = "gm" | "player";

export interface GuideStep {
  /** Matches a `data-tour` attribute on the element to spotlight. */
  target: string;
  title: string;
  body: string;
  /** The step asks the viewer to use the spotlit control, so clicks inside it get through. */
  interactive?: boolean;
}

interface StepSpec {
  target: string;
  title: string;
  /** Text for both roles, or per role. A role missing from the map skips the step. */
  body: string | Partial<Record<Role, string>>;
  interactive?: boolean;
}

const STEPS: StepSpec[] = [
  {
    target: "board",
    title: "The map",
    body: {
      gm: "Drag empty space to pan and scroll to zoom. Drag any token to move it. Double-click to ping a spot for everyone.",
      player: "Drag empty space to pan and scroll to zoom. Drag your own token to move it. Double-click to ping a spot so everyone looks there.",
    },
  },
  { target: "fit", title: "Fit", body: "Lost your place? Fit brings the whole map back into view." },
  {
    target: "participants",
    title: "Who's here",
    body: {
      gm: "See everyone in the room. Remove ends a player's seat and their tokens stay for you to hand on. They can rejoin as a new player through the current invite link until you reset it.",
      player: "See everyone in the room. The GM is marked.",
    },
  },
  {
    target: "share",
    title: "Invite players",
    body: {
      gm: "Click Share to copy the invite link, then send it to your players. If a link leaks, Reset link makes a new one; nobody already here is affected.",
    },
  },
  { target: "gm-map", title: "Battle map", body: { gm: "Upload a map image, or place one from your library." } },
  { target: "gm-grid", title: "Grid", body: { gm: "Line the grid up with the squares drawn on your map, so tokens snap to the right cells." } },
  {
    target: "my-tokens",
    title: "My tokens",
    body: { player: "Your characters. Click a name to find it on the map, and use the buttons to take damage or heal." },
  },
  {
    target: "initiative",
    title: "Initiative",
    body: {
      gm: "When a fight starts, press Start encounter and type each token's initiative. Next turn then moves play along.",
      player: "When a fight starts, the turn order shows here and your turn is marked.",
    },
  },
  {
    target: "tokens",
    title: "Tokens",
    body: {
      gm: "All your token controls live here. Click a name to find it on the map. Edit sets HP, AC, conditions, who controls it and whether players can see it.",
      player: "Every token you can see. Search, click one to find it on the map, and Edit your own to update HP and conditions.",
    },
  },
  { target: "gm-add-token", title: "Add tokens", body: { gm: "Create tokens for characters and monsters. Pick who controls each one, or hide it until you reveal it." } },
  {
    target: "dice",
    title: "Dice",
    body: {
      gm: "Roll any expression, like 1d20+5. Everyone sees the result, unless you tick Roll privately.",
      player: "Roll any expression, like 1d20+5. Everyone sees the result.",
    },
  },
  {
    target: "sidebar-handle",
    title: "More room",
    body: "Hide the sidebar to give the map the whole screen. Click again to bring it back.",
    interactive: true,
  },
  { target: "guide", title: "That's it", body: "Open this guide again anytime." },
];

export function guideSteps(role: Role): GuideStep[] {
  return STEPS.flatMap((s) => {
    const body = typeof s.body === "string" ? s.body : s.body[role];
    return body ? [{ target: s.target, title: s.title, body, ...(s.interactive && { interactive: true }) }] : [];
  });
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GAP = 12;
const MARGIN = 12;

/**
 * Where the explanation card goes: beside the target if there is room (right, then left),
 * else below or above it, else over its bottom edge for targets that fill the screen (the
 * map). Always clamped inside the viewport.
 */
export function placeCard(target: Rect, card: { width: number; height: number }, viewport: { width: number; height: number }) {
  const clampX = (x: number) => Math.min(Math.max(x, MARGIN), viewport.width - card.width - MARGIN);
  const clampY = (y: number) => Math.min(Math.max(y, MARGIN), viewport.height - card.height - MARGIN);
  const right = target.left + target.width;
  const bottom = target.top + target.height;
  const midY = target.top + target.height / 2 - card.height / 2;
  const midX = target.left + target.width / 2 - card.width / 2;

  if (right + GAP + card.width + MARGIN <= viewport.width) return { left: right + GAP, top: clampY(midY) };
  if (target.left - GAP - card.width >= MARGIN) return { left: target.left - GAP - card.width, top: clampY(midY) };
  if (bottom + GAP + card.height + MARGIN <= viewport.height) return { left: clampX(midX), top: bottom + GAP };
  if (target.top - GAP - card.height >= MARGIN) return { left: clampX(midX), top: target.top - GAP - card.height };
  return { left: clampX(midX), top: clampY(bottom - card.height - 2 * GAP) };
}
