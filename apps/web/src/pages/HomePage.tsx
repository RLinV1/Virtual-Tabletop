import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  formatExpression,
  parseDiceExpression,
  rollDice,
  type DiceExpression,
  type GmRoomSummary,
} from "@vtt/shared";
import {
  ArrowRight,
  CircleHalfTilt,
  DiceFive,
  Eye,
  EyeSlash,
  GridFour,
  LinkSimple,
  Moon,
  Stack,
  Sun,
} from "@phosphor-icons/react";
import { Link } from "../Link";
import { api } from "../net/api";
import { revealOnEnter } from "../ui/reveal";
import { getGmToken } from "../net/gm";
import { loadGmToken, newGuestToken, saveCredentials } from "../net/identity";
import { navigate } from "../router";
import { useGroundTheme, type ThemeChoice } from "../theme";
import { DiceTray } from "../ui/DiceTray";

/** One map per section, so the page shows three encounters rather than one three times. */
const MAPS = {
  hero: {
    src: "/img/hero-map.webp",
    alt: "A ruined mountain keep of stone bridges and waterfalls, with a red dragon coiled over its treasure.",
  },
  grid: {
    src: "/img/map-ice.webp",
    alt: "A snowbound fortress of stone bridges and frozen waterfalls around a glowing blue crystal.",
  },
  visibility: {
    src: "/img/map-jungle.webp",
    alt: "An overgrown temple city of golden sun discs, serpent statues and turquoise pools.",
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

/** The shelf in the library chapter. Real files, real dimensions, real default grid. */
const SHELF = [
  { ...MAPS.hero, name: "The Broken Span" },
  { ...MAPS.grid, name: "Hollowfrost Keep" },
  { ...MAPS.visibility, name: "Temple of the Green Sun" },
] as const;

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
  style: CSSProperties;
  delay?: number;
}) {
  const [artFailed, setArtFailed] = useState(false);
  const art = props.image && !artFailed ? props.image : null;
  return (
    <span className="token-chip" style={{ ...props.style, animationDelay: `${props.delay ?? 0}ms` }}>
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
  const roomNameRef = useRef<HTMLInputElement>(null);

  function focusCreate() {
    roomNameRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    roomNameRef.current?.focus({ preventScroll: true });
  }

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
              Upload a map, line up the grid, place your tokens. Players join from any browser, no account
              needed.
            </p>
            <CreateRoomForm firstFieldRef={roomNameRef} />
          </div>
          <div className="hero-art enter enter-art" style={{ "--map": `url(${MAPS.hero.src})` } as CSSProperties}>
            <div className="hero-frame">
              <img
                src={MAPS.hero.src}
                width={1672}
                height={941}
                alt={MAPS.hero.alt}
                fetchPriority="high"
              />
              <TokenChip
                name="Brenna"
                color="#5b8def"
                hp={84}
                image={PORTRAITS.hero.brenna}
                style={{ left: "27%", top: "46%" }}
                delay={560}
              />
              <TokenChip
                name="Toma"
                color="#3fb950"
                hp={61}
                image={PORTRAITS.hero.toma}
                style={{ left: "40%", top: "63%" }}
                delay={680}
              />
              <TokenChip
                name="Ash"
                color="#d29922"
                hp={38}
                image={PORTRAITS.hero.ash}
                style={{ left: "17%", top: "68%" }}
                delay={800}
              />
            </div>
          </div>
        </section>

        <YourRooms />
        <JoinByInviteBand />

        <GridChapter />
        <LibraryChapter />
        <VisibilityChapter />
        <DiceChapter />

        <section className="closing">
          <h2>Start a room and send the link.</h2>
          <button type="button" className="cta" onClick={focusCreate}>
            Create room
            <ArrowRight weight="bold" aria-hidden="true" />
          </button>
        </section>
      </main>

      <footer className="landing-shell home-footer">
        <p>Built for CSE 416 at Stony Brook.</p>
      </footer>
    </>
  );
}

/**
 * Rooms this browser owns. Renders nothing at all until there is something to show, so a
 * first-time visitor sees the same page a returning GM does, only shorter.
 */
