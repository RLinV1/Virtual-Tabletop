# Interface and Page Design — Virtual Tabletop

Part of the [design document](DESIGN.md) — see also [`DELIVERY.md`](DELIVERY.md) and
[`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md).

Page inventory, information architecture, per-page specifications and the design system.

> Section numbers (§11.x) are kept from when this was `DESIGN.md` §11, so existing
> references still resolve. Where this document and `FRONTEND-CONTRACT.md` disagree, the
> contract wins — it was written later and accepts or supersedes what is proposed here.

---

## 11.1 Status

§11.4 onward records the original interface proposal.
**[`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) now accepts or supersedes its individual
decisions**; historical alternatives below are not implementation options. Interface direction is the Board owner's call
(Antonio) and the page inventory is a team decision; this section exists so there is
something concrete to argue with, because until now the document said nothing about what
the application is beyond one room screen.

Two corrections to what this section used to claim. The boards it referenced —
`room-setup.png`, `at-the-table.png`, `between-sessions.png` — **were never produced**;
`assets/ui-reference/` contains only a README describing them. And the palette that README
calls "already applied" (deep slate-teal ground, parchment text, gold accent) is **not**
what ships: `apps/web/src/styles.css` uses a neutral charcoal ground with a blue accent.
The documented direction was abandoned silently. §11.9 picks one.

## 11.2 Page inventory

What exists today, and what a usable product still needs:

| Route | Page | State | Serves |
| --- | --- | --- | --- |
| `/` | Home — the product, Play, and sign in | Built — a bare create form only | Entry for every journey (§11.5) |
| `/join/:inviteCode` | Guest join | Built | FR-PL-01, FR-PL-02 |
| `/r/:roomId` | The table | Built | most of the FR set |
| — | 404 | Built — an unstyled card | — |
| `/signup`, `/login` | Account — any role, role is per room | **Missing** | FR-GM-01, [`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) §13.1 |
| `/rooms` | Room hub — rooms you belong to | **Missing** | FR-GM-01 (`DESIGN.md` §5: an account exists so a user can return and find their rooms). Also where Leave table returns a signed-in user ([`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) §13.1) |
| `/r/:roomId/prepare` | Scene preparation | **Missing** — currently crammed into the table's side panel | FR-GM-02 … FR-GM-07, FR-GM-11 |
| `/r/:roomId/log` | Activity log and undo | **Missing** | FR-REC-01, FR-REC-02 |
| `/r/:roomId/settings` | Access, invites, revocation | **Missing** | FR-GM-20 |
| `/library` | Saved maps, token art, encounter templates | **Deferred — do not build** | [`FRONTEND-CONTRACT.md`](FRONTEND-CONTRACT.md) §13.1 defers saved assets and omits their navigation from the initial release; needs ownership, quota and reuse requirements first |

The gap is not decoration. Three of those rows are requirements with no surface at all: a GM
cannot currently find a room they made last week, revoke a guest, or read the log that
FR-REC-01 requires. Map preparation lives in a scrolling side panel beside the live table,
which means the GM does setup and play in the same cramped column.

## 11.3 Information architecture

Three layers, distinguished by how long a person stays and how much they are asked to think:

1. **Entry** (`/`, `/join/:code`, `/login`, `/signup`) — originating at the home page,
   which is the only surface that explains the product and carries both Play and sign in
   (§11.5). Past it, one decision per screen and no navigation chrome. A player arriving from an invite link must reach the table in under
   30 seconds (README §6), so this layer is a corridor, not a lobby.
2. **Hub** (`/rooms`, `/library`, account) — the between-sessions layer. Persistent left
   navigation, list-dense, optimised for finding one room among many.
3. **Table** (`/r/:roomId` and its sub-surfaces) — the encounter. No global chrome at all:
   the board owns the viewport and everything else is a panel over it. Sub-surfaces
   (prepare, log, settings) open as overlays rather than page navigations, because leaving
   the table would drop the socket and force a resync.

The rule that follows: **navigation chrome decreases as you go deeper.** Entry has none,
hub has a sidebar, the table has none again.

## 11.4 What we take from mature VTTs, and what we refuse

