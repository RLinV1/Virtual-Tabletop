# Tasks

## 1. Settle the contradiction in the docs

- [ ] 1.1 Add a "Relationship to DESIGN.md §13.1" section to `docs/adr/0004-asset-library.md` recording that the GM device identity is a time-boxed bridge, that no claim or ownership transfer will be built while it exists, and what happens to device-owned rows at cutover (the proposal's open question). Move the ADR out of **Proposed** once the Real-Time Architecture owner (Raymond) has reviewed it, per CLAUDE.md. Verify the ADR links §13.1 and ADR 0002.
- [ ] 1.2 Correct `docs/DESIGN.md` §11.2: `/library` is marked "Deferred, do not build" but shipped in PR #13. Mark it built and note that it is GM-only and browser-bound. Verify the page inventory matches `apps/web/src/router.ts`.
- [ ] 1.3 Record the cutover requirements in §13.1 or §5.2: `rooms.owner_user_id` non-null, `gm_identities` dropped, `resolveGm` body replaced with the session lookup, no route changes. Verify KAN-7 references this change.

## 2. Stop minting identity on a read (apps/web)

- [ ] 2.1 In `apps/web/src/pages/LibraryPage.tsx`, replace the `getGmToken()` mount effect with `loadGmToken()`. When there is no token, skip the asset fetch and render the empty state. Verify by clearing `localStorage`, opening `/library`, and confirming no `vtt.gm` key is written and no `gm_identities` row is created.
- [ ] 2.2 Ensure the upload path still calls `getGmToken()` so the first upload creates the identity. Verify an upload from a browser with no token succeeds and the asset is listed afterwards.
- [ ] 2.3 Confirm no other read path mints an identity. Verify with `grep -rn "getGmToken" apps/web/src` that every caller is a write or an upload.
- [ ] 2.4 Add the browser-bound disclosure to `/library` itself, matching the wording already on the home page. Verify it is present when the library is empty and when it has assets.

## 3. Retention (apps/server)

- [ ] 3.1 Add `LibraryStore.deleteStaleGmIdentities(olderThan: Date)` deleting identities with no rooms and no assets, with a memory-store counterpart. Verify with a store unit test covering: idle and empty is deleted, idle but owns a room is kept, recent and empty is kept.
- [ ] 3.2 Call it on a schedule (startup plus a daily interval is sufficient; no new dependency). Verify the server logs one line per sweep with the number removed.
- [ ] 3.3 Confirm a deleted identity's token is then treated as unknown. Verify with an integration test asserting 401 from `/api/library` after the sweep.

## 4. Verify the whole thing

- [ ] 4.1 `npm run lint && npm run typecheck && npm test` all clean.
- [ ] 4.2 Walk the flow by hand: fresh browser to `/`, open the library (no identity created), upload a map (identity created), reload `/` and confirm the home page is unchanged and "Your rooms" stays hidden until a room exists.
