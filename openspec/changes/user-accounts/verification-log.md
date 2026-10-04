# Verification log: user-accounts

A record of every manual test run against a live app for this change: what was touched, what was
done, what happened, and what was fixed because of it. Newest entries at the bottom of each section.

## Environment (2026-10-03)

Nothing here touched your own running dev servers (`:3001` / `:5173`, pointed at the `vtt` database)
or the `vtt` database itself.

| What | Where | Why | Cleanup |
|---|---|---|---|
| Scratch Postgres DB `vtt_kan7_fresh` | compose container `vtt-postgres-1` | migration test from empty; server tests; the live test server | drop when done |
| Scratch Postgres DB `vtt_kan7_old` | same | migration test from `0005` with existing rows | drop when done |
| Test server | `:3101`, `DATABASE_URL=…/vtt_kan7_fresh`, uploads to session scratchpad, `MINIO_AUTODETECT=0` | isolated from your dev server | stop when done |
| Test web | `:5273`, proxying to `:3101` | isolated from your Vite | stop when done |
| Temporary `.claude/launch.json` entries `kan7-server`, `kan7-web` | tracked file | to start the two servers above | **reverted** |

Origins used as separate "devices" (each has its own cookies and storage):

| Origin | Stands for |
|---|---|
| `http://localhost:5273` | Sam's laptop (GM) |
| `http://127.0.0.1:5273` | Sam's phone (GM) |
| `http://10.26.141.199:5273` (this Mac's LAN address) | a player's phone on the LAN; used signed out only |
| `http://[::1]:5273` | Kira's device (player) |

Test accounts (scratch DB only; the password is a throwaway shared by both and is not recorded here):

| Email | Display name | Role in test |
|---|---|---|
| `sam.gm@example.com` | Sam | GM, hosts "Goblin Cave" (invite `pena6z25ky`) |
| `kira.player@example.com` | Kira | player |

Test room: "Goblin Cave", `fce19f08-a517-4ba3-b27f-351bcf2dfaeb`.

## Migration

| Step | Result |
|---|---|
| `prisma migrate deploy` on empty `vtt_kan7_fresh` | 0001 to 0006 applied |
| Apply 0001 to 0005 to `vtt_kan7_old`, insert a device identity, a room it owns and a credential, then apply 0006 | applied; the credential kept, `session_hash` null; device row kept |
| Operator reset (`account:reset-password`) against `vtt_kan7_fresh` with a seeded user and session | old password refused, printed password accepted, session deleted; unknown email exits 1 |

## Browser walk-through

| # | Origin | Action | Result |
|---|---|---|---|
| 1 | localhost | Home page | "Free account required to host; players join without one." beside Set up a room |
| 2 | localhost | Set up a room, signed out | **Bug:** landed on `/signin?next=/signin?next=/gm-dashboard`. Fixed (see Fixes 1). After fix: `/signin?next=%2Fgm-dashboard` |
| 3 | localhost | Create an account as Sam | landed on Your rooms; menu shows "Sam"; `document.cookie` is empty (cookie is HttpOnly) |
| 4 | localhost | Create room "Goblin Cave" | in the room as GM; stored seat marked as account seat with invite code; no `vtt.gm` token written |
| 5 | 127.0.0.1 | Sign in as Sam with a wrong password | "Email or password is incorrect." in place; email kept |
| 6 | 127.0.0.1 | Sign in, Open Goblin Cave | **Bug:** "This request didn't come from the app" (403). Fixed (see Fixes 2). After fix: in the room as GM (Share control shown) |
| 7 | 127.0.0.1 → localhost | Chat from the second device | message arrived on localhost; localhost still connected |
| 8 | LAN | Join by invite as "Kim" | join page asked only for a name; in the room; no keep-seat offer while signed out |
| 9 | LAN | Dice tab signed out | Dice tab alone, with "Sign in to keep your dice on every device" |
| 10 | LAN | New dice look | **Bug (also on `main`):** nothing happened; console `crypto.randomUUID is not a function`. Fixed (see Fixes 3). After fix: "Dice look 1" created |
| 11 | [::1] | Join by invite as "Kira", make a browser dice look "Jungle" with a d20 picture | in the room as guest; look stored in this browser |
| 12 | [::1] | Create an account from the Dice tab's sign-in link | **Bug:** landed on `/gm-dashboard`, not back on the Dice tab. Fixed (see Fixes 4) |
| 13 | [::1] | Sign out from the account menu | home page; top bar shows Sign in / Create account |
| 14 | [::1] | Sign in from `/signin?next=/library?tab=dice` | back on the Dice tab (fix 4 confirmed); full library tabs shown to a player; offer "This browser has 1 dice look of its own" |
| 15 | [::1] | Save to my account | "Saved 1 dice look to your account"; server lists "Jungle" with its d20 at `/uploads/<uuid>.webp`; it is the look in use; browser copies: 0 |
| 16 | [::1] | Back in the room, signed in on a guest seat | "Keep this seat on your account? Then you can come back as Kira…" shown |
| 17 | [::1] | Keep seat | offer gone; `/api/me/rooms` lists Goblin Cave under Playing; stored seat marked as account seat |
| 18 | kira.localhost | Sign in as Kira (second device) | Your rooms shows Goblin Cave under Playing, nothing under Hosting |
| 19 | kira.localhost | Open Goblin Cave | in the room as a player (no Share, no Manage); same participant id as on [::1] (`22c56485…`); Dice panel choice is "Jungle" (account look followed her) |
| 20 | [::1] (second tab) | Sign out from the account menu while the room is open in the first tab | the room tab shows "You signed out on this device… Sign in again"; its stored seat is removed; kira.localhost stays connected |
| 21 | [::1] | Sign in again from that screen | back in the room as the same participant, without a keep offer |
| 22 | kira.localhost | Open the invite link again | "You're already at this table" with "Resume as Kira", no join form |
| 23 | 127.0.0.1 | Seed a legacy device identity in the scratch DB (1 token image, 1 creature), put its token in this origin's storage, open Your rooms | "Bring this browser's rooms into your account… 1 library image and 1 creature" |
| 24 | 127.0.0.1 | Move into my account | "Moved into your account: 1 library image and 1 creature."; both listed in Sam's library; `vtt.gm` removed from storage; the old token now gets 401 |
| 25 | all | Server log and browser consoles | no server errors; console errors only the expected ones (step 5's wrong password, step 6's 403 before its fix, step 24's check of the old token) |
| 26 | localhost | Home page at 390×844 and 1366×768 | Join button, the hosting line and Set up a room all above the fold; on the phone, before the hero map; signed in, the top bar shows "Your rooms" |

| 27 | LAN | Set up a room signed out, then Back | Back returns to the home page, not to a redirect |
| 28 | LAN | Open `/library` signed out | sent to `/signin?next=%2Flibrary` |
| 29 | kira.localhost → [::1] | Make look "Ice" on one device; the other tab was in the background (hidden) | **Not verified:** the reload-on-focus path never ran, because the hidden browser pane keeps every tab hidden. Loading the account's looks when a page opens is verified (step 19) |

Screenshots for the PR were not captured: the browser pane was hidden, so it could not render
frames. Every check above was read from the page's text, the DOM, storage or the API instead.

## Fixes made because of this testing

1. **Sign-in redirect wrapped twice** (`apps/web/src/account/RequireAccount.tsx`). React StrictMode
   runs the redirect effect twice in dev, and the second run read the address after the first had
   replaced it. The page's address is now read once, when it renders.
2. **Second device refused as cross-site** (`apps/web/vite.config.ts`). Vite's string proxy
   shorthand sets `changeOrigin: true`, rewriting `Host` to the API server's, so the server's
   Origin-equals-Host check (ADR 0017 I3) refused every origin but the one in `CLIENT_ORIGIN`,
   including phones on the LAN. The `/api` and `/uploads` proxies now keep the browser's `Host`.
3. **New dice look failed on plain-http LAN** (`apps/web/src/ui/diceLookBackends.ts`).
   `crypto.randomUUID` exists only on secure origins; ids now fall back to `crypto.getRandomValues`.
   This bug is also on `main` (in `diceSkinStore.ts`).
4. **Sign-in/up forgot where to return** (`apps/web/src/account/AccountPages.tsx`). The "already
   signed in" effect and the submit handler both redirected, and the second re-read `next` from an
   address that had already changed. `next` is now read once, when the page renders.

## shared-dice-looks: your skin set on the table (2026-10-03, second session)

**Environment.** Both scratch databases had been dropped since the first session, so
`vtt_kan7_fresh` was recreated from migrations and new test accounts made (same emails; a new
throwaway password kept only in the session scratchpad). The temporary `kan7-server` / `kan7-web`
entries were added to `.claude/launch.json` again and **reverted** afterwards; both servers were
stopped. Your six sheets (1536 × 1024, d4 to d20) were copied into the test server's upload folder
so the page could load them.

**Setup** (scratchpad script `setup-table.mjs`): accounts Sam and Kira; Sam's room "Temple Run"
(`1af27d9e…`, invite `xt6grj8a7k`) with the built-in map "Temple of the Green Sun".

| # | Who / origin | Action | Result |
|---|---|---|---|
| 30 | Kira, [::1] | Sign in, join by invite | in the room; seat kept on the account |
| 31 | Kira, [::1] second tab | New dice look; upload all six sheets through the editor's file inputs | server holds 6 faces, each 1536 × 1024 |
| 32 | Kira, [::1] | Choose the look in the Dice panel | note "Everyone at the table sees your rolls in your look."; one `ParticipantDiceLookSet` (seq 5) with all six pictures |
| 33 | Sam, localhost | Sign in, Open from Your rooms | in as GM |
| 34 | Alex, 127.0.0.1 | Join as a guest | in as player; the note shown: "Only you see your look. Sign in and keep your seat…" |
| 35 | Kira (script `kira-throw.mjs`, her seat credential) | Drop 1d20, 1d4, 1d8, 1d10, 1d12, 1d6 on the map | on Sam's and Alex's screens each die is drawn in its own sheet: 20, 4, 8, 10, 12 and 6 faces, each with the matching picture |
| 36 | Kira, [::1] | Roll 2d6 with her Roll button | her own dice drawn in the d6 sheet |
| 37 | Alex | Turn off "Show other players' dice looks", Kira drops a d20 | **Bug:** still drawn in Kira's look. Fixed (see Fixes 5). After fix: classic for Alex, still Kira's look for Sam; turned back on, Kira's look again |
| 38 | Sam | Reload, Kira drops 2d20 | both in Kira's d20 sheet (the look arrives with the room snapshot) |
| 39 | Sam | Participants list: "Reset dice" shown for Kira only (Alex has no look); click it | seq 18 clears the look; **Kira's browser does not put it back** (see Fixes 6); Kira's next d20 is classic for Alex |
| 40 | Kira | Choose Classic, then her look again | seq 20 puts it back; Alex sees it again |
| 41 | test server | Move the d20 sheet's file away (404), reload Alex, Kira drops d20 and d6 | d20 drawn classic, with no blank faces; d6 still in its sheet. File put back afterwards |

**Not verified in the browser:** a GM's private roll staying slate while the GM has a look on the
table (task 4.1); editing a face of the look in use reaching the table (task 4.2); the note for a
signed-in viewer whose seat isn't kept. All three are covered by the code path and unit tests, not
by a live check. Screenshots: none (the browser pane was hidden).

## shared-dice-looks: ownership across accounts (2026-10-03, third session)

**Environment.** Same scratch database `vtt_kan7_fresh` and room "Temple Run" as steps 30 to 41.
The temporary `kan7-server` entry was added to `.claude/launch.json` again and **reverted**
afterwards; the server was stopped. No browser and no web server this time: each person is a
separate sign-in (own session cookie) and a separate Socket.IO connection, from scratchpad scripts
`ownership-attacks.mjs` and `leak-check.mjs`. New test accounts `riley.player@example.com` and
`jo.player@example.com` (same throwaway password, kept only in the session scratchpad).

People: Kira (owns the six-sheet look, seat kept on her account), Sam (GM, another account), Riley
(another account, joined signed in, so the seat is kept), Pat (guest), Jo (an account, but joined
signed out, so the seat is not kept), plus one more guest for the snapshot check.

| # | Who | Action | Result |
|---|---|---|---|
| 42 | Sam | List Sam's dice looks | 0 looks; Kira's is not listed (the Dice panel and Library read this list) |
| 43 | Sam | Rename, make it Sam's look in use, delete a face, delete Kira's look, each by its id over HTTP | 404 every time; Kira's look unchanged afterwards |
| 44 | Sam, Riley, Pat | `participant.setDiceLook` with Kira's look id | `forbidden` for all three |
| 45 | Riley | Make Riley's own look with a d6 sheet, put it on the table | accepted (one event); Kira sending Riley's look id: `forbidden` |
| 46 | Jo | Her own look, from a seat not kept on her account | `forbidden` |
| 47 | Riley, Pat | Command carrying a `look` object and a target participant | refused as `bad_request`; nothing appended |
| 48 | Riley, Pat | `participant.clearDiceLook` on Kira | `forbidden` (only the GM may reset) |
| 49 | Kira | Her look on the table after 42 to 48 | unchanged; Sam's and Pat's seats have no look; 1 event appended in all (Riley's own look) |
| 50 | new guest | Snapshot on joining | Kira's look arrives as id, version and six `/uploads/<uuid>.webp` pictures; no email, account id or look name anywhere in it |

20 of 20 checks in `ownership-attacks.mjs` passed, and 3 of 3 in `leak-check.mjs`.

## Many accounts in one room, and room capacity (2026-10-03, third session)

**Environment.** Scratch database `vtt_kan7_fresh`; the temporary `kan7-server` entry in
`.claude/launch.json` again, this time with `TRUST_PROXY=1` so each fake person in the capacity run
could sign up from its own `X-Forwarded-For` address (the limit of 10 sign-ups an hour per address
would otherwise stop the setup). **Reverted** afterwards; the server was stopped. Scripts in the
session scratchpad: `multi-account-join.mjs`, `capacity.mjs`. New test accounts:
`mia`, `theo`, `noor`, `ada.player@example.com`, and `cap001` to `cap504@example.com`, all with the
same throwaway password kept only in the session scratchpad. Machine: Apple M5, 10 cores; Postgres
in the compose container; no Redis.

### Many accounts in one room: "Crowded Table" (`71ffcc70…`)

| # | Action | Result |
|---|---|---|
| 51 | Six accounts (Kira, Riley, Jo, Mia, Theo, Noor) join by invite at the same moment, signed in; a guest joins too | all 200, six different participants |
| 52 | Every connection's view of the table | all 8 (Sam, six accounts, the guest) see the same 8 people: 1 GM, 7 players |
| 53 | Mia chats | all 8 connections receive it |
| 54 | Your rooms for each account | each player: under Playing, not Hosting; Sam: under Hosting, not Playing |
| 55 | Riley joins again; Sam joins the room Sam hosts, as a player | both 409 "You're already in this room as …"; no new participant |
| 56 | Ada joins with the name "kira" | 409, the name is taken (case ignored) |
| 57 | Ada joins from two signed-in devices at the same moment | one 200, one 409: exactly one Ada seat |
| 58 | Riley signs in on a second device and opens the room | same participant; both devices connected at once; a chat from the phone arrives as Riley |
| 59 | Riley signs out on the phone | the phone's room connection ends (`signed_out`); Riley's laptop and everyone else stay connected |
| 60 | Theo leaves, then joins again | the table sees Theo leave; Your rooms drops the room, then lists it again with a new seat |
| 61 | Sam removes Noor | Noor's connection ends (`revoked`); joining from the invite and resuming on another device both 403; Your rooms drops it |
| 62 | Final table, and everything every connection was sent | Sam, Kira, Riley, Jo, Mia, Theo, Ada, the guest; no email or account id anywhere |
| 63 | `room_members` for the room | one row per account, none twice; Riley's phone credential deleted at sign-out; Theo's row points at the new seat; Noor's row kept, as the lock that keeps Noor out |

31 of 31 checks passed. (Two failures on the first run were the script's own: it did not apply
join events to the GM's view, and it waited for an answer to "leave" that the server ends the
connection instead of sending.)

### Capacity

README §NFR: "1 GM and at least 8 concurrent remote players". The code sets **no maximum** on
players per room. Each round: a new room; N accounts join by invite at the same moment and connect
at once; then every player sends a chat **and** rolls 1d20 at the same moment (2N commands). Checks:
every join accepted; every connection sees N + 1 people; every command accepted and every
connection receives all of them; every connection ends on the same seq, with no gap or repeat; a
fresh snapshot matches; no connection dropped; no server errors.

| Players | Joined | Join p95 | All joined | All connected | Command p50 | Command p95 | Command max | Burst seen by all | Server RSS | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| 8 | 8/8 | 83 ms | 84 ms | 23 ms | 29 ms | 48 ms | 48 ms | 49 ms | 187 MB | pass |
| 16 | 16/16 | 154 ms | 155 ms | 22 ms | 53 ms | 95 ms | 98 ms | 110 ms | 191 MB | pass |
| 32 | 32/32 | 248 ms | 255 ms | 25 ms | 107 ms | 191 ms | 201 ms | 212 ms | 212 MB | pass |
| 64 | 64/64 | 413 ms | 435 ms | 36 ms | 280 ms | 529 ms | 551 ms | 553 ms | 228 MB | pass |
| 128 | 128/128 | 788 ms | 833 ms | 68 ms | 538 ms | 1163 ms | 1236 ms | 1252 ms | 218 MB | pass |
| 256 | 256/256 | 1653 ms | 1745 ms | 145 ms | 1542 ms | 2978 ms | 3141 ms | 3159 ms | 232 MB | pass |

Every command in a room runs one at a time, and each append is a Postgres write, so the time to
clear a burst grows with its size: about 6 ms per command here. That is the worst case (everyone
acting in the same instant), on one machine with no network between client and server.

**Not covered:** the browser UI with dozens of people (the participants list, the board); real
network latency; several rooms busy at once; Redis.

**Found, not fixed:** nothing caps players per room, and nothing limits joins. Anyone holding the
invite link can add guest seats without end, each a stored event and credential. This is on `main`
too (guest joins predate this change).

## room-player-cap: a full room (2026-10-03, third session)

**Environment.** Scratch database `vtt_kan7_fresh`; temporary `kan7-server` and `kan7-web` entries
in `.claude/launch.json` (no `TRUST_PROXY` this time), **reverted** afterwards; both servers stopped.
Scratchpad script `fill-room.mjs`. Room "Full House" (`d15e231f…`, invite `avr7ss3hpb`), hosted by
Sam, filled with 32 guests ("Guest 1" to "Guest 32") joining at the same moment.

| # | Who / origin | Action | Result |
|---|---|---|---|
| 64 | script | 32 guests join at once; then a 33rd guest; then Kira, signed in | 32 × 200; the 33rd and Kira both 409 `room_full`, "This room is full: it holds 32 players. Ask the GM for a seat." |
| 65 | guest, 127.0.0.1 | Open the invite link, type "Quinn", Join | the page shows the message as an alert; the name field is **not** marked invalid; "Quinn" kept; Join still enabled; no seat stored |
| 66 | Sam, localhost (still signed in from earlier) | Open Full House from Your rooms; Participants | **Found:** at 1024 px wide the Participants button is under the top bar's Play / Tokens / Dice tabs, so a click lands on Tokens. Pre-existing (the top bar is from `main`, unchanged here); flagged separately, not fixed. At 1440 px it opens |
| 67 | Sam | Participants list | "32 of 32 player seats taken", but at the **bottom** of a 33-name list that scrolls. Moved above the names (see design D3); after the move it is visible on open |
| 68 | Sam | Remove Guest 1, confirm | the button reads "Participants, 32"; the line "31 of 32 player seats taken" |
| 69 | guest, 127.0.0.1 (new tab) | Join as "Quinn" | in the room; as a player sees 33 people, no seat line and no Remove |
| 70 | Sam | Participants list | "32 of 32 player seats taken", Quinn listed |
| 71 | script | One more guest | 409 `room_full` |
| 72 | all | server log, both consoles | no errors |

## Fixes made because of this testing (continued)

5. **"Show other players' dice looks" had no effect** (`apps/web/src/ui/tableLooks.ts`). Each
   component that read the setting had its own copy, so the Dice panel's change never reached the
   room's roll handler. It is now one value for the whole page.
6. **A GM reset would have been undone at once** (`apps/web/src/pages/RoomPage.tsx`). The sync of
   your own look re-ran whenever the table's copy changed, so the player's browser would re-apply a
   look the GM had just cleared. It now runs only when your own choice changes or you enter the
   room; caught by reading the code before step 39, then confirmed there.