Roll20 is the reference point because README §3 already names its tradeoff: broad
functionality at the cost of onboarding and interface overhead. That is a statement about
*pages*, not features. A mature VTT accretes surfaces — marketplace, compendium, character
sheets, forums, a tabletop sidebar with a dozen tabs — and every one of them is a decision
the user has to route around before play starts.

README §7 already excludes most of that surface area: no character sheets, no rules
automation, no marketplace, no video. The page design should make that exclusion *visible*
rather than leaving room for it.

| Pattern | Take | Refuse |
| --- | --- | --- |
| Persistent list of games you belong to | Yes — §11.2 `/rooms`. Returning to last week's table is FR-GM-01's whole purpose | — |
| Invite link that drops a player at the table | Yes, and go further: no account at all (FR-PL-01) | An account wall anywhere in the player path |
| Tabletop with a side panel | Yes, one panel | A sidebar of many tabs; ours caps at four |
| Layer controls (map / token / fog / GM) | Yes, as board layers | Exposing them as a persistent toolbar the player also sees |
| Settings, permissions, asset library | Yes, as overlays over the table | A settings tree the GM navigates away from play to reach |
| Marketplace, compendium, forums, sheets | — | All of it. Out of scope, and each is a top-level page we then owe navigation to |

The concrete rule this produces: **a player's path from link to playing contains exactly one
screen and one field.** A GM's path from logging in to a prepared map contains no more than
three. Any page proposal that lengthens either is rejected on that basis alone.

## 11.5 The home page

**This is where everything starts.** Not a form and not a marketing page bolted onto the
side of an app — the one surface that explains the product, and the entry point for all
three journeys in §11.3. A first-time GM, a returning user, and a curious stranger all
land here.

**Two actions, and they are not equals.**

- **Play** — primary, high contrast, impossible to miss. For a signed-in user it creates a
  room and opens its table. For a signed-out one it opens login or signup carrying a
  return intent, and authenticating continues into room creation rather than dumping the
  user on a dashboard (`FRONTEND-CONTRACT.md` §13.1). Either way the journey ends at a table
- **Log in / Sign up** — secondary, in a minimal top-right nav. For people who have been
  here before and want their rooms back. Quiet, never competing with Play

Beside the primary action, one line of copy carries the rule so nobody discovers it at the
password field: **"Free account required to host; players join without one"** (`FRONTEND-CONTRACT.md` §13.1). That
sentence is doing real work — it tells a GM what Play will cost them, and tells a player
reading over their shoulder that the invite they were sent asks nothing of them.

A single top bar carries the product name on the left and the auth pair on the right, and
nothing else. There is no room for a navigation menu on a product with three pages.

**Why creation is gated — decided in `FRONTEND-CONTRACT.md` §13.1.**

FR-GM-01 gives the GM "a persistent, trusted identity from which to create and administer
a room", and `routes.ts` currently permits creation without one under a `TODO` marking
that as temporary. Two resolutions were considered: gate Play behind sign-in, or let Play
create an *unclaimed* room claimed afterwards.

**`FRONTEND-CONTRACT.md` §13.1 selects the gate, and keeps `rooms.owner_user_id` non-null.** Unclaimed-room
authority, expiry and ownership transfer are explicitly out of the Core Loop. The return
intent is what preserves the fast start — a signed-out Play is one extra screen, not a
dead end — and it costs no amendment to FR-GM-01 and no new ownership state to reason
about. The unclaimed-room alternative is recorded in `FRONTEND-CONTRACT.md` §13.1 as rejected, not deferred.

Creation is idempotent: a retry with the same request key returns the existing room rather
than making a second one, and a failed creation preserves the session (`FRONTEND-CONTRACT.md` §13.1).

**Above the fold.** An editorial split rather than centred text on a dark rectangle: the
claim and the Play button on one side, a real battle map bleeding off the opposite edge,
masked into the ground so it reads as depth rather than a pasted screenshot. The map is the
product; a stock photograph of dice on a table is not.

- The headline runs **two lines, never more**. It says what the product does in concrete
  verbs — upload a map, start playing — not "elevate your tabletop". Hold it under about
  14 words at a fluid size that stays two lines from 380px to 1920px rather than reflowing
  into a paragraph
- Play sits directly beneath it. One quiet tertiary link — "see a live demo room" — may sit
  beside it for people who want to look before creating anything
- Nothing else. No floating badges over the text, no metric pills, no logo strip

