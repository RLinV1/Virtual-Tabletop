# Verification log: rulings-play-tab-only

Run 2026-10-07. The browser steps ran in the working tree of `feat/chat-mentions`; this change touches only `DicePanel.tsx`, `styles.css`, the new test and this folder. The change was then moved onto `fix/dice-tab-no-rulings` (from `main` at c6af906), where the automated checks below were re-run.

## Environment

- The user's own dev servers on :3001 and :5173 were left alone.
- Isolated servers: `server-isolated` (Express + Socket.IO on :3101, in-memory store, `DATABASE_URL` and `REDIS_URL` empty) and `web-isolated` (Vite on :5273, proxying to :3101). Both were temporary entries in `.claude/launch.json`, restored with `git checkout` afterwards.
- Browser: the built-in browser pane, as the GM. The player was a socket.io-client script in the session scratchpad (`player.mjs`).
- Test accounts: a throwaway GM account "Mara" on the in-memory :3101 server. It disappeared when that server stopped, and the credentials stayed in the session scratchpad. Player "Aria" was a guest seat. No database was touched.

## Automated checks

| Step | Result |
| --- | --- |
| `openspec validate rulings-play-tab-only --strict` | valid |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm test` | pass: shared 399, server 278 (23 skipped), web 448 (including the 2 new in `dicePanelRulings.test.tsx`), bench 2 |
| `npm run build` | pass |
| `dicePanelRulings.test.tsx` on the old `DicePanel.tsx` | fails 2 of 2, as it should |

## Browser steps

Setup: room "Rulings test". Tokens Aria (owned by player Aria) and Goblin (15/15 HP, AC 13).

| # | Step | Result |
| --- | --- | --- |
| 1 | Aria (script) rolls 1d20+5 "Longsword" to hit Goblin. GM is on the Dice tab. | Latest roll reads "Aria → Goblin · Longsword · 1d20+5 = 16". There are no Hit or Miss buttons in the panel and no `.roll-verdict` or `[aria-label=Ruling]` element. The Play tab shows a "1" badge. |
| 2 | GM opens Play | Rulings (1): "Aria → Goblin · Longsword", 16, AC 13, full-size Hit and Miss buttons. |
| 3 | GM clicks Hit in the Rulings list | Committed (seq 7). The list reads "Nothing to rule on." The player received `RollRuled`. |
| 4 | GM opens Dice, then Roll history | Latest roll reads "… = 16 · Hit". Roll history has 1 row, "… = 16 · Hit", with no Hit or Miss buttons. |
| 5 | GM rolls a custom 1d20 to hit (Aria → Goblin) from the Attack section | 12. Hit and Miss show in both the Rulings list and the GM's Attack card. |
| 6 | GM clicks Miss on the Attack card | Committed (seq 9). The card reads "12 to hit · Miss". The Rulings list is empty. The player received `RollRuled`. |
| 7 | GM opens Dice | Latest roll reads "Mara rolled Aria → Goblin · 1d20 = 12 · Miss". The panel has no Hit or Miss buttons. |
| 8 | Console | One 403 error, from my own debugging `fetch` of `/api/rooms/:id/invite` without the GM header during setup, not from the app. |

## Cleanup

- [x] Stopped `server-isolated` and `web-isolated`; :3101 and :5273 are free.
- [x] Stopped the player script.
- [x] Restored `.claude/launch.json`.
- [x] Reset the browser pane's viewport emulation.

## Follow-up: fixing a misclicked ruling with Undo

Run 2026-10-07 after the user asked for undo to reverse a ruling. No code changed: `RollRuled` is already in the reversible set (ADR 0013). This run only confirms it with the Dice-tab controls gone. Same isolated setup (fresh in-memory server, throwaway GM "Mara", room "Undo ruling test", tokens Aria and Goblin with AC 13), with no player script.

| # | Step | Result |
| --- | --- | --- |
| 1 | GM rolls a custom 1d20 to hit (Aria → Goblin) | 10. Pending in Rulings with AC 13, Hit and Miss. |
| 2 | GM clicks Hit (the "misclick") | Committed (seq 6). Rulings reads "Nothing to rule on." |
| 3 | GM opens the Activity log | The Hit entry has a button "Undo ruling on Aria → Goblin". |
| 4 | GM clicks it | Committed (seq 8). The log reads "Mara undid the ruling on Aria → Goblin", then "cleared the ruling …", and the Hit entry is marked "Undone". |
| 5 | GM goes back to Play | The roll is back in Rulings with Hit and Miss. The Play tab reads "1 ruling pending". |
| 6 | GM clicks Miss | Committed (seq 9). The Dice tab reads "Mara rolled Aria → Goblin · 1d20 = 10 · Miss". |

Cleanup: both servers stopped, ports free, `.claude/launch.json` restored, viewport emulation reset.
