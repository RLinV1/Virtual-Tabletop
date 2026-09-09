# Virtual Tabletop (VTT) — Project Specification v4

**Course:** CSE 416  
**Team:** Antonio Cottone, Raymond Lin, Vincent Chen, Christos Psimadas  
**Timeline:** 13 weeks  
**Team size:** 4  
**License:** MIT  
**Document status:** Proposed scope, revised with hybrid tabletop enhancements  

---

## 0. How to Read This Document

This specification is deliberately ambitious. It defines a **Committed Core** that the team treats as a contract, followed by **four ranked tiers of stretch goals** that the team intends to attempt in order.

This structure is intentional. The team would rather attempt more than it completes than under-scope and deliver a thin product. Every stretch tier is written so that:

- It can be **cut at a defined decision point** without leaving a broken subsystem.
- It has an **explicit fallback** describing what ships if the item is abandoned.
- It is **not a prerequisite** for anything in the Committed Core.

A reviewer should evaluate the Committed Core for feasibility and the stretch tiers for sequencing and cut-safety, not assume all tiers will ship.

---

## 1. Product Summary

### Elevator pitch

A browser-based virtual tabletop that takes a game master from an arbitrary battle-map image to a playable, recoverable hybrid encounter in minutes. The GM uploads a map, receives automatic grid alignment, physical display calibration, and optional imported or AI-inferred wall and portal data. Players join instantly via QR code on their phones, utilizing a tactical controller with movement budgeting and direct-to-TV area-of-effect (AoE) template casting. When someone makes a mistake, the GM inspects the action log, undoes the action, or restores a named checkpoint, and every connected device converges on the corrected state.

### One-sentence differentiator

**The fastest integrated workflow from map image to a calibrated, interactive hybrid TV encounter, featuring mobile tactical casting and deterministic multi-device recovery.**

### The four workflow promises

1. **Prepare quickly.** Upload a map, detect its grid automatically, calibrate to physical screen dimensions, and optionally import or AI-generate walls and interactive doors.
2. **Join quickly.** Open a link or scan a QR code with no player account and no client installation.
3. **Play anywhere.** Run one encounter across a GM laptop, a shared TV display (supporting digital tokens or physical minis), local player phones, and remote browsers simultaneously.
4. **Recover safely.** Review the action log, undo mistakes with defined multi-user semantics, or restore a named checkpoint.

### Intended audience

Game masters who run tactical encounters from imported battle maps, display encounters on a television or projector (laid flat or mounted) for in-person play or mixed local and remote groups, want zero-friction phone interaction without complex character-sheet automation, and need dependable recovery from accidental reveals, token moves, or condition changes.

The initial release is system-agnostic. It is not intended for groups seeking automated character sheets, rules engines, or a commercial content marketplace.

---

## 2. Problem Statement

Existing VTTs optimize for complex desktop automation (Foundry, Roll20) or lightweight remote whiteboarding (Owlbear Rodeo). Neither natively targets the in-person TV setup: GMs struggle with manual screen scaling, mobile browser clutter, players having no way to ping or place spell templates without leaning over a laptop, and zero recovery when an accidental touch reveals hidden fog.

The opportunity is to reduce the number of tools, configuration steps, and interface transitions between receiving a plain map image and running a reliable hybrid encounter — and to do so with correctness guarantees under concurrency and failure that a course project can actually demonstrate and test.

### Product hypothesis

If map preparation, screen-scale calibration, phone-to-display spatial interaction (movement rulers, pings, AoE casting), and state recovery are engineered as a single authoritative state model, hybrid groups can run digital encounters with the physical immediacy of a live table and the speed of modern web tools.

### Validation questions

- Can a first-time GM upload a map, calibrate the physical TV scale, and prepare an encounter without documentation in under 5 minutes?
- Does automatic grid detection materially reduce calibration time across diverse map styles?
- Can a player join and control an assigned token from a phone in under 30 seconds, and retain control across a page reload?
- Do touch-directed pings and AoE templates from a phone render reliably on the TV display with under 150 ms latency?
- Can a GM recover from an accidental reveal or token move without reloading or manually reconstructing state?
- Do all connected clients converge on identical state after simultaneous edits, a forced disconnect, and a checkpoint restore?

---

## 3. Competitive Positioning