**Below it,** three movements, each a full viewport-height chapter with generous separation
so they read as distinct rather than as a stack of cards:

1. **The setup claim, demonstrated.** The map-to-grid-to-tokens sequence shown as actual
   interface, advancing on scroll. This is the differentiator and it earns the largest
   surface on the page
2. **What the table looks like in play,** from both sides — the GM's hidden tokens and the
   player's filtered view, side by side. The visibility model is the hardest thing to
   explain in words and the easiest to show
3. **Recovery.** The activity log with an undo, because "nothing is unrecoverable" is the
   promise that separates this from a shared image

The page closes by repeating Play. A visitor who has read to the bottom should not have to
scroll back up to act.

**Banned on this page:** a row of three equal feature cards; section eyebrows reading
"FEATURES" or "HOW IT WORKS"; a centred hero; testimonials the project does not have;
invented usage statistics; a second call to action of equal weight to Play.

## 11.6 Entry pages

**`/join/:inviteCode`** — one field, one button, no chrome. A player who is already known to
this browser skips the field entirely and gets "Resume as Alice" instead, because re-typing
a name to rejoin a room you were in five minutes ago is a needless step and risks creating a
second identity (`DESIGN.md` §5).

- Primary action: join
- States: validating the code, invalid or expired code with a plain explanation, submitting
- Not here: anything about accounts. The offer to claim one belongs after the session, on
  the way out — never on the way in (`FRONTEND-CONTRACT.md` §13.1)

**`/login` and `/signup`** — for anyone who wants to be found again, not GM-only (`FRONTEND-CONTRACT.md` §13.1). A
player reaches these only *after* a session, never before: the invite path must not prompt
for an account ahead of play. A single column at reading width, the form
above the fold with no scrolling, and the opposite link (sign in / create account) as quiet
text rather than a second button. Password rules stated *before* the field, not as an error
after submitting.

## 11.7 The room hub

The between-sessions surface, and the one most likely to be built as a wall of identical
cards. It should be a list, because a list scans and a card grid does not.

**Layout.** A single column of rooms at reading width, one row per room, separated by
hairlines rather than boxed. Each row: scene thumbnail at a fixed small size, room name,
when it was last played, participant count. The row is the click target.

**Ordering** is by last played, descending — not alphabetical and not by creation date. The
room you want is almost always the one you were just in.

**States.** Skeleton rows shaped like real rows while loading. The empty state is the first
thing a new GM ever sees and should read as an invitation with the create action inline, not
as an error. Room creation happens here too, so the hub is never a dead end.

## 11.8 The table: layers and panels

The most complex screen and the one with the strictest rule: **the board owns the viewport.**
Everything else is a panel over it or a column beside it, and nothing may push the board
smaller than it needs to be.

**Regions.**

- **Board** — the full remaining area, with no global navigation bar above it. There is
  nowhere to navigate to; leaving would drop the socket
- **Panel** — a fixed column on the right at desktop width, beneath the board as tabs below
  720px, beside it again in landscape (KAN-55). Four tabs at most: Play, Tokens, Dice, and
  Manage for the GM. When a fifth is proposed, something merges
- **Board controls** — a small cluster floating over the board's corner: fit, zoom, and
  the layer switcher. Floating rather than docked, because a docked toolbar costs board
  height permanently for controls used occasionally
- **Status** — connection state and seq, inline in the panel header. Never a modal. A
  reconnect must not interrupt play, and a dialog over the board does exactly that

**Layers,** in draw order, bottom to top: map, grid, drawings and templates, tokens,
condition markers, fog, ephemeral effects (pings, drag previews, rulers). The GM can target
a layer for editing; a player never sees a layer control, because administrative layer targeting is GM-only. Players still receive permitted
drawing and AoE tools; tool access is distinct from layer administration (`FRONTEND-CONTRACT.md` §13.5). Fog and GM-only geometry are not merely hidden in the player's
renderer — they are absent from the payload (FR-GM-23), and the interface should not imply
otherwise by showing a disabled control.

**Overlays** open over the table and never navigate away from it: scene preparation, the
activity log, room settings. Each is a wide sheet rather than a column, dismissible with
Escape, and returns focus to the control that opened it. Preparation in particular needs
width — a GM aligning a grid against a map is comparing two things and cannot do it in a
20rem strip.

