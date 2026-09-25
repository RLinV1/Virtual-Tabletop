import {
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  formatExpression,
  parseDiceExpression,
  rollDice,
  type DiceExpression,
} from "@vtt/shared";
import {
  ArrowRight,
  CircleHalfTilt,
  DiceFive,
  Eye,
  EyeSlash,
  GridFour,
  LinkSimple,
  MapTrifold,
  Moon,
  Stack,
  Sun,
} from "@phosphor-icons/react";
import { Link } from "../Link";
import { revealOnEnter } from "../ui/reveal";
import { navigate } from "../router";
import { useGroundTheme, type ThemeChoice } from "../theme";
import { DiceTray } from "../ui/DiceTray";
import { BUILTIN_ASSETS } from "../net/builtinAssets";

/**
 * Every home crop is 20 squares wide and starts on a grid line of its map, cut by
 * scripts/home-maps.mjs to 1400 x 788, so each has exact 70 px squares from its top-left
 * corner (top-down-default-maps).
 */
const CROP = { width: 1400, height: 788, cell: 70 } as const;

/** One map per section, so the page shows three encounters rather than one three times. */
const MAPS = {
  hero: {
    src: "/img/home/broken-span.webp",
    alt: "A top-down battle map of a ruined stone courtyard with a lit brazier, fallen blocks and moss between the flagstones, beside a broken wall and the edge of a chasm.",
  },
  grid: {
    src: "/img/home/hollowfrost-keep.webp",
    alt: "A top-down battle map of a snowy paved courtyard with a blue crystal on a round stone dais, ringed by four braziers.",
  },
  visibility: {
    src: "/img/home/temple-green-sun.webp",
    alt: "A top-down battle map of a jungle temple plaza with a golden sun mosaic, a lily pond, and a shadowed side chamber overgrown with ferns.",
  },
} as const;

/** Character art for the tokens on each map, cropped to the face. Each map has its own cast. */
const PORTRAITS = {
  hero: {
    brenna: "/img/tokens/hero-brenna.webp",
    toma: "/img/tokens/hero-toma.webp",
    ash: "/img/tokens/hero-ash.webp",
  },
  visibility: {
    brenna: "/img/tokens/jungle-brenna.webp",
    toma: "/img/tokens/jungle-toma.webp",
  },
} as const;

/** Whole-map thumbnails for the library shelf, keyed by built-in id. */
const THUMBS: Record<string, { src: string; alt: string }> = {
  "builtin:broken-span": {
    src: "/img/home/broken-span-thumb.webp",
    alt: "A top-down battle map of a ruined keep split by a rushing chasm, joined by two stone bridges.",
  },
  "builtin:hollowfrost-keep": {
    src: "/img/home/hollowfrost-keep-thumb.webp",
    alt: "A top-down battle map of a snowbound fortress on both sides of a frozen ravine, with an ice bridge and a crystal dais.",
  },
  "builtin:temple-green-sun": {
    src: "/img/home/temple-green-sun-thumb.webp",
    alt: "A top-down battle map of an overgrown temple plaza with a sun mosaic, lily ponds and a side chamber, framed by jungle.",
  },
};

/** The shelf in the library chapter: the real built-ins, whole, with their real size and grid. */
const SHELF = BUILTIN_ASSETS.filter((a) => a.kind === "map" && a.id in THUMBS);

/**
 * A map's grid, drawn in the map's own pixels so it lands on the same squares at any
 * display size. Lines keep a hairline width however far the map is scaled down.
 */
