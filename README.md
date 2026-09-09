# PRD: Virtual Tabletop - A Free, Feature-Complete Virtual Tabletop

## 1. Overview

A web-based virtual tabletop (VTT) that lets tabletop RPG groups (Dungeons & Dragons and similar systems) play together remotely: a shared map, real-time token movement, fog of war, dice rolls, and turn tracking, without a subscription and without gating core features behind a paid tier.

## 2. Problem Statement

Tabletop RPG groups who play remotely today are stuck with a bad tradeoff:
- Free tools are missing core features (no fog of war, no persistent character sheets, clunky token management).
- Full-featured tools (e.g. Roll20 Pro, Foundry VTT) require a subscription or a one-time cost plus self-hosting knowledge, which is a real barrier for a casual weekly group of students or friends.
- Even the platforms that do have the advanced features gate them behind a paywall. Roll20, for example, has dynamic lighting and vision, but it's locked behind their Pro subscription tier. A group that just wants proper fog of war and line-of-sight either pays monthly for a feature that should be table stakes, or does without it.
- Groups often patch the gap with a mess of separate tools: a Discord call, a shared Google Sheet for stats, a phone app for dice, a static image for the map, which breaks immersion and loses state between sessions.

## 3. Users

**Primary users:**
- **Dungeon Master (GM):** sets up the session, uploads the map, places enemies, controls fog of war, runs the game.
- **Player:** joins a session, controls their own token and character sheet, rolls dice, sees the board update live.

A typical group is one GM plus 2-6 players playing on a weekly or biweekly cadence.

## 4. Goals

- A GM should be able to set up a session (map, enemies, fog of war) once, and players should be able to join, see the board update live, move their own tokens, track their own stats, and roll dice, all in one place, for free.
- No feature in v1 is paywalled or tiered. If it ships, everyone gets it.

## 5. Why This Requires a Semester 

This is not a CRUD app with a chat window bolted on. The hard parts are systemic:

- **Real-time shared state across clients.** When a player moves a token, every other connected client (including the GM's) must see it update immediately, and the server must resolve what happens if two people act at once (e.g. two players trying to move through the same square, or the GM updating fog of war while a player moves).
- **Authoritative state and reconnection.** If a player's laptop dies mid-session, they need to reconnect and see the *current* board state, not a stale one, meaning the server (not the client) has to be the source of truth, and clients need to reconcile on reconnect.
- **Role-based permissions in real time.** GMs and players see different things (the GM sees the whole map; players see only what's revealed by fog of war) and can perform different actions. This isn't just a login gate, it's per-object, per-session authorization enforced live.
- **Fog of war computation.** Determining what's "visible" from a token's position given walls/obstacles is a real (if bounded) computational geometry problem, not a static image toggle.
- **Persistent session data.** Maps, tokens, character stats, and session history need to survive across days/weeks of play, not just a single browser tab.
- **Scaling to multiple concurrent sessions.** Many GM/player groups running independent sessions simultaneously, each with its own isolated real-time channel.

Any one of these is a solid systems problem; together they require an actual architecture, not a single AI-generated pass.

## 6. Requirements (In v1)

- User accounts (GM and player roles)
- Create / join a session (via invite code or link)
- GM: upload a map image, place and move enemy/NPC tokens
- Players: move their own token in real time, visible to everyone in the session
- Basic fog of war (GM-controlled reveal/hide regions)
- Turn order tracker (initiative list, shared and synced)
- Dice roller (standard polyhedral dice, results visible to the whole session)
- Basic character stat sheet (HP, stats, inventory as plain fields)
- Session persistence (state survives disconnect/reconnect and server restarts)
- In-session text chat

## 7. Non-Goals (Explicitly Out of v1)

- Voice/video chat (use Discord alongside it, not our problem to solve)
- Mobile native app (web-responsive only)
- Marketplace for maps/assets or paid content
- Custom rule-engine / automated combat resolution
- Scripting/macros for character sheets
- 3D rendering or dynamic lighting beyond basic fog of war
- Plugin ecosystem / third-party extensions

## 8. User Stories

- As a **GM**, I want to upload a map and place enemy tokens, so that I can set up an encounter before my players join.
- As a **GM**, I want to control what's hidden behind fog of war, so that I can reveal the map at the pace I want without giving away the whole dungeon.
- As a **player**, I want to move my token and have it appear instantly for everyone else, so that combat feels responsive instead of laggy or turn-based-only.
- As a **player**, I want to roll dice and have the result visible to the whole group, so that no one has to trust a private roll.
- As a **GM**, I want the turn order to update automatically as I add/remove combatants, so that I don't have to track initiative on paper.
- As **any user**, I want to close my laptop mid-session and rejoin later without losing the board state, so that a bad connection doesn't ruin the session.
- As a **player**, I want a simple character sheet I can update during play, so that I don't need a separate app for my stats.

![Example of token statistics, conditions, and shape overlays on a battle map](./assets/core-features-example.png)

*Reference mockup showing token conditions (Downed, Invisible), grouped enemy tokens, and area overlays, the kind of in-session view v1 is aiming for.*

![Example of dynamic lighting and fog of war](./assets/dynamic-lighting-example.png)
*Reference mockup of dynamic lighting/fog of war, a feature that platforms like Roll20 lock behind a paid tier.*

## 9. Technical Architecture

```
                         ┌─────────────────────┐
                         │   Web Client (React) │
                         │  - board canvas       │
                         │  - token drag/drop    │
                         │  - dice / turn UI      │
                         └──────────┬────────────┘
                                    │ WebSocket (state sync)
                                    │ REST (auth, session CRUD, asset upload)
                         ┌──────────▼────────────┐
                         │   App Server (Node)    │
                         │  - session manager     │
                         │  - permission checks   │
                         │  - fog-of-war calc     │
                         └───┬───────────────┬────┘
                             │               │
                  ┌──────────▼───┐   ┌───────▼────────┐
                  │  Postgres     │   │  Redis          │
                  │  (persistent: │   │  (ephemeral:    │
                  │  users, maps, │   │  live session   │
                  │  characters)  │   │  state, pub/sub │
                  │               │   │  across server  │
                  │               │   │  instances)     │
                  └───────────────┘   └─────────────────┘
                             │
                  ┌──────────▼───────┐
                  │  Object storage   │
                  │  (S3 / MinIO)     │
                  │  (map images)     │
                  └───────────────────┘
```

**Key design decision to flag:** the server is authoritative for game state (token positions, fog, turn order). Clients send *intents* ("move token X to (a,b)"), the server validates and broadcasts the resulting state. This is what makes reconnection, permission enforcement, and conflict resolution tractable.

Map images and other static assets go in an S3-compatible object store. MinIO works well here since it's self-hostable (no cloud account needed for local dev or demo day) and speaks the same API as S3, so the code isn't locked to one provider.