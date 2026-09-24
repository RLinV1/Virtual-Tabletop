import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";
import { apply, dot, faceLayout, labelDie, mul, rotateX, rotateY, rotateZ, rotationCss, type Vec3 } from "./diceGeometry";

/** What the tray needs to know about a roll that has already been made. */
export interface TrayRoll {
  /** Stable for the roll: it seeds the resting angles and the throw path. */
  id: string;
  sides: number;
  /** Each die's result, in roll order. */
  dice: number[];
  /** Thrown in the GM's private colours. */
  gmOnly?: boolean;
}

/**
 * A roll thrown as 3D dice (FR-TAC-09, FR-GM-22), in the room's Dice panel and in the home
 * page's dice demo.
 *
 * The roll has already been made when this renders, by the server at the table or by the
 * shared roller on the home page: every die comes to rest on the face that roll chose, and
 * the throw is only how the result is shown arriving. At the table a GM-only roll never
 * reaches a player's state, so it never reaches a player's tray either.
 *
 * Decorative: the text beside it carries the result, so the tray is hidden from assistive
 * technology.
 */
export function DiceTray({
  roll,
  throwing,
  onLanded,
  scale = 1,
}: {
  roll: TrayRoll;
  /** Throw the dice in; otherwise they are drawn at rest. */
  throwing: boolean;
  /** Called once the dice are at rest (at once under reduced motion). */
  onLanded: () => void;
  /** Multiplies the die size, for roomier surfaces than the side panel. */
  scale?: number;
}) {
  const root = useRef<HTMLDivElement>(null);
  const landed = useRef(onLanded);
  landed.current = onLanded;

  const size = Math.round(dieSize(roll.dice.length) * scale);
  const faces = roll.dice.join(",");
  // Keyed on values, not identity: the room re-renders on every state change, and a roll
  // rebuilt from the same data must not re-lay out twenty dice.
  const dice = useMemo(() => layoutDice(roll, size), [roll.id, roll.sides, faces, size]);

  useLayoutEffect(() => {
    if (!throwing) return;
    const el = root.current;
    if (!el || typeof el.animate !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      landed.current();
      return;
    }

    const animations = throwDice(el, dice, size, seed(`${roll.id}:throw`));
    let live = true;
    Promise.all(animations.map((a) => a.finished)).then(
      () => live && landed.current(),
      // Cancelled: a newer roll replaced this one, or the panel went away.
      () => {},
    );
    return () => {
      live = false;
      for (const a of animations) a.cancel();
    };
    // The tray is keyed by roll, so a throw starts at most once per roll.
  }, [throwing]);

  return (
    <div
      ref={root}
      className={roll.gmOnly ? "dice-tray private" : "dice-tray"}
      aria-hidden="true"
      style={{ "--die": `${size}px` } as CSSProperties}
    >
      {dice.map((die, i) => (
        <div key={i} className="die3d-slot" data-die>
          <div className="die3d-shadow" data-part="shadow" />
          <div className="die3d-flight" data-part="flight">
            <div className="die3d" data-part="spin" style={{ transform: die.rest }}>
              {die.faces.map((f, j) => (
                <div
                  key={j}
                  className={f.front ? "die3d-face front" : "die3d-face"}
                  style={{ width: f.width, height: f.height, transform: f.transform, "--shade": f.shade } as CSSProperties}
                >
                  <svg width={f.width} height={f.height}>
                    <polygon points={f.points} />
                    {f.numerals.map((m, k) => (
                      <g key={k} transform={`translate(${m.x} ${m.y}) rotate(${m.angle})`}>
                        <text style={{ fontSize: m.fontSize }}>{m.value}</text>
                        {m.underline && (
                          <line
                            x1={-m.fontSize * 0.3}
                            x2={m.fontSize * 0.3}
                            y1={m.fontSize * 0.55}
                            y2={m.fontSize * 0.55}
                            style={{ strokeWidth: Math.max(1, m.fontSize * 0.09) }}
                          />
                        )}
                      </g>
                    ))}
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Fewer dice are drawn bigger; twenty still fit a phone-width panel in three rows. */
function dieSize(count: number): number {
  if (count <= 2) return 60;
  if (count <= 4) return 52;
  if (count <= 8) return 44;
  if (count <= 12) return 38;
  return 32;
}

/** Light from over the viewer's left shoulder, so the face turned to them is the brightest. */
const LIGHT = ((l: Vec3) => {
  const len = Math.hypot(...l);
  return [l[0] / len, l[1] / len, l[2] / len] as Vec3;
})([-0.3, -0.5, 1]);

interface DieLayout {
  /** CSS transform of the die at rest: tilted toward the viewer, result face forward. */
  rest: string;
  faces: {
    width: number;
    height: number;
    transform: string;
    points: string;
    /** Reads the result head-on. */
    front: boolean;
    numerals: { x: number; y: number; angle: number; value: number; fontSize: number; underline: boolean }[];
    shade: string;
  }[];
}

function layoutDice(roll: TrayRoll, size: number): DieLayout[] {
  const { sides } = roll;
  const radius = size / 2;
  const rng = seed(roll.id);

  return roll.dice.map((value, i) => {
    const die = labelDie(sides, value, i);
    // Each die rests at its own slight angle, so a handful of them reads as thrown, not
    // printed. The tilt shows two side faces; the twist is small enough to read the number.
    const tilt = { x: 14 + rng() * 8, y: (rng() < 0.5 ? -1 : 1) * (12 + rng() * 10), z: (rng() - 0.5) * 18 };
    const rest = mul(mul(mul(rotateX(tilt.x), rotateY(tilt.y)), rotateZ(tilt.z)), die.rest);

    return {
      rest: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) rotateZ(${tilt.z}deg) ${rotationCss(die.rest)}`,
      faces: die.body.faces.map((face, j) => {
        const layout = faceLayout(face, radius);
        // Lambert shading, fixed at the resting pose: the faces are painted once and
        // turn with the die, which a one-second tumble does not give away.
        const lit = Math.max(0, dot(apply(rest, face.n), LIGHT));
        return {
          ...layout,
          front: j === die.front,
          numerals: die.numerals[j]!.map((m) => {
            const digits = String(m.value).length;
            return {
              x: layout.labelX + m.u * radius,
              y: layout.labelY + m.v * radius,
              angle: m.angle,
              value: m.value,
              fontSize: Math.min(m.room * radius * (digits <= 2 ? 1.15 : digits === 3 ? 0.85 : 0.66), radius * 0.62),
              // A 6 and a 9 are the same numeral upside down; real dice underline them.
              underline: sides >= 9 && (m.value === 6 || m.value === 9),
            };
          }),
          shade: `${Math.round((1 - lit) * 62)}%`,
        };
      }),
    };
  });
}

const THROW_MS = 1150;
const SAMPLES = 36;

/** Floor contacts after the drop: [start, end, bounce height as a fraction of the drop]. */
const BOUNCES: [number, number, number][] = [
  [0.34, 0.58, 0.3],
  [0.58, 0.74, 0.1],
  [0.74, 0.84, 0.03],
];

/**
 * Throws every die in the tray from one side: a drop, three shrinking bounces, a slide
 * that bleeds off speed, and a tumble that unwinds onto the resting pose. The keyframes
 * are sampled from those curves rather than eased, because a bounce is not an easing.
 *
 * The tumble is extra rotations composed in front of the rest transform and wound down to
 * zero, so the final frame is exactly the rest pose and the die lands on its result.
 */
function throwDice(tray: HTMLElement, dice: DieLayout[], size: number, rng: () => number): Animation[] {
  const from = rng() < 0.5 ? -1 : 1;
  const stagger = Math.min(60, 420 / dice.length);
  const out: Animation[] = [];

  tray.querySelectorAll<HTMLElement>("[data-die]").forEach((slot, i) => {
    const die = dice[i];
    const spin = slot.querySelector<HTMLElement>('[data-part="spin"]');
    const flight = slot.querySelector<HTMLElement>('[data-part="flight"]');
    const shadow = slot.querySelector<HTMLElement>('[data-part="shadow"]');
    if (!die || !spin || !flight || !shadow) return;

    const drop = size * (1.1 + rng() * 0.5);
    const slide = from * size * (1.8 + rng() * 1.4);
    const turns = [0, 1, 2].map((axis) => (rng() < 0.5 ? -1 : 1) * (axis === 2 ? 200 : 460) + (rng() - 0.5) * 240);

    const height = (t: number) => {
      const [first] = BOUNCES[0]!;
      if (t < first) return drop * (1 - (t / first) ** 2);
      for (const [a, b, peak] of BOUNCES) {
        if (t < b) {
          const s = (t - a) / (b - a);
          return 4 * peak * drop * s * (1 - s);
        }
      }
      return 0;
    };

    const spinFrames: Keyframe[] = [];
    const flightFrames: Keyframe[] = [];
    const shadowFrames: Keyframe[] = [];
    for (let k = 0; k <= SAMPLES; k++) {
      const t = k / SAMPLES;
      const h = height(t);
      const x = slide * (1 - t) ** 2.4;
      const unwind = (1 - t) ** 2.6;
      const lift = h / drop;
      spinFrames.push({
        offset: t,
        transform: `rotateX(${turns[0]! * unwind}deg) rotateY(${turns[1]! * unwind}deg) rotateZ(${turns[2]! * unwind}deg) ${die.rest}`,
      });
      flightFrames.push({ offset: t, transform: `translate3d(${x}px, ${-h}px, 0) scale(${1 + 0.18 * lift})` });
      shadowFrames.push({ offset: t, transform: `translateX(${x}px) scale(${1 - 0.45 * lift})`, opacity: 1 - 0.7 * lift });
    }

    // `backwards` holds each die at its starting point, out of view, until its turn.
    const timing: KeyframeAnimationOptions = { duration: THROW_MS, delay: i * stagger, fill: "backwards" };
    out.push(spin.animate(spinFrames, timing), flight.animate(flightFrames, timing), shadow.animate(shadowFrames, timing));
  });

  return out;
}

/**
 * A small seeded generator (mulberry32), keyed by roll id. Decorative only: it picks the
 * resting angles and the throw path, and it is seeded so a re-render does not reshuffle a
 * die that is already on the table.
 */
function seed(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