function MapGrid(props: {
  width: number;
  height: number;
  cell: number;
  offsetX?: number;
  offsetY?: number;
  variant: "faint" | "light" | "app";
}) {
  const { width, height, cell, offsetX = 0, offsetY = 0 } = props;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = offsetX; x <= width; x += cell) xs.push(x);
  for (let y = offsetY; y <= height; y += cell) ys.push(y);
  return (
    <svg
      className={`map-grid map-grid-${props.variant}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {xs.map((x) => (
        <line key={`x${x}`} x1={x} y1={0} x2={x} y2={height} vectorEffect="non-scaling-stroke" />
      ))}
      {ys.map((y) => (
        <line key={`y${y}`} x1={0} y1={y} x2={width} y2={y} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** Where a token in square (col, row) of a home crop is centred. */
const inSquare = (col: number, row: number): CSSProperties => ({
  left: `${(((col + 0.5) * CROP.cell) / CROP.width) * 100}%`,
  top: `${(((row + 0.5) * CROP.cell) / CROP.height) * 100}%`,
});

/**
 * The home page. One page for everyone (KAN-56): it used to branch on whether this browser
 * held a GM token and render a different page entirely, which meant opening the asset
 * library (which mints an identity on mount) silently replaced `/` for the rest of the
 * session. Rooms you own are a section on this page now, not a separate page.
 */
export function HomePage() {
  const { choice, choose } = useGroundTheme();
  return (
    <div className="home-page">
      <Landing theme={choice} onTheme={choose} />
    </div>
  );
}

interface ThemeProps {
  theme: ThemeChoice;
  onTheme: (choice: ThemeChoice) => void;
}

/**
 * Auto follows the system. The explicit choices exist because a GM running a session in a
 * dark room and one reading on a bright train want opposite grounds (DESIGN.md §11.9).
 */
function ThemeToggle({ theme, onTheme }: ThemeProps) {
  const next: Record<ThemeChoice, ThemeChoice> = { auto: "light", light: "dark", dark: "auto" };
  const label: Record<ThemeChoice, string> = {
    auto: "Theme: follows your system. Switch to light",
    light: "Theme: light. Switch to dark",
    dark: "Theme: dark. Switch to system",
  };
  const icon = { auto: CircleHalfTilt, light: Sun, dark: Moon }[theme];
  const Icon = icon;
  return (
    <button
      type="button"
      className="icon-button theme-toggle"
      onClick={() => onTheme(next[theme])}
      aria-label={label[theme]}
      title={label[theme]}
    >
      <Icon weight="bold" aria-hidden="true" />
    </button>
  );
}

function HomeBar({ theme, onTheme, children }: ThemeProps & { children: ReactNode }) {
  return (
    <header className="home-header">
      <Link href="/" className="brand">
        Virtual Tabletop
      </Link>
      <nav className="home-nav">
        {children}
        <ThemeToggle theme={theme} onTheme={onTheme} />
      </nav>
    </header>
  );
}

/** Wounded reads at a glance, the way it does on the board. */
const hpColor = (pct: number) => (pct > 50 ? "var(--ok)" : pct > 25 ? "var(--warn)" : "var(--danger)");

/**
 * A token as the board draws one: a coloured disc with an initial, or with the token's art
 * clipped to it, and a hit-point bar. As on the board, art that fails to load leaves the
 * coloured disc.
 */
function TokenChip(props: {
  name: string;
  color: string;
  hp: number;
  image?: string;
  /** The grid square the token stands in, on its home crop. */
  at: { col: number; row: number };
  delay?: number;
}) {
  const [artFailed, setArtFailed] = useState(false);
  const art = props.image && !artFailed ? props.image : null;
  return (
    <span
      className="token-chip"
      style={{ ...inSquare(props.at.col, props.at.row), animationDelay: `${props.delay ?? 0}ms` }}
    >
      <span className={art ? "token-disc has-art" : "token-disc"} style={{ backgroundColor: props.color }}>
        {art ? (
          // The label beneath names the token, so the art itself is decorative.
          <img src={art} alt="" width={192} height={192} loading="lazy" decoding="async" onError={() => setArtFailed(true)} />
        ) : (
          props.name.slice(0, 1)
        )}
      </span>
      <span className="token-hp">
        <span
          className="token-hp-fill"
          style={{ width: `${props.hp}%`, backgroundColor: hpColor(props.hp) }}
        />
      </span>
      <span className="token-label">{props.name}</span>
    </span>
  );
}

function Landing({ theme, onTheme }: ThemeProps) {
  return (
    <>
      <div className="landing-shell landing-bar">
        <HomeBar theme={theme} onTheme={onTheme}>
          <Link href="/signin" className="nav-link">
            Sign in
          </Link>
          <Link href="/signup" className="nav-cta">
            Create account
          </Link>
        </HomeBar>
      </div>

      <main className="landing-shell">
        <section className="landing-hero">
          <div>
            <h1 className="enter">From battle map to table in minutes.</h1>
            <p className="landing-sub enter enter-2">
              Set up a map, drop in tokens, and send your players a link. They join from any browser, no
              account needed.
            </p>
            {/* Two readers arrive here. Players outnumber GMs at every table and their path is
                one field, so it comes first; the GM's path keeps the only filled button. */}
            <div className="hero-paths enter enter-3">
              <JoinBlock />
              <RunBlock />
            </div>
          </div>
          <div className="hero-art enter enter-art" style={{ "--map": `url(${MAPS.hero.src})` } as CSSProperties}>
            <div className="hero-frame">
              <img
                src={MAPS.hero.src}
                width={CROP.width}
                height={CROP.height}
                alt={MAPS.hero.alt}
                fetchPriority="high"
              />
              <MapGrid width={CROP.width} height={CROP.height} cell={CROP.cell} variant="faint" />
              <TokenChip
                name="Brenna"
                color="#5b8def"
                hp={84}
                image={PORTRAITS.hero.brenna}
                at={{ col: 5, row: 4 }}
                delay={560}
              />
              <TokenChip
                name="Toma"
                color="#3fb950"
                hp={61}
                image={PORTRAITS.hero.toma}
                at={{ col: 10, row: 5 }}
                delay={680}
              />
              <TokenChip
                name="Ash"
                color="#d29922"
                hp={38}
                image={PORTRAITS.hero.ash}
                at={{ col: 4, row: 8 }}
                delay={800}
              />
            </div>
          </div>
        </section>

        {/* Everything under this heading is about running a game, so "you" below is the GM
            and players are "your players". */}
        <section aria-labelledby="running-your-game">
          <header className="part-head" ref={revealOnEnter}>
            <h2 id="running-your-game">Running your game</h2>
            <p>What you get as the GM. Your players only need the link.</p>
          </header>
          <GridChapter />
          <LibraryChapter />
          <VisibilityChapter />
          <DiceChapter />
        </section>

        <section className="closing">
          <h2>Ready to run a game? Start a room and send your players the link.</h2>
          <Link href="/gm-dashboard" className="cta">
            Set up a room
            <ArrowRight weight="bold" aria-hidden="true" />
          </Link>
        </section>
      </main>

      <footer className="landing-shell home-footer">
        <p>Built for CSE 416 at Stony Brook.</p>
      </footer>
    </>
  );
}

/**
 * Grid alignment, live. The faint grid is the map's own squares; the slider sizes the app's
 * grid in map pixels until the two line up at 70, which is the setup step the product is
 * built around.
 */
function GridChapter() {
  const [cell, setCell] = useState(60);
  const lined = cell === CROP.cell;

  return (
    <section className="chapter" ref={revealOnEnter}>
      <h3>
        <GridFour weight="duotone" aria-hidden="true" />
        Use the map you already have.
      </h3>
      <p>
        Got a map with a grid already drawn on it? Match ours to it in seconds, so movement and distances
        line up with the squares your players see. Try it: drag the slider.
      </p>
      <figure className="map-figure" style={{ "--map": `url(${MAPS.grid.src})` } as CSSProperties}>
        <div className="map-frame">
          <img src={MAPS.grid.src} width={CROP.width} height={CROP.height} alt={MAPS.grid.alt} loading="lazy" decoding="async" />
          <MapGrid width={CROP.width} height={CROP.height} cell={CROP.cell} variant="faint" />
          <MapGrid width={CROP.width} height={CROP.height} cell={cell} variant="app" />
        </div>
      </figure>
      <div className="demo-bar">
        <label className="demo-slider">
          Square size
          <input
            type="range"
            min={40}
            max={110}
            step={1}
            value={cell}
            onChange={(e) => setCell(Number(e.target.value))}
          />
        </label>
        <output className="readout">
          <b>{cell}</b> px squares · 1 square = <b>5</b> ft
        </output>
      </div>
      <p className="figure-note" role="status">
        {lined ? "Lined up with the map's squares." : "Drag until the grids line up."}
      </p>
    </section>
  );
}

/**
 * The asset library, described rather than linked: the GM dashboard is its way in
 * (gm-dashboard). No login: the library is keyed to this browser's GM identity until
 * FR-GM-01 lands, and the note below says so rather than implying an account exists.
 */
function LibraryChapter() {
  return (
    <section className="chapter" ref={revealOnEnter}>
      <h3>
        <Stack weight="duotone" aria-hidden="true" />
        Keep your maps for next time.
      </h3>
      <p>
        Upload a map once and set its grid once. It is then one click away in every room you run, along with
        your token art.
      </p>
      <ul className="plain shelf">
        {SHELF.map((asset) => {
          const thumb = THUMBS[asset.id]!;
          const grid = asset.grid!;
          return (
            <li key={asset.id}>
              <div className="shelf-map">
                <img src={thumb.src} width={asset.width} height={asset.height} alt={thumb.alt} loading="lazy" decoding="async" />
                <MapGrid
                  width={asset.width}
                  height={asset.height}
                  cell={grid.cellSize}
                  offsetX={grid.offsetX}
                  offsetY={grid.offsetY}
                  variant="light"
                />
              </div>
              <strong>{asset.name}</strong>
              <span className="readout">
                {asset.width} × {asset.height} · {grid.cellSize}px grid
              </span>
            </li>
          );
        })}
      </ul>
      {/* The library itself is reached from the GM dashboard only (gm-dashboard). */}
      <div className="shelf-foot">
        <p className="muted small-print">
          You'll find it on your GM dashboard. No sign-in needed: it's saved in this browser until accounts
          arrive, so it won't follow you to another computer or phone yet.
        </p>
      </div>
    </section>
  );
}

/** The visibility model, switchable. It mirrors what the server filters actually do. */
function VisibilityChapter() {
  const [asGm, setAsGm] = useState(true);

  return (
    <section className="chapter" ref={revealOnEnter}>
      <h3>
        {asGm ? <Eye weight="duotone" aria-hidden="true" /> : <EyeSlash weight="duotone" aria-hidden="true" />}
        Your players see what you decide they see.
      </h3>
      <p>
        Keep the ambush a surprise. Hide a monster and your players can't see it, can't find it in the turn
        order, and can't dig it out of their browser either.
      </p>

      <div className="seg" role="group" aria-label="Whose view to show">
        <button type="button" aria-pressed={asGm} onClick={() => setAsGm(true)}>
          GM view
        </button>
        <button type="button" aria-pressed={!asGm} onClick={() => setAsGm(false)}>
          Player view
        </button>
      </div>

      <figure className="map-figure" style={{ "--map": `url(${MAPS.visibility.src})` } as CSSProperties}>
        <div className="map-frame">
          <img src={MAPS.visibility.src} width={CROP.width} height={CROP.height} alt={MAPS.visibility.alt} loading="lazy" decoding="async" />
          <MapGrid width={CROP.width} height={CROP.height} cell={CROP.cell} variant="faint" />
          <TokenChip
            name="Brenna"
            color="#5b8def"
            hp={84}
            image={PORTRAITS.visibility.brenna}
            at={{ col: 7, row: 3 }}
          />
          <TokenChip
            name="Toma"
            color="#3fb950"
            hp={61}
            image={PORTRAITS.visibility.toma}
            at={{ col: 11, row: 6 }}
          />
          {asGm && (
            // In the shadowed side chamber, which is where something would hide.
            <span className="token-chip is-hidden" style={inSquare(15, 5)}>
              <span className="token-disc">
                <EyeSlash weight="bold" aria-hidden="true" />
              </span>
              <span className="token-label">Hidden</span>
            </span>
          )}
        </div>
      </figure>
      <p className="figure-note" role="status">
        {asGm
          ? "The dashed token is hidden. Only you can see it."
          : "Your players see no token and no gap in the turn order. Nothing gives it away."}
      </p>
    </section>
  );
}

const cryptoRandom = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0]! / 2 ** 32;
};

/** The table's own parser and roller, imported from @vtt/shared and run right here. */
function DiceChapter() {
  const [input, setInput] = useState("2d6+3");
  const [result, setResult] = useState<{ id: string; expression: DiceExpression; dice: number[]; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  /** The roll whose dice have come to rest; until then its total is withheld. */
  const [landed, setLanded] = useState<string | null>(null);

  function roll(e: FormEvent) {
    e.preventDefault();
    const parsed = parseDiceExpression(input);
    if (!parsed.ok) {
      setError(parsed.message);
      setResult(null);
      return;
    }
    setError(null);
    // The real roll happens now, once. The throw is only how it is shown arriving, and it
    // is the same 3D tray the table throws its rolls into.
    setResult({
      id: `demo-${Math.floor(cryptoRandom() * 2 ** 32)}`,
      expression: parsed.expression,
      ...rollDice(parsed.expression, cryptoRandom),
    });
  }

  const throwing = result !== null && landed !== result.id;
  const modifier = result?.expression.modifier ?? 0;

  return (
    <section className="chapter dice-chapter" ref={revealOnEnter}>
      <div>
        <h3>
          <DiceFive weight="duotone" aria-hidden="true" />
          Every die shown, not just the total.
        </h3>
        <p>
          Type a roll like 2d6+3. Everyone at the table sees every die land, not just the total.
        </p>
        <form className="dice-demo-form" onSubmit={roll}>
          <label>
            What to roll
            <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={32} spellCheck={false} />
          </label>
          <button type="submit" className="ui-button">
            Roll
            <DiceFive weight="bold" aria-hidden="true" />
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
      </div>

      <div className="dice-result" aria-live="polite">
        {result ? (
          <>
            <p className="readout">{formatExpression(result.expression)}</p>
            <DiceTray
              key={result.id}
              roll={{ id: result.id, sides: result.expression.sides, dice: result.dice }}
              throwing={throwing}
              onLanded={() => setLanded(result.id)}
              scale={1.3}
            />
            {throwing ? (
              <p className="muted small-print">Rolling…</p>
            ) : (
              <>
                <p className="dice-total">{result.total}</p>
                <p className="muted small-print">
                  {result.dice.join(" + ")}
                  {modifier !== 0 && ` ${modifier > 0 ? "+" : "-"} ${Math.abs(modifier)}`}
                </p>
              </>
            )}
          </>
        ) : (
          <p className="muted dice-empty">Roll to see each die land.</p>
        )}
      </div>
    </section>
  );
}

/**
 * The GM's way in, second in the hero. The dashboard applies the entry rule (gm-dashboard),
 * so this is a plain link: sign-in first for a new browser, straight in once recognised.
 */
function RunBlock() {
  return (
    <div className="run-path" role="group" aria-labelledby="run-path-label">
      <p id="run-path-label" className="path-label">
        <MapTrifold weight="bold" aria-hidden="true" />
        Running a game?
      </p>
      <p className="path-hint">Create a room or reopen one you've run.</p>
      <Link href="/gm-dashboard" className="cta">
        Set up a room
        <ArrowRight weight="bold" aria-hidden="true" />
      </Link>
    </div>
  );
}

/** Accepts a full invite link or a bare code. */
export function inviteCodeFrom(input: string): string | null {
  const trimmed = input.trim();
  const fromLink = trimmed.match(/\/join\/([^/?#\s]+)/);
  if (fromLink) return decodeURIComponent(fromLink[1]!);
  return /^[a-z0-9]{4,32}$/i.test(trimmed) ? trimmed : null;
}

function useJoinByInvite() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const code = inviteCodeFrom(value);
    if (!code) return setError("That doesn't look like an invite link or code.");
    navigate(`/join/${encodeURIComponent(code)}`);
  }

  return { value, setValue, error, onSubmit };
}

/** The player's way in, first in the hero. "You" here is someone their GM invited. */
function JoinBlock() {
  const j = useJoinByInvite();
  return (
    <form className="join-form" aria-labelledby="join-path-label" onSubmit={j.onSubmit}>
      <p id="join-path-label" className="path-label">
        <LinkSimple weight="bold" aria-hidden="true" />
        Joining a game?
      </p>
      <p className="path-hint">Paste the link your GM sent you. No account needed.</p>
      <label htmlFor="join-invite">Invite link or code</label>
      {/* The label sits outside the row so the field and Join share one height. */}
      <div className="join-row">
        <input
          id="join-invite"
          value={j.value}
          onChange={(e) => j.setValue(e.target.value)}
          required
          placeholder="https://…/join/abc123"
        />
        <button type="submit" className="ui-button">
          Join
        </button>
      </div>
      {j.error && (
        <p role="alert" className="error">
          {j.error}
        </p>
      )}
    </form>
  );
}