**Density** is highest here and only here. The panel may compress padding and use tabular
figures at a smaller size; the entry and hub pages may not. A GM tracking eight tokens
through an encounter wants information per square inch, and the same person on the landing
page wants space.

## 11.9 Design system

**Direction.** Resolve the palette split in favour of the team's original intent: a deep,
slightly cool ground with a **single warm accent**. That reads as a table lit from above,
which is what the product is, and it avoids the blue-on-charcoal default that every
developer tool already uses. The shipped blue accent should go.

| Token | Value | Use |
| --- | --- | --- |
| `--ground` | `#0f1418` | Page and board surround. Never pure black |
| `--panel` | `#161d22` | Panels, overlays |
| `--hairline` | `#24323a` | 1px separators — the primary grouping device |
| `--text` | `#e8e2d4` | Body |
| `--muted` | `#8a9aa3` | Secondary, labels |
| `--accent` | `#d6a355` | The single accent: primary action, active turn |
| `--ok` `--warn` `--danger` | `#4caf7d` `#d29922` `#c4564f` | Status only, never decoration |

One accent, under 80% saturation. Status colours are never the only signal — the active
turn carries a glyph and position as well as gold, conditions carry a shape and an
abbreviation as well as a fill (FR-TAC-08).

**Typography.** A geometric grotesk for the interface and a true monospace for anything
numeric — initiative scores, hit points, dice results, seq numbers all need tabular figures
so they stop jittering as they change.

```
--font-ui:   "Geist", "Satoshi", system-ui, sans-serif
--font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace
```

Serifs are out: this is software, not editorial. Headings control hierarchy through weight
and colour rather than size — a room name is `text-lg font-semibold tracking-tight`, not a
display heading. Body copy caps at 65 characters.

**Space and materiality.** Group by hairline and negative space, not by boxing everything in
a card. A card is justified only when elevation means something — an overlay above the
table, a menu above the panel. Panels sit flat on the ground with a single hairline.
Shadows, when used, are tinted to the ground rather than black.

**Motion.** Fluid but not cinematic. `transition: 0.24s cubic-bezier(0.16, 1, 0.3, 1)` for
state changes; spring physics for anything the user drags or drops. Animate `transform` and
`opacity` only — never `width`, `height`, `top` or `left`, which would fight the Pixi
canvas for the compositor. Two things earn continuous motion and nothing else does: the
active-turn indicator and the connection status. `prefers-reduced-motion` removes both.

**Density** varies by layer: airy at entry (generous spacing, one decision per view),
moderate in the hub, and tight at the table, where a GM tracking eight tokens needs
information per square inch. The table panel is the only surface that may compress padding.

**Icons.** One set, one stroke weight (1.5), from Phosphor or Radix. No emoji anywhere in
the interface, ever — they render differently on every platform and read as placeholder.

## 11.10 Interface states

Every data surface specifies four states, not one. Prototypes ship the success case and
discover the rest in front of a grader.

- **Loading** — skeletons shaped like the content that will replace them. No spinners
- **Empty** — says what to do next. "No rooms yet — create one to get started", not a blank
  panel. The empty table and empty roster are the first thing a new GM sees
- **Error** — inline and specific, next to the thing that failed. Errors that need a retry
  carry the retry. A rejected command surfaces the server's reason, since `decide` already
  returns one
- **Offline** — the board stays interactive and visibly stale rather than blanking. The
  status line owns this; nothing modal

## 11.11 Responsive and accessibility

Breakpoints at 720px and 1024px. Below 720 the panel moves beneath the board and becomes
tabs; in landscape on a phone the panel returns to the side, because width is what a
landscape phone has (see KAN-55). The board refits when the viewport changes only if the
viewer has not positioned their own camera — an independent viewport is FR-TAC-01, and a
rotation must not undo a deliberate pan (KAN-54).

Accessibility is a stated target (README §6: WCAG 2.2 AA for non-canvas UI), which means
concretely: every interactive element reachable by keyboard and visible when focused; touch
targets at least 44px on coarse pointers; colour never the sole carrier of meaning; the
canvas paired with a DOM equivalent for anything it expresses — the roster is the keyboard
path to token selection (FR-GM-24), and any future canvas-only affordance needs the same
treatment.

---