function YourRooms() {
  const [rooms, setRooms] = useState<GmRoomSummary[] | null>(null);

  useEffect(() => {
    const gmToken = loadGmToken();
    if (!gmToken) return;
    let live = true;
    // A failure here is not worth a message on the home page: the section just stays away.
    api.gm.rooms(gmToken).then((r) => live && setRooms(r), () => {});
    return () => {
      live = false;
    };
  }, []);

  if (!rooms?.length) return null;

  return (
    <section className="your-rooms" ref={revealOnEnter}>
      <h2>Your rooms</h2>
      <ul className="plain room-list">
        {rooms.map((room) => (
          <li key={room.id}>
            <div>
              <strong>{room.name || "Untitled room"}</strong>
              <span className="muted"> · active {formatRelative(room.lastActiveAt)}</span>
            </div>
            <button type="button" className="ui-button" onClick={() => navigate(`/r/${room.id}`)}>
              Open
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small-print">Saved in this browser until accounts arrive.</p>
    </section>
  );
}

/**
 * Grid alignment, live. Dragging the slider moves a real overlay across a real map, which
 * is the shape of the setup step the product is built around.
 */
function GridChapter() {
  const [cell, setCell] = useState(70); // DEFAULT_GRID.cellSize

  return (
    <section className="chapter" ref={revealOnEnter}>
      <h2>
        <GridFour weight="duotone" aria-hidden="true" />
        Use the map you already have.
      </h2>
      <p>
        Size the cells until the squares land on the ones the cartographer drew. Drag the slider: this is the
        overlay, not a picture of one.
      </p>
      <figure className="map-figure" style={{ "--map": `url(${MAPS.grid.src})` } as CSSProperties}>
        <div className="map-frame">
          <img src={MAPS.grid.src} width={1672} height={941} alt={MAPS.grid.alt} loading="lazy" decoding="async" />
          <div className="grid-overlay live" style={{ backgroundSize: `${cell}px ${cell}px` }} aria-hidden="true" />
        </div>
      </figure>
      <div className="demo-bar">
        <label className="demo-slider">
          Cell size
          <input
            type="range"
            min={36}
            max={140}
            step={1}
            value={cell}
            onChange={(e) => setCell(Number(e.target.value))}
          />
        </label>
        <output className="readout">
          cellSize <b>{cell}</b> px · one square = <b>5</b> ft
        </output>
      </div>
    </section>
  );
}

/**
 * The asset library, and the home page's only way into it. No login:
 * the library is keyed to this browser's GM identity until FR-GM-01 lands, and the note
 * below says so rather than implying an account exists.
 */
function LibraryChapter() {
  return (
    <section className="chapter" ref={revealOnEnter}>
      <h2>
        <Stack weight="duotone" aria-hidden="true" />
        Keep your maps for next time.
      </h2>
      <p>
        Upload a map once and set its grid once. It is then one click away in every room you run, along with
        your token art.
      </p>
      <ul className="plain shelf">
        {SHELF.map((asset) => (
          <li key={asset.src}>
            <img src={asset.src} width={1672} height={941} alt={asset.alt} loading="lazy" decoding="async" />
            <strong>{asset.name}</strong>
            <span className="readout">1672 × 941 · 70px grid</span>
          </li>
        ))}
      </ul>
      <div className="shelf-foot">
        <Link href="/library" className="ui-button">
          Open the asset library
        </Link>
        <p className="muted small-print">
          No sign-in needed. The library is tied to this browser until accounts arrive, so it does not follow
          you to another device yet.
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
      <h2>
        {asGm ? <Eye weight="duotone" aria-hidden="true" /> : <EyeSlash weight="duotone" aria-hidden="true" />}
        Your players see what you decide they see.
      </h2>
      <p>
        Hide a token and it never reaches the player's browser. The server filters every snapshot, every
        update, and the turn order itself.
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
          <img src={MAPS.visibility.src} width={1672} height={941} alt={MAPS.visibility.alt} loading="lazy" decoding="async" />
          <TokenChip
            name="Brenna"
            color="#5b8def"
            hp={84}
            image={PORTRAITS.visibility.brenna}
            style={{ left: "27%", top: "46%" }}
          />
          <TokenChip
            name="Toma"
            color="#3fb950"
            hp={61}
            image={PORTRAITS.visibility.toma}
            style={{ left: "40%", top: "63%" }}
          />
          {asGm && (
            <span className="token-chip is-hidden" style={{ left: "61%", top: "23%" }}>
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
          ? "The dashed token is hidden. Only the GM's browser ever receives it."
          : "The hidden token is gone, and so is its place in the turn order."}
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
        <h2>
          <DiceFive weight="duotone" aria-hidden="true" />
          Every die shown, not just the total.
        </h2>
        <p>
          Type an expression and roll. This box runs the same parser and roller the table does, and throws the
          same dice.
        </p>
        <form className="dice-demo-form" onSubmit={roll}>
          <label>
            Dice expression
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

/** The room the GM is about to run: name it, name yourself, go. */
function useCreateRoom() {
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const gmToken = await getGmToken();
      const guestToken = newGuestToken();
      const created = await api.createRoom({ roomName, displayName, guestToken, gmToken });
      saveCredentials({ ...created, guestToken });
      navigate(`/r/${created.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room");
      setBusy(false);
    }
  }

  return { roomName, setRoomName, displayName, setDisplayName, error, busy, onSubmit };
}

function CreateRoomForm({ firstFieldRef }: { firstFieldRef?: RefObject<HTMLInputElement | null> }) {
  const f = useCreateRoom();
  return (
    <form className="hero-form enter enter-3" onSubmit={f.onSubmit}>
      <label>
        Room name
        <input
          ref={firstFieldRef}
          value={f.roomName}
          onChange={(e) => f.setRoomName(e.target.value)}
          required
          maxLength={80}
          placeholder="The Broken Span"
        />
      </label>
      <label>
        Your name (GM)
        <input
          value={f.displayName}
          onChange={(e) => f.setDisplayName(e.target.value)}
          required
          maxLength={40}
          placeholder="Your name"
        />
      </label>
      {f.error && (
        <p role="alert" className="error">
          {f.error}
        </p>
      )}
      <button type="submit" className="cta" disabled={f.busy}>
        {f.busy ? "Creating…" : "Create room"}
        {!f.busy && <ArrowRight weight="bold" aria-hidden="true" />}
      </button>
    </form>
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

function JoinByInviteBand() {
  const j = useJoinByInvite();
  return (
    <form className="invite-band" onSubmit={j.onSubmit}>
      <p>
        <LinkSimple weight="bold" aria-hidden="true" />
        Someone sent you a link? You do not need an account.
      </p>
      <label>
        Invite link or code
        <input
          value={j.value}
          onChange={(e) => j.setValue(e.target.value)}
          required
          placeholder="https://…/join/abc123"
        />
      </label>
      {j.error && (
        <p role="alert" className="error">
          {j.error}
        </p>
      )}
      <button type="submit" className="ui-button">
        Join
      </button>
    </form>
  );
}

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString();
}
