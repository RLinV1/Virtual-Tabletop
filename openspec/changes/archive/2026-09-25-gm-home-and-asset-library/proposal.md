# Proposal

## Why

A GM's only entry point today is a single "Create room" form (`apps/web/src/pages/HomePage.tsx`), and every map or token image is uploaded from inside a live room against that room's credential. Nothing records that an uploaded file exists, so a GM cannot prepare art before a session, reuse it across rooms, or find their rooms again. The README's "prepare quickly" goal and the <4-minute setup target (README §success criteria) need prepared assets to already be waiting when the room opens.

## What Changes

- **Home page** becomes two states: a landing page for a browser with no GM identity (what the app is, "Have an invite link?", entry points to sign in / create an account), and a **GM dashboard** once a GM device identity exists, listing "My rooms" with open/create actions and a link to the library.
- **Account UI (not wired):** sign-in, create-account and an account menu are built as screens and components, but submit to nothing yet. They show that accounts are coming soon. Real accounts (FR-GM-01) are a later change.
- **GM device identity (interim owner):** a browser-generated GM token in `localStorage`. The server stores only its SHA-256, as it does for guest tokens. It owns rooms and library assets until accounts exist. Every server lookup goes through one `resolveGm(req)` function that FR-GM-01 will replace with a session cookie.
- **Asset library page (`/library`)** with Maps and Tokens tabs: upload, browse, search by name, rename, delete. Map entries store a `GridSpec`, and token entries are plain images.
- **Place from library:** in a room, the GM panel's "Set map" and "Add token" offer "Upload new" or "From library". Placing a map **copies** its saved grid into the room. The GM panel also gets an explicit "Save grid to library" action.
- **Deletion warning:** before deleting an asset, the GM sees which of their rooms currently use it and confirms.
- **Missing-asset fallback:** if a referenced image no longer exists, the board shows a generic version. A token becomes its colour disc, and a map becomes a neutral grid at the map's stored size, so token positions are unchanged.
- **Contract changes (`packages/shared`):** `MapImage` and `Token` gain a nullable `assetId`. `scene.setMap` / `MapSet` gain an optional grid, with the grid it replaced, so a library map is one undoable step. The new library REST request/response schemas also go here. Existing event logs stay valid because every new field is optional or nullable.

## Capabilities

### New Capabilities
- `gm-home`: Home page states (landing vs GM dashboard), GM device identity, the "My rooms" listing, and the unwired account UI.
- `asset-library`: GM-owned map and token assets. Covers upload/browse/search/rename/delete, the saved map grid, in-use tracking and the delete warning, placement into rooms, "Save grid to library", and the rule that library metadata never reaches players.
- `board-asset-fallback`: How the board renders a map or token whose image is missing.

### Modified Capabilities
<!-- None: openspec/specs/ is empty; existing behaviour is specified only in README.md. -->

## Impact

- **packages/shared:** `state.ts` (`MapImage.assetId`, `Token.assetId`), `commands.ts` (`scene.setMap.grid?`, `token.create.assetId?`), `events.ts` (`MapSet.gridChange?`), `decide.ts`, `reducer.ts`, `protocol.ts` (library + dashboard schemas). Needs **ADR 0004** and review by the Real-Time Architecture owner (Raymond), per CLAUDE.md.
- **apps/server:** new `http/library.ts` routes, a `resolveGm` seam, `AssetStore.delete`, an asset-reference projection kept up to date after each commit in `liveRoom.ts`, and Prisma models `GmIdentity`, `LibraryAsset` and `AssetRef` plus `Room.ownerGmId`/`Room.name`, each with a memory-store counterpart.
- **apps/web:** `router.ts` (`/library`, `/signin`, `/signup`), `HomePage.tsx` rewrite, new `LibraryPage`, account screens, `net/identity.ts` (GM token), `net/api.ts`, `GmPanel.tsx` pickers, and `board/boardView.ts` (token image rendering + fallbacks).
- **Not in scope:** real account auth (FR-GM-01: users, sessions, argon2), claiming device assets into an account, reusable scene templates (FR-GM-13), and grid auto-detection at upload (FR-GM-03).