| Product | Relevant strengths | Gap or tradeoff relevant to this project |
| --- | --- | --- |
| Roll20 | Hosted, broad system support, marketplace, character sheets, dynamic lighting, undo/redo, rollback, UVTT import | Player accounts required; broad functionality creates onboarding and interface overhead; poor mobile support; no physical TV calibration or direct mobile AoE casting. |
| Foundry VTT | Powerful engine, extensive automation, large module ecosystem, strong lighting and wall tools | GM must choose and manage hosting; setup is complex; in-person TV play requires fragile third-party modules (*Monk's Common Display*); mobile interaction is unofficial and unstable. |
| Owlbear Rodeo | Fast browser onboarding, anonymous players, mobile support, shared-display casting, clean interaction | Combat automation and sheets depend on extensions; lacks native physical screen scaling, movement budget rulers, AI-assisted portal detection, and checkpointed recovery history. |
| Quest Portal | Modern UI, web and mobile clients, maps, character sheets, voice, in-person display support | Broad campaign/storytelling platform; automatic map preparation, recoverable tactical encounter history, and dedicated TV/phone tactical casting are not its focus. |
| External wall/UVTT tools (e.g. Auto-Wall, Dungeondraft) | Author or infer walls and lighting for import into established VTTs | Separate preprocessing round trip; requires manual inspection and external desktop execution. |

### Defensible positioning

The product should be described as:

> A focused, system-agnostic VTT engineered for low-prep hybrid TV encounters, combining assisted map setup, physical screen calibration, purpose-built mobile tactical controllers, and checkpoint recovery on a verifiably convergent shared state model.

It should **not** be described as: the first VTT with anonymous joining; the only VTT with undo; or a replacement for the rules automation or content marketplaces of Roll20 or Foundry.

---

## 4. Primary User Experience

### GM preparation flow

1. The GM creates a room.
2. The GM uploads a battle map (JPG, PNG, WebP) or a Universal VTT (UVTT) file.
3. For plain images, the application detects a square grid and displays the estimated cell size and offset with a confidence score.
4. The GM accepts the estimate or corrects it with a compact calibration tool.
5. If wall or portal data is present (imported via UVTT or generated via semantic vision inference), the application overlays editable wall and portal segments.
6. The GM accepts, deletes, adjusts, or adds segments, and marks door states (open/closed/locked).
7. The GM places tokens, assigns player ownership, and creates a named checkpoint ("Start of encounter").
8. The application generates a player link, QR code, and a dedicated Display URL.

### Live hybrid flow

- **GM Interface:** Full control over fog, unrevealed monsters, door lock states, initiative, and the domain recovery log on a laptop.
- **Shared TV Display:** Runs in chromeless, player-safe mode. Includes a 1-inch physical calibration step for table-mounted displays and an optional **Screen-Safe Mini Mode** toggle for groups playing with physical miniatures.
- **Player Phone Controller:** Lightweight tactical interface centered on the player's owned token, turn indicator, dice roller, **Movement Budget Ruler**, and **Target Ping / AoE Template Caster**.
- **Remote Player Client:** Standard responsive player board with synchronized viewport and chat/log tools.
- **Real-Time Sync:** All committed actions synchronize through an authoritative server with monotonic ordering.

### Recovery flow

1. The GM opens the encounter activity log.
2. The log describes committed actions in plain language with actor and timestamp.
3. The GM undoes a reversible action under defined semantics or restores a named checkpoint.
4. The server appends a compensating or restore event and broadcasts the resulting state to every connected device.

---

## 5. Committed Core

This is the contract. Everything in this section is expected to ship.

### 5.1 Room, identity, and permissions

- GM account or authenticated GM session.
- Shareable guest player link and QR code; no account required for players.
- GM, player, and display roles.
- **Durable guest identity:** Guest tokens persist in browser `localStorage` and rebind players to display names and owned tokens across reloads, backgrounded tabs, and transient disconnects.
- GM assignment of token ownership.
- Server-side authorization for GM-only and owner-only actions, enforced at the API layer.
- GM can revoke a guest or regenerate an invite link.

### 5.2 Board, assets, and tactical elements

- One active battle map per scene with pan and zoom.
- Token image upload, placement, rotation, size, name, basic numeric statistics (HP/resource bars), and conditions.
- Continuous coordinates with optional snap-to-grid.
- GM-only visibility toggle for tokens.
- Manual fog of war using rectangular or polygonal regions.
- **Interactive Portals (Doors & Windows):** Distinct wall segments designated as portals with toggleable states: `Open`, `Closed`, and `Locked`. Closed portals obstruct vision and movement; open portals permit line of sight.
- Drawing overlays: line, rectangle, circle, and pointer ping. Freehand drawing is excluded from the Committed Core.
- **Tactical AoE Templates:** Circular bursts, cones, lines, and box spell templates that snap to grid units.

### 5.3 Encounter tools

- Initiative and turn-order tracker with synchronized active-turn notifications.
- Shared dice expressions of the form `NdX + M`.
- Public and GM-only rolls.
- Condition markers distinguished by shape or text in addition to color.
- Human-readable activity log of committed domain actions.

### 5.4 Real-time collaboration and convergence

- Server-authoritative room state.
- Real-time synchronization of token, condition, initiative, portal, fog, and visibility changes.
- Ephemeral sub-channel for pointer coordinates, drag previews, ping pulses, and AoE aiming (never persisted to encounter history).
- Automatic reconnection after transient connection failure, with no manual refresh required.
- Full-state resynchronization for stale or newly joined clients.
- Conflict handling via server ordering and monotonically increasing per-room sequence numbers.
- **Demonstrable convergence:** an automated test forcibly disconnects a client mid-interaction, replays concurrent edits from other clients, reconnects, and asserts byte-identical resulting state across all clients.

### 5.5 Automatic grid alignment & physical TV calibration

- Automatic detection of square-grid cell size and offset from an uploaded image.
- Visual preview of the inferred grid with manual correction controls and confidence indication.
- **Physical 1-Inch Screen Calibration:** A calibration utility for the shared TV display. The GM adjusts a calibration slider against a physical credit card or reference ruler on the screen, scaling the viewport so that 1 grid cell measures exactly 1.0 physical inch (25.4 mm).

### 5.6 UVTT import

- Import Universal VTT (`.uvtt` / `.dd2vtt`) files: map image, grid dimensions/offset, wall segments, and portal (door) metadata.
- Imported walls and portals appear as editable segments identical to manually placed ones.
- Validation and clear error reporting for malformed files.

### 5.7 Encounter checkpoints and recovery

- Append-only log of committed domain actions with actor attribution.
- Periodic state snapshots and named GM checkpoints.
- Undo for a defined set of reversible actions under the semantics in §6.3.
- Restore to a named checkpoint.
- Recovery implemented by appending compensating events or a restore event, preserving the audit trail. History is never rewritten or truncated.

### 5.8 Purpose-built hybrid TV & mobile controller mode

- **Chromeless Shared Display:** Dedicated player-safe view designed to be projected or laid flat on a table TV.
- **Screen-Safe Mini Mode Toggle:** A display setting allowing groups to place physical miniatures directly on top of a horizontal TV screen. When enabled, digital tokens assigned to players are hidden on the TV display (replaced by subtle circular halo bases), while dynamic fog and monster tokens remain active.
- **Mobile Movement Budget Ruler:** Dragging an owned token on a phone renders an interactive path ruler measuring distance in 5-foot increments (with diagonal rule calculations). Color-coded budget thresholds (Green ≤ 30 ft, Yellow ≤ 60 ft, Red > Dash) guide tactical movement without enforcing strict rules engines.
- **Mobile Target Pings & AoE Projection:** Players can tap their phone screen to cast animated attention pings directly onto the TV display. Players can select an AoE shape, orient/scale it via touch on their phone, and project an ephemeral preview onto the shared TV for GM adjudication.

### 5.9 Accessibility baseline

- Keyboard access for all non-canvas controls.
- Visible focus indicators, semantic labels, and accessible dialogs.
- Focusable token roster as an alternative route to token selection.
- Keyboard movement for owned tokens.
- Live-region announcements for turn changes, token movement, and condition changes.
- Conditions distinguishable without color.
- Sufficient UI contrast targeting WCAG 2.2 AA standards.

---

## 6. Design Decisions Requiring Explicit Specification

### 6.1 Fog, portals, and line of sight precedence

Manual fog (§5.2) and wall/portal-derived line of sight (Tier 2) are two distinct visibility mechanisms:

- A region is visible to a player only if it is visible under **both** systems. Manual fog is authoritative and subtractive; wall/portal LOS can only further restrict, never reveal through manual fog.
- Portals evaluate dynamically: an `Open` portal allows line of sight to pass through; a `Closed` or `Locked` portal occludes line of sight identically to a solid wall.
- The GM display renders both layers with distinct visual treatments.

### 6.2 Guest session lifecycle

- On first join, the server issues an opaque guest identifier stored in `localStorage`.
- On reconnect or reload, the client presents the identifier and is rebound to its display name, role, and owned tokens.
- Identifiers expire when the GM revokes the guest, regenerates the invite, or closes the room.
- A guest identifier confers no authority beyond what the GM has granted to that player.

### 6.3 Undo semantics under concurrency

- The undo stack is **global per room and ordered by sequence number**, not per-user.
- **The GM may undo any reversible action.** A player may undo only their own most recent reversible action, and only if no later action has depended on it.
- Undo is implemented as a **compensating event appended to the log**, never as mutation of prior events.
- An action is **not undoable** if a later committed action depends on its effect (e.g., token moved, then deleted). The UI marks such entries as non-reversible with an explanation.
- Undoable action types are enumerated and closed: `TOKEN_MOVED`, `PORTAL_TOGGLED`, `TOKEN_VISIBILITY_CHANGED`, `TOKEN_CONDITION_ADDED`, `TOKEN_CONDITION_REMOVED`, `FOG_CHANGED`, `INITIATIVE_ADVANCED`. All other actions are recoverable only via checkpoint restore.
- **Checkpoint restore is the universal fallback.**

### 6.4 Technology stack

Single primary runtime for the application server, deployable on low-cost/free hosting with first-class WebSocket support (Node.js/TypeScript). All client interfaces (GM, TV Display, Mobile Controller) run as responsive web apps without native app dependencies. Heavy processing services (OpenCV/vision pipelines) are strictly isolated as asynchronous workers.

### 6.5 Mobile ephemeral interaction protocol

- Path dragging previews, ping pulses, and AoE touch-aiming broadcast over a low-overhead, ephemeral WebSocket sub-channel.
- Ephemeral messages bypass persistence and do not increment room sequence numbers, ensuring TV projection responsiveness (<150 ms latency) without bloating the audit log.

---

## 7. Stretch Goals

Ranked by expected value per unit of risk. The team attempts these in order with defined cut points and fallbacks.

### Tier 1 — High Value, Planned Integrations

**7.1 Semantic AI Map & Portal Parsing**
- An isolated microservice utilizing a vision pipeline (OpenCV / multimodal vision model) to parse uploaded battle-map images.
- Automatically identifies walls and semantically classifies **doors** and **windows**, generating editable UVTT wall and portal data with interactive open/closed toggles.
- *Cost:* Python/OpenCV runtime or vision API, containerization, and async job queue.
- *Cut point:* End of Week 8.
- *Fallback:* UVTT import (§5.6) allows GMs to import pre-authored maps from Dungeondraft/Auto-Wall.

**7.2 Spatial Accessibility Narration**
- A text summary of board state for screen-reader users: nearby tokens, relative direction, grid distance, and intervening obstacles ("Ogre, 15 feet northeast, behind closed wooden door").
- *Cut point:* Week 11.
- *Fallback:* §5.9 accessibility baseline ships regardless.

**7.3 Hex-Grid Detection**
- Extends §5.5 automatic grid alignment to hexagonal grids.
- *Cut point:* Week 10.
- *Fallback:* Square grids only; manual calibration for hex maps.

**7.4 Token Auto-Cropping and Background Removal**
- Client-side canvas processing on token image upload.
- *Cut point:* Week 11.
- *Fallback:* Manual image preparation prior to upload.

### Tier 2 — Attempt if Tier 1 Lands Early

**7.5 Dynamic Line of Sight**
- Renders player-specific 2D raycasted visibility from wall and portal segments.
- *Scope limits:* Simple 2D geometry blocking only. No elevation, no soft shadows, no colored light sources.
- *Cut point:* Week 11.
- *Fallback:* Manual fog only (§6.1).

**7.6 UVTT Export**
- Round-trips prepared maps, calibrated grids, and portal data back out to standard UVTT format for Foundry, Roll20, and Fantasy Grounds.
- *Cut point:* Week 12.
- *Fallback:* Purely additive; omitted if incomplete.

**7.7 Encounter Replay for Late Joiners**
- Replays the action log from a chosen checkpoint so a late-arriving player sees encounter progression.
- *Cut point:* Week 12.
- *Fallback:* Late joiners receive current state payload only.

**7.8 Reusable Encounter Templates**
- Save prepared map, walls, portals, and monster token roster for multi-session reuse.
- *Cut point:* Week 12.
- *Fallback:* Manual re-preparation.

### Tier 3 — Ambitious; Attempted Only if Tiers 1 and 2 are Complete

**7.9 Asynchronous Action Inbox**
- Play-by-post turn support: players submit tentative movement budgets and written actions on mobile; GM approves/rejects proposals.
- *Cut point:* Week 11.

**7.10 Voice Chat Integration**
- WebRTC voice within the room with GM-controlled mute.
- *Cut point:* Week 12.
- *Fallback:* Discord voice channels.

### Tier 4 — Aspirational Direction

- **7.11 Proximity Voice Chat:** Voice attenuation based on token distance.
- **7.12 Voice Preprocessing:** Noise suppression and normalization.
- **7.13 Discord Integration:** Bot posting rolls and join links to Discord.
- **7.14 Multi-Level Maps:** Vertical layering and stairs transitions.

---

## 8. Explicitly Out of Scope

Excluded at every tier to protect the 13-week delivery schedule:

- System-specific character sheets or rules automation (D&D 5e / Pathfinder math).
- Automated attack resolution, saving throws, damage formulas, or spell compendiums.
- Commercial asset marketplaces.
- Built-in video calling.
- True 3D elevation, camera pitching, or volumetric lighting.
- Semantic recognition of decorative furniture/props (semantic parsing is restricted strictly to walls, doors, and windows).
- Native iOS/Android app store builds (browser-based PWA standards only).

---

## 9. Technical Strategy

### State model & persistence

- The server is authoritative for all persistent encounter state.
- Each room maintains a monotonically increasing sequence number.
- Committed actions are validated, sequence-stamped, applied to server state, persisted to an append-only log, and broadcast.
- Ephemeral updates (pointer coordinates, token drag paths, distance rulers, AoE target previews) broadcast on a dedicated non-persisted WebSocket channel.

### Event taxonomy

- **Persisted Domain Actions:** `ROOM_CREATED`, `MAP_LOADED`, `GRID_ALIGNED`, `TOKEN_PLACED`, `TOKEN_MOVED`, `TOKEN_VISIBILITY_CHANGED`, `TOKEN_CONDITION_SET`, `PORTAL_TOGGLED`, `TEMPLATE_COMMITTED`, `FOG_UPDATED`, `INITIATIVE_STEPPED`, `CHECKPOINT_SAVED`, `CHECKPOINT_RESTORED`, `ACTION_COMPENSATED`.
- **Ephemeral Messages:** `POINTER_PING`, `DRAG_PREVIEW`, `RULER_MEASURE`, `AOE_TARGET_PREVIEW`.

### Recovery approach

Append-only event log combined with periodic full-state snapshots. Undoing an action computes a compensating event (`ACTION_COMPENSATED`) and appends it to the log, ensuring historical convergence without mutating past database records.

### Image & vision processing

- Automatic grid detection runs client-side via Web Workers or within an isolated worker process.
- AI map and portal parsing (§7.1) runs in a standalone containerized service behind an asynchronous task queue, completely decoupling image inference latency from real-time WebSocket gameplay.

---

## 10. Verification and Testing Strategy

- **Unit Testing:** Grid detection accuracy against a labeled benchmark of 20 battle maps; dice expression parsing; coordinate transform mathematics; UVTT schema parsing; and undo dependency graph evaluation.
- **Authorization Integration Tests:** Automated test suite verifying that unauthorized clients cannot invoke GM-only actions (fog reveal, door lock) or modify unowned tokens via direct WebSocket payloads.
- **Convergence Tests:** Automated headless browser suite connecting 1 GM, 1 TV display, and 4 mobile clients. A mobile client is forcibly disconnected mid-move while other clients execute concurrent actions; the disconnected client reconnects, and the test asserts byte-identical state across all clients.
- **TV Display Scale Verification:** Precision benchmark verifying that physical calibration on a 4K 50-inch display renders 1-inch grid units accurate to within ±1.5 mm of physical measurement.
- **Mobile Latency Benchmarks:** Pings and AoE template drag latency benchmarked on simulated 4G mobile connections to verify display projection latency under 150 ms.
- **Usability Testing:** Structured usability tests with at least 5 independent GMs and players in Week 11.

---

## 11. Nonfunctional Requirements

| Area | Target |
| --- | --- |
| Room Capacity | 1 GM, 1 Display client, and at least 8 concurrent mobile/remote players |
| Join Time | Median under 30 seconds from opening link/QR to board access |
| Reload Recovery | Mobile player retains identity and token ownership across reload in under 3 seconds |
| Mobile Projection Latency | Pings, rulers, and AoE previews from phone appear on TV display within 150 ms |
| State Convergence | Committed actions visible to all connected clients within 500 ms |
| Physical TV Accuracy | Physical calibration accurate to within ±2% of standard 1-inch tabletop mini base |
| Board Performance | 60 FPS canvas pan/zoom with representative map and 100 active tokens |
| Browser Compatibility | Desktop Chrome, Firefox, Edge; Mobile iOS Safari and Android Chrome |
| Accessibility | Non-canvas UI targets WCAG 2.2 AA standards |

---

## 12. Success Metrics

- **Core Usability:** At least 80% of first-time test players join a room and control their assigned token on mobile without verbal instruction.
- **Setup Velocity:** A first-time GM uploads a map, calibrates physical TV scale, sets up walls/doors, and starts an encounter in under 4 minutes.
- **Tactical Speed:** Players using the mobile movement budget ruler execute their movement turns in 30% less time compared to verbal/mouse coordination.
- **Audit Resilience:** Zero unrecoverable state desyncs during a live 30-minute test encounter involving forced disconnections and accidental fog reveals.
- **Recovery Speed:** A test GM reverses an accidental reveal, token move, or condition change in under 15 seconds.

---

## 13. Dependencies and Critical Path

| Capability | Depends on |
| --- | --- |
| Token control | Board coordinate system, token model, ownership authorization |
| Real-time state | Authoritative server, room schema, persistent sequence model |
| Durable guest identity | `localStorage` token binding, server session reconnection |
| Chromeless TV display | Real-time state sync, player-safe visibility filtering |
| Physical TV calibration | Display viewport transforms, display setup UI |
| Mobile movement budget | Token ownership, touch event pipeline, ephemeral broadcast |
| Mobile AoE projection | Ephemeral sub-channel, tactical template rendering, mobile touch UI |
| Interactive portals | Wall geometry model, portal state engine, fog occlusion rules |
| Action history & undo | Domain event taxonomy, sequence numbers, dependency evaluator |
| UVTT import | Wall and portal data model, coordinate transform |
| Semantic AI map parsing | UVTT data model, isolated vision microservice |
| Dynamic line of sight | Wall and portal models, token positions, raycast engine |

---

## 14. Thirteen-Week Milestone Plan

| Week | Deliverables | Exit Criteria / Milestone Gate |
| --- | --- | --- |
| 1 | Architecture spike, WebSocket event bus, grid detection prototype, AI vision spike | Tech stack selected; grid and vision feasibility established. |
| 2 | Deployed room server, durable mobile guest tokens, permission model | Mobile guest survives browser reload with identity intact. |
| 3 | Board canvas renderer, map image pan/zoom, coordinate transformation engine | Battle map renders consistently across varying viewport aspect ratios. |
| 4 | Token manipulation, grid snapping, **TV physical 1-inch calibration slider** | Authorized token moves work; physical 1-inch mini scaling verified. |
| 5 | Authoritative real-time sync, persistence, automated convergence test suite | Multiple clients converge after simultaneous edits and forced disconnect. |
| 6 | Initiative tracker, dice engine, UVTT import, **Interactive Portal (Door) state engine** | Baseline encounter playable end to end; **Gate 1: Core scope review**. |
| 7 | Chromeless TV view, QR join flow, **Mobile controller & Movement Budget Ruler** | Phone controls TV token with active distance budgeting. |
| 8 | Domain action log, snapshot manager, **Mobile pings and AoE projection to TV** | Server reconstructs state; **Gate 2: Commit or cut §7.1 AI parsing**. |
| 9 | Checkpoint restore, multi-user undo semantics, compensating event handler | Accidental reveals/moves cleanly recoverable across all devices. |
| 10 | Tier 1 stretch execution (AI map/door segmentation, hex detection) | Incomplete stretch items isolated behind feature flags. |
| 11 | Screen-Safe Mini Mode, Spatial accessibility narration, usability tests (5+ users) | Usability findings triaged; core functionality frozen. |
| 12 | End-to-end integration, performance hardening, TV display scale verification | Release candidate satisfies all nonfunctional requirements. |
| 13 | Buffer, final documentation, deployment freeze, demonstration rehearsal | Stable release tagged; final CSE 416 presentation delivered. |

---

## 15. Team Workstreams

1. **Board and Canvas Interaction:** Renderer, coordinate system, tokens, tactical overlays, AoE templates, TV display viewport, and physical calibration engine.
2. **Real-Time Architecture & Persistence:** Room state, authorization, WebSocket bus, ephemeral channel, durable identity, event logging, checkpoints, and undo semantics.
3. **Map Processing & AI Pipelines:** Square/hex grid detectors, UVTT import/export, vision segmentation worker, and portal geometry processing.
4. **Hybrid UX & Product Quality:** Mobile controller interface, movement budget ruler, target ping projection, accessibility, and automated convergence test harness.

---

## 16. Principal Risks and Mitigations

| Risk | Likelihood/Impact | Mitigation |
| --- | --- | --- |
| Multi-user undo produces surprising state desyncs | High / High | Normative semantics in §6.3; closed set of reversible actions; append-only compensating events; checkpoint restore universal fallback. |
| Mobile ephemeral interactions flood network | Medium / High | Dedicated ephemeral sub-channel that bypasses persistence and database writes entirely. |
| AI portal detection produces noisy geometry | High / Medium | Suggested portals require GM review before affecting visibility; feature isolated to Tier 1 with UVTT import fallback. |
| Physical TV calibration varies across models | Medium / Medium | Interactive calibration slider paired with real-world physical object (credit card / ruler) calibration guide. |
| Mobile browser sleeping drops guest identity | High / High | Durable guest identity via `localStorage` with automated reconnection token exchange built in Week 2. |
| Scope creep compromises 13-week schedule | High / High | Hard delivery cutoff at Week 9 for Committed Core; Weeks 10–12 reserved strictly for stretch and stabilization. |

---

## 17. Final Demonstration Scenario

The project will be demonstrated live using a physical television display laid flat on the table, a GM laptop, and two mobile smartphones:

1. **Map Ingestion & TV Calibration:** The GM uploads an unprepared battle map. The application detects and overlays the square grid. The GM connects the TV display and aligns the physical calibration ruler to 1 inch.
2. **Interactive Portal Setup:** The GM loads a UVTT map (or runs AI map parsing). Two doors appear. The GM clicks one door to verify it opens and shuts sightlines.
3. **Player Join:** Two players scan the on-screen QR code using their phones. They are immediately assigned their hero tokens without creating accounts.
4. **Mobile Movement Budget:** A player drags their character on their phone. The TV displays the token moving while a green distance ruler tracks their 30-foot speed budget.
5. **Mobile AoE & Target Pings:** The second player uses their phone to project an animated target ping onto an enemy on the TV, then drags a 15-foot cone spell template onto the screen.
6. **Durability Test:** A player backgrounds their mobile browser, reopens it, and immediately resumes control without losing their assigned token.
7. **Forced Disconnect Test:** A mobile client is disconnected during active combat while other clients continue moving tokens, then reconnects and instantly converges.
8. **Accidental Reveal & Instant Recovery:** The GM accidentally clears fog from a hidden boss room, spoiling the encounter. The GM clicks "Undo" in the action log. The TV display and phone controllers instantly converge back on the hidden state.

---

## 18. Reference Notes

- [Owlbear Rodeo Documentation & Casting](https://docs.owlbear.rodeo/docs/casting/)
- [Roll20 UVTT Specification & Page Management](https://blog.roll20.net/posts/page-menu-updates/)
- [Foundry VTT Controls and Architecture](https://foundryvtt.com/article/controls/)
- [Universal VTT (.dd2vtt) Format Specification](https://github.com/UniversalVTT/specification)
- [Auto-Wall (MIT License, Python/OpenCV desktop detection)](https://github.com/ThreeHats/auto-wall)
- [Monk's Common Display (Foundry TV Tabletop Module)](https://github.com/ironmonk88/monks-common-display)

---

## 19. Questions for Reviewer

- Is the physical 1-inch screen calibration workflow clear and intuitive for a hybrid demo, or should we include a software-detected TV resolution lookup?
- Are the closed-set undo actions in §6.3 sufficient for encounter mistakes, or should portal toggles and AoE template placements be handled under different rollback rules?
- Does the isolation of the AI map and portal parser (§7.1) into an asynchronous task worker sufficiently de-risk the real-time node server?