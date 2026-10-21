# Graph Report - graphify-ecc962  (2026-10-21)

## Corpus Check
- Large corpus: 1273 files · ~1,159,837 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 4900 nodes · 13792 edges · 197 communities (169 shown, 28 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 324 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Credentials & Encounter Templates
- Grid Detection State
- Server Test Suite
- Dev Account & Auth Middleware
- Animation Library Store
- Uploads & UVTT Export
- Express App Lifecycle
- Room Client & Area Templates
- Pixi BoardView
- decide() Command Handlers
- Room Replay & Checkpoints
- Creature Library & Memory Store
- Dice Board & Room Features
- Wall Line Joining (vision)
- Wall Tests & Ink Dungeon
- Library Animation API Tests
- Dice Panel
- Effects Overlay & Presets
- Token Effects Rendering
- Attack Panel
- Event Model ADRs
- LiveRoom Pipeline
- Account Pages
- Room Registry
- Encounter Edit Flow
- GM Panel & Map Editor
- Grid Lines
- Aim Previews
- Activity Log
- Web Dependencies
- Identity & Account Hooks
- Creature Drafts
- Outline Extraction (cv2)
- Account & Activity Tests
- Animation Math
- Dice Geometry
- LibraryStore Interface
- Room Uploads & Game Presets
- Home Page & Links
- LiveRoom Methods
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 95
- Community 96
- Community 97
- Community 98
- Community 99
- Community 100
- Community 101
- Community 102
- Community 103
- Community 104
- Community 105
- Community 106
- Community 107
- Community 108
- Community 109
- Community 110
- Community 111
- Community 112
- Community 113
- Community 114
- Community 115
- Community 116
- Community 117
- Community 118
- Community 119
- Community 120
- Community 121
- Community 122
- Community 123
- Community 124
- Community 125
- Community 126
- Community 127
- Community 128
- Community 129
- Community 130
- Community 131
- Community 132
- Community 133
- Community 134
- Community 135
- Community 136
- Community 137
- Community 138
- Community 139
- Community 140
- Community 141
- Community 142
- Community 143
- Community 144
- Community 145
- Community 146
- Community 147
- Community 148
- Community 149
- Community 150
- Community 151
- Community 152
- Community 153
- Community 154
- Community 155
- Community 156
- Community 157
- Community 158
- Community 159
- Community 160
- Community 161
- Community 162
- Community 163
- Community 164
- Community 165
- Community 166
- Community 167
- Community 168
- Community 169
- Community 170
- Community 171
- Community 172
- Community 173
- Community 174
- Community 175
- Community 193
- Community 194
- Community 195
- Community 196

## God Nodes (most connected - your core abstractions)
1. `MemoryRoomStore` - 130 edges
2. `BoardView` - 124 edges
3. `RoomState` - 113 edges
4. `PostgresRoomStore` - 100 edges
5. `react` - 92 edges
6. `decide()` - 92 edges
7. `Point` - 86 edges
8. `GridSpec` - 76 edges
9. `emptyRoomState()` - 70 edges
10. `RoomConnection` - 68 edges

## Surprising Connections (you probably didn't know these)
- `Architecture Invariants (8 rules)` --semantically_similar_to--> `The one rule: Command -> decide -> events -> append -> reduce -> filter -> broadcast`  [INFERRED] [semantically similar]
  CLAUDE.md → docs/DESIGN.md
- `Game presets: how to add one` --semantically_similar_to--> `Standard Feature-Adding Pattern`  [INFERRED] [semantically similar]
  docs/GAME_PRESETS.md → CLAUDE.md
- `13.6 Component and state ownership (React vs Pixi, Zustand)` --semantically_similar_to--> `Coding Conventions (noun.verb, PastTense, zod, FR IDs)`  [INFERRED] [semantically similar]
  docs/FRONTEND-CONTRACT.md → CLAUDE.md
- `To-hit roll vs damage roll (why attacks did no damage)` --conceptually_related_to--> `Explicitly Out of Scope`  [AMBIGUOUS]
  docs/ATTACK-PERFORMANCE-REVIEW.md → README.md
- `Web app index.html (Vite entry)` --semantically_similar_to--> `Slate and rust design system (palette, typography, motion)`  [INFERRED] [semantically similar]
  apps/web/index.html → docs/INTERFACE.md

## Import Cycles
- 2-file cycle: `apps/web/src/board/fx.ts -> apps/web/src/board/nukeFx.ts -> apps/web/src/board/fx.ts`

## Hyperedges (group relationships)
- **Event-sourced sync core (invariants, pipeline, ADR 0001)** — claude_invariants, docs_design_command_pipeline, docs_adr_0001_event_model, docs_adr_0001_event_model_sync_protocol [INFERRED 0.85]
- **Docker Compose service stack** — docker_compose_postgres, docker_compose_redis, docker_compose_s3, docker_compose_vision, docker_compose_vision_walls, docker_compose_server, docker_compose_web [EXTRACTED 1.00]
- **Frontend and design specification docs** — docs_interface, docs_frontend_contract, docs_delivery, docs_design [EXTRACTED 1.00]
- **Whole-table swap events (restore, apply)** — docs_adr_0019_checkpoints_checkpoint_restored_resync, docs_adr_0024_encounter_templates_encounter_apply, docs_adr_0019_checkpoints_table_state [INFERRED 0.85]
- **ADR visibility redaction patterns** — docs_adr_0010_attack_roll_context_attack_side_hidden_flag, docs_adr_0016_manual_fog_concealed_from, docs_adr_0007_shared_area_templates_gm_only_template_visibility, docs_adr_0003_tactical_state_gm_only_rolls_filtered [INFERRED 0.85]
- **Atomic map placement ADR chain** — docs_adr_0041_uvtt_scenes_and_portals_adr_title, docs_adr_0042_map_token_adjustment_adr_title, docs_adr_0043_library_uvtt_import_and_atomic_placement_adr_title [INFERRED 0.85]
- **Wall detection and review ADRs** — docs_adr_0028_grid_detection_http_contract_adr_title, docs_adr_0029_walls_and_wall_detection_adr_title, docs_adr_0038_wall_confidence_adr_title, docs_adr_0031_map_editor_command_context_adr_title [INFERRED 0.85]
- **Token attack ADRs** — docs_adr_0034_shared_token_attacks_adr_title, docs_adr_0039_multi_target_attacks_adr_title, docs_adr_0038_attack_styles_nuke_and_animations_adr_title [INFERRED 0.75]
- **Specs guaranteeing hidden information never reaches players** — openspec_specs_attack_rolls_spec_no_hidden_reveal, openspec_specs_attack_rulings_spec_no_hidden_reveal, openspec_specs_board_attack_effects_spec_no_hidden_reveal, openspec_specs_fog_of_war_spec_content_not_sent, openspec_specs_checkpoints_spec_no_hidden_reveal, openspec_specs_ephemeral_channel_spec_hidden_previews, openspec_specs_area_templates_spec_gm_only_aiming [INFERRED 0.85]
- **Append-only recovery: undo, checkpoint restore, template apply** — openspec_specs_event_log_integrity_spec_recovery_appends, openspec_specs_checkpoints_spec_restore_appends, openspec_specs_encounter_templates_spec_apply_existing_room, openspec_specs_fog_of_war_spec_undoable, openspec_specs_leave_table_spec_resolve_departure [INFERRED 0.75]
- **Attack flow: roll, GM ruling, damage, board effects** — openspec_specs_attack_rolls_spec_attack_section, openspec_specs_attack_rulings_spec_gm_rules, openspec_specs_attack_rulings_spec_apply_damage, openspec_specs_board_attack_effects_spec_attack_animation, openspec_specs_board_attack_effects_spec_ruling_endings [INFERRED 0.95]
- **Room participant identity and access rules** — openspec_specs_room_participants_spec_unique_display_names, openspec_specs_room_participants_spec_revoked_not_assignable, openspec_specs_room_access_spec_revoke_player, openspec_specs_room_access_spec_invite_reset [INFERRED 0.85]
- **Map setup flow (draft, grid, walls, apply)** — openspec_specs_map_editor_spec_fullscreen_map_editor, openspec_specs_map_preparation_spec_draft_map, openspec_specs_map_preparation_spec_apply_map, openspec_specs_room_grid_calibration_spec_adjust_grid, openspec_specs_map_editor_spec_walls_step [INFERRED 0.85]
- **Token creation, naming, placement and duplication** — openspec_specs_token_names_spec_auto_numbering, openspec_specs_token_placement_spec_choose_square, openspec_specs_token_duplication_spec_gm_duplicates, openspec_specs_token_duplication_spec_creation_undo [INFERRED 0.85]

## Communities (197 total, 28 thin omitted)

### Community 0 - "Credentials & Encounter Templates"
Cohesion: 0.03
Nodes (97): hashToken(), newInviteCode(), boardFromRoom(), BoardFromRoomResult, resolveEncounter(), ADR-0024, ADR-0036, NewRoomWithSeat (+89 more)

### Community 1 - "Grid Detection State"
Cohesion: 0.03
Nodes (57): DETECTION_STALE_MS, DetectionState, DiceFaceRecord, DiceLookRecord, EncounterLimitError, EncounterMapMissingError, EncounterNameConflictError, EncounterRecord (+49 more)

### Community 2 - "Server Test Suite"
Cohesion: 0.07
Nodes (55): clients, styled, ADR-0009, Command, activePlayerCount(), decideJoin(), CommittedEvent, DEFAULT_GRID (+47 more)

### Community 3 - "Dev Account & Auth Middleware"
Cohesion: 0.04
Nodes (58): refusedReplay(), DEV_ACCOUNT, seedDevAccount(), attachAccount(), SAFE_METHODS, signedIn(), ADR-0017, hashPassword() (+50 more)

### Community 4 - "Animation Library Store"
Cohesion: 0.03
Nodes (13): AnimationLimitError, LibraryAnimationRecord, assertEncounterName(), insertEncounter(), missingImageAsError(), PostgresRoomStore, toAnimationRecord(), toAssetRecord() (+5 more)

### Community 5 - "Uploads & UVTT Export"
Cohesion: 0.06
Nodes (48): uploadKey(), BUILTIN_MAP_FILES, CapturedScene, exportUvttScene(), bitmapFormat(), hasPngAnimation(), PNG_SIGNATURE, Entry (+40 more)

### Community 6 - "Express App Lifecycle"
Cohesion: 0.06
Nodes (39): App, AppOptions, buildApp(), trustProxyFromEnv(), ADR-0017, ADR-0018, ADR-0029, ADR-0033 (+31 more)

### Community 7 - "Room Client & Area Templates"
Cohesion: 0.04
Nodes (39): RoomClient, clients, cone, setup(), withMap(), clients, setup(), clients (+31 more)

### Community 8 - "Pixi BoardView"
Cohesion: 0.07
Nodes (5): BoardView, BoardTransform, AttackEffect, Rgb, fogDraftPoints()

### Community 9 - "decide() Command Handlers"
Cohesion: 0.05
Nodes (70): accept(), advance(), blockingWalls(), checkOwners(), createTokens(), decide(), DecideContext, Decision (+62 more)

### Community 10 - "Room Replay & Checkpoints"
Cohesion: 0.05
Nodes (47): clients, Props, RoomSnapshot, turnNoticeToken(), gm, state, aria, gm (+39 more)

### Community 11 - "Creature Library & Memory Store"
Cohesion: 0.04
Nodes (6): CreaturePatch, LibraryCreatureRecord, NewCreatureRecord, MemoryRoomStore, RoomGoneStore, poisonedRoom()

### Community 12 - "Dice Board & Room Features"
Cohesion: 0.06
Nodes (54): DiceBoard, TokenDraft, ENCOUNTER_EDITING, FULL_ROOM, RoomFeatures, shownTab(), ADR-0033, Props (+46 more)

### Community 13 - "Wall Line Joining (vision)"
Cohesion: 0.06
Nodes (34): _connected_to_long_runs(), _join_gaps(), _segments_for(), _aligned(), _axis_snap(), _confidence(), _connected_to_long_runs(), _dedupe() (+26 more)

### Community 14 - "Wall Tests & Ink Dungeon"
Cohesion: 0.07
Nodes (17): diagonal(), encode(), floor(), ink_dungeon(), inked_outlines(), near_outline(), near_room_edge(), painted_hall() (+9 more)

### Community 15 - "Library Animation API Tests"
Cohesion: 0.06
Nodes (41): create(), gmFetch(), list(), slash, StrikeFxParams, activeShakes, shakeScreen(), ADR-0038 (+33 more)

### Community 16 - "Dice Panel"
Cohesion: 0.07
Nodes (43): throwBlocker(), attackHeadline(), pendingRulings(), breakdown(), DicePanel(), QUICK, rollCommand(), RollHistory() (+35 more)

### Community 17 - "Effects Overlay & Presets"
Cohesion: 0.08
Nodes (47): EffectsOverlay, BASE, BUILTIN_ANIMATIONS, BUILTIN_IDS, BUILTIN_NAMES, CONDITION_GLOW, CONDITION_VISUALS, conditionParticleOptions() (+39 more)

### Community 18 - "Token Effects Rendering"
Cohesion: 0.07
Nodes (41): ATTACK_STYLE_PRESETS, NUKE_PRESET, ArtStyle, artStyleFor(), attackEffectFor(), CONDITION_EFFECTS, ConditionEffectSpec, conditionLoopWanted() (+33 more)

### Community 19 - "Attack Panel"
Cohesion: 0.09
Nodes (44): AttackForm(), DiceField(), hitOn(), PresetEditor(), stableJson(), ADR-0034, ADR-0038, AttackDice (+36 more)

### Community 20 - "Event Model ADRs"
Cohesion: 0.04
Nodes (49): ADR-0041, referencedAssetIds(), ADR-0004, ADR-0006, ADR-0011, ADR-0013, ADR-0015, ADR-0016 (+41 more)

### Community 21 - "LiveRoom Pipeline"
Cohesion: 0.05
Nodes (49): ResolveEncounterResult, JoinResult, onMap(), secureRandom(), SubmitResult, ADR-0004, ADR-0006, ADR-0007 (+41 more)

### Community 22 - "Account Pages"
Cohesion: 0.07
Nodes (38): AccountForm(), ChangePasswordDialog(), submit(), describe(), LegacyNote(), nextFromUrl(), SignInPage(), submit() (+30 more)

### Community 23 - "Room Registry"
Cohesion: 0.06
Nodes (25): RoomHooks, RoomRegistry, ADR-0009, ADR-0017, Deps, registerUvttRoutes(), RateLimiter, AssetStore (+17 more)

### Community 24 - "Encounter Edit Flow"
Cohesion: 0.09
Nodes (35): api, DiceSignInLine(), encounterEditPath(), startEncounterEdit(), ADR-0033, EncounterPreviewBoard(), EncounterPreviewModal(), useEncounterPreview() (+27 more)

### Community 25 - "GM Panel & Map Editor"
Cohesion: 0.07
Nodes (41): imageSize(), nameFromFile(), EditorStep, FIXED_MAP_STEPS, MapSection(), onChange(), OPENERS, Pending (+33 more)

### Community 26 - "Grid Lines"
Cohesion: 0.11
Nodes (41): BoardRect, gridLines(), positions(), adjustGridSampleCorner(), drawGridSample(), GRID_CELL_SNAP, gridFromSample(), GridSample (+33 more)

### Community 27 - "Aim Previews"
Cohesion: 0.07
Nodes (32): AIM_TTL_MS, aimExpiry(), expiredAims(), ADR-0021, AimPreview, AttackFx, drawShape(), failedImageUrls (+24 more)

### Community 28 - "Activity Log"
Cohesion: 0.06
Nodes (41): log(), ActivityLogEntry, fogLabel(), formatActivity(), formatPoint(), HistoryQuery, QueryInteger, Sequence (+33 more)

### Community 29 - "Web Dependencies"
Cohesion: 0.05
Nodes (42): devDependencies, jsdom, sharp, @testing-library/react, @types/react, @types/react-dom, typescript, vite (+34 more)

### Community 30 - "Identity & Account Hooks"
Cohesion: 0.10
Nodes (35): useAccount(), token(), credKey(), EnumerableStorage, gmRoomForInvite(), guestRoomForInvite(), inviteKey(), JoinedRoom (+27 more)

### Community 31 - "Creature Drafts"
Cohesion: 0.09
Nodes (33): TokenView, creatureDraft, creatureFromToken(), CreaturePrefill, creatureSummary(), ADR-0012, CreatureCard(), remove() (+25 more)

### Community 32 - "Outline Extraction (cv2)"
Cohesion: 0.10
Nodes (21): _collapse_doubles(), create_color_mask(), create_multi_color_mask(), _dark_outline(), detect_mask(), detect_outlines(), _detect_outlines(), _fill() (+13 more)

### Community 33 - "Account & Activity Tests"
Cohesion: 0.05
Nodes (24): withClock(), clients, clients, PNG, clients, FOG_RECT, clients, createRoom() (+16 more)

### Community 34 - "Animation Math"
Cohesion: 0.13
Nodes (36): ResolvedAnimation, arcPoints(), blade(), clamp01(), easeIn(), easeOut(), lerp(), lerpPoint() (+28 more)

### Community 35 - "Dice Geometry"
Cohesion: 0.11
Nodes (40): add(), apply(), bodies, bodyFor(), BodyName, BOUNCES, buildFace(), cornerDie() (+32 more)

### Community 36 - "LibraryStore Interface"
Cohesion: 0.05
Nodes (3): LibraryStore, LegacySummary, LibraryMapBoard

### Community 37 - "Room Uploads & Game Presets"
Cohesion: 0.06
Nodes (35): RoomDetails, byId(), DEFAULT_PRESET_ID, FREE, GamePreset, GamePresetId, ADR-0027, GridDetectionStatus (+27 more)

### Community 38 - "Home Page & Links"
Cohesion: 0.09
Nodes (39): input(), Link(), listJoinedRooms(), AccountLinks(), CROP, cryptoRandom(), DiceChapter(), roll() (+31 more)

### Community 39 - "LiveRoom Methods"
Cohesion: 0.09
Nodes (5): LiveRoom, Auth, registerSocket(), SeatWindows, SessionEndReason

### Community 40 - "Community 40"
Cohesion: 0.09
Nodes (32): DRAFT_COMMANDS, draftConnection(), ADR-0037, applyToDraft(), chunks(), DRAFT_ID, draftCommandProblem(), draftDirty() (+24 more)

### Community 41 - "Community 41"
Cohesion: 0.08
Nodes (31): ARROWS, Board, FOG_HINTS, ghostOf(), HINTS, isTyping(), Placing, ADR-0029 (+23 more)

### Community 42 - "Community 42"
Cohesion: 0.13
Nodes (30): withDefaults(), FxHost, FxScene, makeScene(), NukeFxParams, playStrike(), REDUCED_FX_S, shakes (+22 more)

### Community 43 - "Community 43"
Cohesion: 0.09
Nodes (33): averageColor(), clamp(), DEFAULT_DARK, DEFAULT_LIGHT, edgeNoise(), FOG_FEATHER_CELLS, FOG_TEXTURE_SIZE, fogMaskAlpha() (+25 more)

### Community 44 - "Community 44"
Cohesion: 0.12
Nodes (26): GmPanel(), toGridDraft(), asset, board, imported, mountRoom(), click(), drag() (+18 more)

### Community 45 - "Community 45"
Cohesion: 0.09
Nodes (31): enqueueDetection(), ensureShippedMaps(), isShippedKey(), SHIPPED_KEY_PREFIX, ADR-0036, AnimationIdParam, notFound(), registerAnimationRoutes() (+23 more)

### Community 46 - "Community 46"
Cohesion: 0.12
Nodes (25): DirectMapGridEditor(), LibraryMapGridEditor(), RoomGridEditor(), GridActionsContext, gridsEqual(), parseGridDraft(), withGridSuggestion(), DEFAULT_PREVIEW_MAP (+17 more)

### Community 47 - "Community 47"
Cohesion: 0.10
Nodes (27): AREA_SHADES, areaColorValue(), AreaGeometry, areaShape(), closestOnSegment(), distanceToSegment(), fogRegionAt(), formatDistance() (+19 more)

### Community 48 - "Community 48"
Cohesion: 0.11
Nodes (28): useDisplayedStats(), useAttackListEditor(), CollapseToggle(), GroupHeading(), NewGroupButton(), Choice, ResolveDepartureModal(), ResolveForm() (+20 more)

### Community 49 - "Community 49"
Cohesion: 0.06
Nodes (34): ADR-0008, StrikeAnimationDef, AttackDice, MAX_ATTACK_TARGETS, MAX_TOKEN_ATTACKS, namedAttackFor(), namedAttackLabel(), TokenAttacks (+26 more)

### Community 50 - "Community 50"
Cohesion: 0.11
Nodes (5): BoardHandle, BoardCallbacks, portalAt(), Point, AreaTemplate

### Community 51 - "Community 51"
Cohesion: 0.08
Nodes (25): guardedConnection(), previewConnection(), replayConnection(), CommandResult, CommittedListener, ConnectionStatus, ENDED_MESSAGE, EphemeralListener (+17 more)

### Community 52 - "Community 52"
Cohesion: 0.09
Nodes (6): job(), run(), stored(), WallWorkerTest, main(), process()

### Community 53 - "Community 53"
Cohesion: 0.07
Nodes (34): ADR 0003 Tactical state: stats, conditions, initiative, rolls, GM-only rolls filtered not flagged, Initiative holds token ids ordered once in decide, Dice randomness injected via DecideContext.random, Roll log capped at 30 in state, Token stats and conditions on token, ADR 0007 Shared area templates, RoomState.templates AreaTemplate (circle, cone, box) (+26 more)

### Community 54 - "Community 54"
Cohesion: 0.08
Nodes (24): accountRequest(), ApiError, errorFrom(), legacyRequest(), onSignedOut(), postJson(), roomRequest(), ADR-0009 (+16 more)

### Community 55 - "Community 55"
Cohesion: 0.14
Nodes (29): coverage(), DiceLookCard(), DiceLookCards(), DiceLookEditor(), DiceLookModal(), DicePreview(), DieCard(), SaveBrowserLooksOffer() (+21 more)

### Community 56 - "Community 56"
Cohesion: 0.10
Nodes (27): LAST_USED_KEY, latestAttackRoll(), isStringRecord(), localStorageOrNull(), useEncounterReset(), SectionCollapseProvider(), listeners, pictures (+19 more)

### Community 57 - "Community 57"
Cohesion: 0.06
Nodes (31): description, devDependencies, concurrently, eslint, @eslint/js, globals, @playwright/test, typescript-eslint (+23 more)

### Community 58 - "Community 58"
Cohesion: 0.08
Nodes (20): apply, cell, clickPoint(), commands, dialog, draw(), errors, gridCommands() (+12 more)

### Community 59 - "Community 59"
Cohesion: 0.13
Nodes (21): useRoomSnapshot(), applyMention(), fold(), MAX_MENTION_SUGGESTIONS, mentionQuery, mentionSuggestions(), ChatPanel(), ChatRow() (+13 more)

### Community 60 - "Community 60"
Cohesion: 0.12
Nodes (10): RoomConnection, RoomPage(), AttackPanel(), clearLegacyAttackStorage(), saveTokenAttacks(), ADR-0034, gm, renderPanel() (+2 more)

### Community 61 - "Community 61"
Cohesion: 0.13
Nodes (24): TargetOption, Field, initiativeEntries(), initiativeFieldValue(), invalidInitiative(), invalidMessage(), isValidScore(), ADR-0022 (+16 more)

### Community 62 - "Community 62"
Cohesion: 0.11
Nodes (21): accountBackend, copyLooks(), CopyResult, db(), DiceLookBackend, fromView(), isLook(), localBackend (+13 more)

### Community 63 - "Community 63"
Cohesion: 0.08
Nodes (16): clients, connect(), ok(), setup(), viewFor(), clients, connect(), servers (+8 more)

### Community 64 - "Community 64"
Cohesion: 0.12
Nodes (6): areaOrigin(), areaSizeFromDrag(), BoardTool, FogDraft, Mark, templateMark()

### Community 65 - "Community 65"
Cohesion: 0.11
Nodes (24): AREA_SIZES, DRAW_COLORS, DrawShape, FogMode, AREA_SHAPES, colorName(), DEFAULT_TOOL_OPTIONS, DRAW_SHAPES (+16 more)

### Community 66 - "Community 66"
Cohesion: 0.11
Nodes (23): WallCanvas(), WallProperties(), HINTS, MODES, OptionRow(), PORTAL_KINDS, PORTAL_STATES, ADR-0030 (+15 more)

### Community 67 - "Community 67"
Cohesion: 0.11
Nodes (19): internalError(), notFound(), refuse(), registerMembershipRoutes(), RoomIdParam, ADR-0017, presetFromLog(), ALREADY_MEMBER (+11 more)

### Community 68 - "Community 68"
Cohesion: 0.15
Nodes (23): AccountMenu(), RequireAccount(), forgetGmToken(), legacyOffer(), ADR-0017, CreateRoomCard(), onSubmit(), Dashboard() (+15 more)

### Community 69 - "Community 69"
Cohesion: 0.12
Nodes (20): EditorConnection, FogControls(), ADR-0016, HINTS, MODES, WallDraft, Cell, cellOf() (+12 more)

### Community 70 - "Community 70"
Cohesion: 0.12
Nodes (10): _axis_profile(), detect(), detect_bytes(), _period_candidates(), _phase(), Fixture, render(), Handler (+2 more)

### Community 71 - "Community 71"
Cohesion: 0.10
Nodes (27): MAX_GROUPS, canUndo(), CompleteMapSet, GroupEvent, groupUndoConflict(), inverseOf(), inverseOfOne(), isGroupEvent() (+19 more)

### Community 72 - "Community 72"
Cohesion: 0.14
Nodes (23): drawStageGrid(), drawStageToken(), STAGE_CELL, STAGE_HEIGHT, STAGE_TOKEN_RADIUS, STAGE_WIDTH, standInPositions(), ADR-0038 (+15 more)

### Community 73 - "Community 73"
Cohesion: 0.10
Nodes (15): AddTokenButton(), TokenEditor(), open(), editor(), OFF, token, bite, editor() (+7 more)

### Community 74 - "Community 74"
Cohesion: 0.09
Nodes (24): apply(), assertNever(), concealFoggedSides(), concealInRolls(), required(), ADR-0006, ADR-0010, ADR-0011 (+16 more)

### Community 75 - "Community 75"
Cohesion: 0.10
Nodes (22): reduce(), UNDO_HISTORY_LIMIT, undoableAction(), act(), grid, map, oldMap, refusal() (+14 more)

### Community 76 - "Community 76"
Cohesion: 0.10
Nodes (12): WallJobData, api(), clients, MAP, PNG, PREVIEW, roomWithMap(), StandInQueue (+4 more)

### Community 77 - "Community 77"
Cohesion: 0.14
Nodes (23): BOARD_THROW_MAX_DICE, BoardDiePath, boardDieSize(), centreThrow(), clampToMap(), clientToBoard(), crowdedOffset(), DIE_CELLS (+15 more)

### Community 78 - "Community 78"
Cohesion: 0.18
Nodes (19): SHAPE_DEFAULTS, CLIENT_SETTINGS_KEY, ClientSettings, DEFAULT_CLIENT_SETTINGS, getClientSettings(), GraphicsQuality, isClientSettings(), listeners (+11 more)

### Community 79 - "Community 79"
Cohesion: 0.16
Nodes (18): createDraftConnection(), FogSetup(), clampWidth(), HudLayout(), Layout, load(), boardChanged(), boardFromDraft() (+10 more)

### Community 80 - "Community 80"
Cohesion: 0.14
Nodes (19): DepartedPlayers(), GroupMoveMenu(), departureNews(), DepartureNotices(), ADR-0006, GuideIcon(), AVATAR_COLORS, avatarColor() (+11 more)

### Community 81 - "Community 81"
Cohesion: 0.17
Nodes (21): body, standardLabels(), BODIES, DICE_PROMPT, faceArt, faceCentre(), faceForTile(), faceImageTransform() (+13 more)

### Community 82 - "Community 82"
Cohesion: 0.16
Nodes (5): DetectionOutcome, DetectionRecord, DetectionTarget, GridDetectionStore, GridDetectionCandidate

### Community 83 - "Community 83"
Cohesion: 0.15
Nodes (20): Pull Request Template, PR Checklist (typecheck, convergence test, undo-ready events, filtering, ADR, WCAG), CLAUDE.md (project instructions), Standard Feature-Adding Pattern, ADR 0001: Server-authoritative event log with per-viewer filtering, Ephemeral channel (no seq, never persisted, rate-limited), Guest identity via hashed opaque token, Gap-free seq ordering (PRIMARY KEY room_id, seq) (+12 more)

### Community 84 - "Community 84"
Cohesion: 0.19
Nodes (4): builtinImageName(), entryKey(), WallDetections, WallDetectionResult

### Community 85 - "Community 85"
Cohesion: 0.21
Nodes (19): forgetCredentials(), EncounterEditBar(), askRoomDetails(), leave(), openRoom(), save(), saveThenLeave(), startOpen() (+11 more)

### Community 86 - "Community 86"
Cohesion: 0.10
Nodes (22): ADR 0002 Socket.IO transport and guest identity, Browser-generated guest identity (SHA-256 stored), Express server framework, npm workspaces and Prisma toolchain, SeaweedFS S3 asset bucket (public-read), Socket.IO transport (auth handshake, volatile ephemeral), zod runtime validation kept, Zustand client state store (+14 more)

### Community 87 - "Community 87"
Cohesion: 0.17
Nodes (20): ADR 0037 Walls and fog prepared on a library map, GET/PUT /api/library/:id/board, One library editor draft, LibraryMapBoard (walls, fog), ADR 0041 UVTT scenes, portal metadata, atomic geometry, MapSet wallChange/fogChange, JSON text cast to preserve doubles, scene.importUVTT command (+12 more)

### Community 88 - "Community 88"
Cohesion: 0.13
Nodes (17): TokenCard(), ConditionMarker(), ConditionPicker(), ShapePath(), alice, bob, fighter, gm (+9 more)

### Community 89 - "Community 89"
Cohesion: 0.12
Nodes (20): ADR 0011 GM rulings on attack rolls, roll.applyDamage / RollDamageApplied, roll.rule / RollRuled verdict hit|miss, ADR 0013 Undo for reversible actions, commandId on CommittedEvent, history.undo emits inverses plus ActionUndone, REVERSIBLE_EVENT_TYPES, RollDamageUnapplied inverse event (+12 more)

### Community 90 - "Community 90"
Cohesion: 0.12
Nodes (20): ADR 0019 Named checkpoints, checkpoint.create / CheckpointCreated (name, seq), CheckpointRestored resyncs players, DecideContext.checkpointTable, Restore by folding log up to checkpoint seq, ADR 0024 Reusable encounter templates, encounter.apply / EncounterApplied, encounter_templates library row built server-side (+12 more)

### Community 91 - "Community 91"
Cohesion: 0.17
Nodes (19): ADR 0028 Private grid detection HTTP contract, GM-only grid analysis REST endpoints, ADR 0029 Walls and automatic wall detection, exclude indices on applyDetected, Walls and fog as editor draft, Outlined wall style pipeline, wall.add / wall.remove / wall.clear, wall.applyDetected command (+11 more)

### Community 92 - "Community 92"
Cohesion: 0.13
Nodes (13): clients, create(), gmFetch(), list(), PNG, clients, gmFetch(), PNG (+5 more)

### Community 93 - "Community 93"
Cohesion: 0.23
Nodes (17): boardDiePaths(), BoardThrow, ActiveThrow, ThrownDice(), ThrownRoll(), seed(), THROW_MS, throwKeyframes() (+9 more)

### Community 94 - "Community 94"
Cohesion: 0.14
Nodes (17): resnapToGrid(), isSnapped(), placementCandidates(), adjustMapTokens(), boundedAxis(), clamp(), Dimensions, MAP_TOKEN_POLICIES (+9 more)

### Community 95 - "Community 95"
Cohesion: 0.11
Nodes (18): sharp, socket.io-client, typescript, vitest, @vtt/shared, zod, name, private (+10 more)

### Community 96 - "Community 96"
Cohesion: 0.14
Nodes (6): WALL_IMAGE_KEY_PREFIX, WallJobEvent, clients, MAP, PNG, StandInQueue

### Community 97 - "Community 97"
Cohesion: 0.15
Nodes (13): clients, connect(), lookWithD20(), table(), clients, connect(), document(), ok() (+5 more)

### Community 98 - "Community 98"
Cohesion: 0.18
Nodes (16): CI Workflow (GitHub Actions), CI verify job (lint, typecheck, test, vision tests, build, /health smoke), Repo Layout (shared, server, web, vision), postgres service, redis service, s3 service (SeaweedFS), server service (app server), vision service (grid detection) (+8 more)

### Community 99 - "Community 99"
Cohesion: 0.16
Nodes (15): ChatSegment, compare(), findMentions(), MentionMatch, mentionSegments(), ADR-0035, chatMentions(), foldName() (+7 more)

### Community 100 - "Community 100"
Cohesion: 0.19
Nodes (12): BUILTIN_ASSETS, builtinsMatching(), isBuiltin(), libraryAssetId(), TOKEN_SIZE, ADR-0036, LibraryPicker(), ADR-0012 (+4 more)

### Community 101 - "Community 101"
Cohesion: 0.24
Nodes (4): AnimationPreview, RunningFx, AnimationPreviewStage(), ADR-0038

### Community 102 - "Community 102"
Cohesion: 0.13
Nodes (16): area-templates spec, Area color, GM-only aiming stays hidden, GM-only areas are hatched, Line templates, Live aim preview (shared aiming), Choosing a target (pick on board / list), ephemeral-channel spec (+8 more)

### Community 103 - "Community 103"
Cohesion: 0.14
Nodes (17): asset-library spec, Upload to library, builtin-library-assets spec, Built-in assets in every library, Built-in maps are top-down with own grid, Template-editing mode (map, fog, token tools only), GM surfaces lead back to the dashboard, Home page maps show their squares (+9 more)

### Community 104 - "Community 104"
Cohesion: 0.12
Nodes (16): dependencies, zod, devDependencies, typescript, vitest, exports, typescript, vitest (+8 more)

### Community 105 - "Community 105"
Cohesion: 0.17
Nodes (12): TEMPORARY_ROOM_LIFETIME_MS, clients, editing(), gmFetch(), list(), PNG, save(), session() (+4 more)

### Community 106 - "Community 106"
Cohesion: 0.12
Nodes (16): dependencies, @fontsource/geist-mono, @fontsource/geist-sans, framer-motion, @phosphor-icons/react, pixi-filters, pixi.js, react (+8 more)

### Community 107 - "Community 107"
Cohesion: 0.20
Nodes (13): App(), GmDashboardPage, LibraryPage, RoomPage, RoutePage(), ADR-0033, HomePage(), listeners (+5 more)

### Community 108 - "Community 108"
Cohesion: 0.13
Nodes (16): dice.roll attack context (actor, target, label), AttackContext.kind toHit|damage, ADR 0012 Library creatures, image_asset_id ON DELETE SET NULL, Creature name is a board name (exception to ADR 0004), library_creatures resource, Placement copies values into token.create, ADR 0020 Creature colour, conditions, count (+8 more)

### Community 109 - "Community 109"
Cohesion: 0.17
Nodes (16): room-access spec, Departure review for revoked player's tokens, GM resets invite link, GM can revoke a player (ParticipantRevoked), Revoked participant disconnected and credential refused, Share control in top bar, room-navigation spec, GM Home link (+8 more)

### Community 110 - "Community 110"
Cohesion: 0.22
Nodes (10): CommandInput, DomainEvent, GAME_PRESETS, committedRoom(), ADR-0013, bite, scimitar, withGoblin() (+2 more)

### Community 111 - "Community 111"
Cohesion: 0.26
Nodes (14): clients, connect(), gmFetch(), library(), list(), named(), ok(), ownerOf() (+6 more)

### Community 112 - "Community 112"
Cohesion: 0.16
Nodes (11): Entry, MAX_PENDING_JOBS, parseResult(), StartResult, ADR-0029, WALL_WORKER_HEARTBEAT, WallNotifier, setup() (+3 more)

### Community 113 - "Community 113"
Cohesion: 0.20
Nodes (14): Web app index.html (Vite entry), Visibility filtering (hidden info never leaves server), Frontend Implementation Contract, 13.8 Tokens, component states and accessibility, 13.1 Account-gated room creation and guest entry, 13.2 Private preparation drafts and atomic scene replacement, 13.3 Responsive layout and navigation, 13.5 Tool interactions and player-safe rendering (+6 more)

### Community 114 - "Community 114"
Cohesion: 0.26
Nodes (11): GuideStep, guideSteps(), placeCard(), Rect, Role, STEPS, StepSpec, blockersAround() (+3 more)

### Community 115 - "Community 115"
Cohesion: 0.18
Nodes (13): Delivery Plan, Definition of done for a slice, Slices 0-13 (foundations through quality of life), MIT License, README: VTT Project Specification, Competitive Positioning (Roll20, Foundry, Owlbear, Quest Portal), Four Workflow Promises (prepare, join, play, recover), Getting Started (Options A/B/C: no Docker, Compose, infra-only) (+5 more)

### Community 116 - "Community 116"
Cohesion: 0.15
Nodes (14): Attack rolls never reveal hidden tokens, Server authorizes attack rolls, Rulings never reveal hidden information, No animation reveals hidden tokens, Checkpoints never reveal hidden information, Content under fog is not sent to players, Continue as guest, gm-home spec (+6 more)

### Community 117 - "Community 117"
Cohesion: 0.14
Nodes (14): board-view-filters spec, Compact GM Show menu, checkpoints spec, GM saves a named checkpoint, encounter-templates spec, Replace a template from a room, Save a room's board as a template, fog-of-war spec (+6 more)

### Community 118 - "Community 118"
Cohesion: 0.18
Nodes (14): room-activity-log spec, Room activity modal, GM-only committed history, Stable pagination and actor search, Readable GM rulings and damage entries, room-ui-refinements spec, Compact activity-log refresh icon, Sidebar handle toggles on every click (+6 more)

### Community 119 - "Community 119"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit, noImplicitOverride (+5 more)

### Community 120 - "Community 120"
Cohesion: 0.15
Nodes (13): dependencies, @aws-sdk/client-s3, bullmq, express, image-size, ioredis, multer, @node-rs/argon2 (+5 more)

### Community 121 - "Community 121"
Cohesion: 0.18
Nodes (8): candidate, clients, dimensions, imageForm(), libraryUpload(), PNG, roomUpload(), ADR-0017

### Community 122 - "Community 122"
Cohesion: 0.38
Nodes (10): formatTime(), isTyping(), ReplayBar(), ADR-0025, playFrom(), playTick(), REPLAY_STEP_MS, stepLabel() (+2 more)

### Community 123 - "Community 123"
Cohesion: 0.24
Nodes (12): ADR 0027 Game presets, FR-GM-15 forged command rejection, Free Mode preset, GAME_PRESETS registry, presetRefusal enforcement in decide, RoomCreated.preset field, ADR 0034 Shared token attacks, TokenAttacksSet event (+4 more)

### Community 124 - "Community 124"
Cohesion: 0.17
Nodes (13): Library grid sample editor (A/B anchors), Map assets carry a grid, Place a library asset in a room (grid copied), Save grid to library, Place a built-in in a room, Built-ins are read-only, grid-line-style spec, Line style under Advanced disclosure (+5 more)

### Community 125 - "Community 125"
Cohesion: 0.19
Nodes (12): map-editor spec, Full-screen map editor (Map/Grid/Walls/Fog steps), Phone and tablet editor layout and pinch/pan, App runs without wall detection, Walls step (Draw, Erase, Detect), Grid analysis reaches vision service in compose, Vision service requirements, bullmq dependency (job queue) (+4 more)

### Community 126 - "Community 126"
Cohesion: 0.23
Nodes (13): map-preparation spec, Apply map (atomic map and grid publish), Cancel discards draft, Private draft map, room-grid-calibration spec, Adjust grid editor, Apply commits only a valid changed grid, Invalid grid drafts cannot be applied (+5 more)

### Community 127 - "Community 127"
Cohesion: 0.24
Nodes (6): DiceDrop, DROP_WAIT_MS, PendingDrops, ADR-0014, Waiting, drop()

### Community 128 - "Community 128"
Cohesion: 0.44
Nodes (9): clamp01(), hexToHsv(), Hsv, hsvToHex(), hueSatToPoint(), isHex(), pointToHueSat(), ColorWheel() (+1 more)

### Community 129 - "Community 129"
Cohesion: 0.17
Nodes (12): Sync protocol (hello, welcome, event, redacted, resync), Attack and animation performance review, Nuke HP presentation hold until impact frame, Shared live-particle allowance and quality tiers, Route-level code splitting (67% less entry JS), To-hit roll vs damage roll (why attacks did no damage), 13.4 Connection, concurrency, undo and checkpoint restore, Checkpoint restoration browser regression (+4 more)

### Community 130 - "Community 130"
Cohesion: 0.20
Nodes (12): ADR 0004 GM device identity and asset library, assetId on MapImage and Token (nullish), asset_refs projection (read model), Asset delete is final; board draws stand-in on 404, Interim GM identity (X-GM-Token, resolveGm), MapSet carries gridChange (single fact), ADR 0005 Grid line style, gridLineStyle resolver (+4 more)

### Community 131 - "Community 131"
Cohesion: 0.18
Nodes (11): devDependencies, prisma, socket.io-client, tsx, @types/express, @types/multer, @types/node, @types/ws (+3 more)

### Community 132 - "Community 132"
Cohesion: 0.22
Nodes (3): bullmqWallQueue(), redisAddress(), WallJobQueue

### Community 133 - "Community 133"
Cohesion: 0.31
Nodes (10): ADR 0026 Token groups, duplicate, undo, group.* commands and Group events, InitiativeStartUndone event, inverseOf returns DomainEvent[], TokenCreated reversible, token.duplicate command, TokenGroup state (groups, tokenGroups), ADR 0033 Duplicate at a chosen square (+2 more)

### Community 134 - "Community 134"
Cohesion: 0.18
Nodes (11): attack-rolls spec, Attack section in Play, Custom roll builder, Shared named attacks, attack-rulings spec, Player sees the outcome, Roll type on attack rolls (To hit / Damage), board-attack-effects spec (+3 more)

### Community 135 - "Community 135"
Cohesion: 0.20
Nodes (10): GM applies damage, GM rules Hit or Miss, GM Rulings list, Ruling and damage endings, GM restores a checkpoint, A restore can be undone, encounter.apply command (existing room), Template data is validated (format version) (+2 more)

### Community 136 - "Community 136"
Cohesion: 0.18
Nodes (10): leave-table spec, Leaving asks for confirmation, Unresolved departures listed for GM, GM is notified when a player leaves, A departed player's history is kept, Players can leave the table (control), participant.leave command, participant.resolveDeparture command (+2 more)

### Community 137 - "Community 137"
Cohesion: 0.25
Nodes (11): token-duplication spec, Board token card Edit button, Duplicate offered in editor, roster row, board card, GM duplicates a token, Only the GM duplicates, token-names spec, Name in use is auto-numbered (Goblin 2), Deleted tokens free their name (+3 more)

### Community 138 - "Community 138"
Cohesion: 0.18
Nodes (10): compilerOptions, esModuleInterop, module, moduleResolution, noEmit, skipLibCheck, strict, target (+2 more)

### Community 139 - "Community 139"
Cohesion: 0.20
Nodes (10): scripts, account:reset-password, dev, postinstall, prisma:generate, prisma:migrate, start, test (+2 more)

### Community 141 - "Community 141"
Cohesion: 0.22
Nodes (10): Browsing the library does not create an owner, Library details stay private from players, Library ownership and access (GM-only), Templates are private to their GM, GM device identity (hashed GM token), gm-identity-recovery spec, Recovery is bounded (one retry), Recovery never replaces the GM token (+2 more)

### Community 142 - "Community 142"
Cohesion: 0.36
Nodes (8): clients, connect(), document(), ok(), prepared(), setup(), upload(), url()

### Community 143 - "Community 143"
Cohesion: 0.29
Nodes (5): alice, gm, room(), show(), tok()

### Community 144 - "Community 144"
Cohesion: 0.25
Nodes (7): compilerOptions, jsx, lib, types, extends, include, ../../tsconfig.base.json

### Community 145 - "Community 145"
Cohesion: 0.29
Nodes (8): Open questions (multi-user undo, redaction timing leak, snapshot cadence), Stretch cut order, Wall detection (FR-GM-11), Learned wall model (walls.onnx ResNet-34 U-Net), Map editor Walls step (Draw, Erase, Detect like this), Rule-based top-hat wall detector and limits, FR-GM-11 Vision-based map parsing, Principal Risks and Mitigations

### Community 146 - "Community 146"
Cohesion: 0.43
Nodes (7): ADR 0030 Portals: doors and windows, describePortalChange wording helper, PortalChanged event, portalConcealedFrom visibility rule, Portal (kind, state) on Wall, portal.set command, portal.setState command

### Community 147 - "Community 147"
Cohesion: 0.39
Nodes (8): ADR 0031 Detection identity and map editor command context, resultId SHA-256 detection identity, Editor session and map binding, expectedMapUrl command guard, ADR 0032 Atomic fog replacement, fog.replace command, One undo entry for fog swap, MAX_FOG_REGIONS cap

### Community 148 - "Community 148"
Cohesion: 0.25
Nodes (8): Fixed condition effects, Reduced motion (board effects), client-render-performance spec, Bounded render resolution (2x DPR), No per-frame decorative effects, Board renders on demand, Light and dark grounds on home page only, Contrast and motion (WCAG AA)

### Community 149 - "Community 149"
Cohesion: 0.29
Nodes (8): portals spec, GM designates walls as doors/windows (portal.set), Portal state controls movement blocking, Who may change portal state (portal.setState), Portal changes are undoable, Players see only portals outside fog, Readable attributed action sentences, Players never see groups

### Community 150 - "Community 150"
Cohesion: 0.36
Nodes (8): Token creation is one undoable action, token-groups spec, GM manages groups (create, rename, delete), Group membership (one group per token), Group changes and encounter starts undoable, Move to menu and drag handle in roster, Groups in the GM roster, Start an encounter from groups

### Community 152 - "Community 152"
Cohesion: 0.38
Nodes (5): board, gmFetch(), PNG, put(), uploadOk()

### Community 153 - "Community 153"
Cohesion: 0.38
Nodes (6): clients, DOORWAY, FAR_WALL, seqOf(), setup(), walls()

### Community 154 - "Community 154"
Cohesion: 0.33
Nodes (6): clients, connect(), leave(), roomWith(), ADR-0006, MAX_PLAYERS_PER_ROOM

### Community 155 - "Community 155"
Cohesion: 0.33
Nodes (6): Coding Conventions (noun.verb, PastTense, zod, FR IDs), Dice skins, Colour dice skin format v1 (proposed, JSON), Four-layer die rendering (shape, pose, paint, size), Image dice looks (templates, per-die pictures), 13.6 Component and state ownership (React vs Pixi, Zustand)

### Community 156 - "Community 156"
Cohesion: 0.43
Nodes (6): ADR 0033 Editing encounter templates in temporary rooms, encounter-edits REST routes, PUT encounters/:id/from-room, Template walls and portals amendment, Temporary room (rooms.temporary), Hourly temporary room sweep

### Community 157 - "Community 157"
Cohesion: 0.38
Nodes (7): Warn before deleting an asset in use, board-asset-fallback spec, Missing images return 404, Map fallback (neutral surface), Token image fallback (colour disc), Manage templates in the library, Creatures lose deleted art

### Community 158 - "Community 158"
Cohesion: 0.29
Nodes (7): Save, discard and close a temporary room, Edit a template in a temporary room, Temporary rooms are private and short-lived (24h), gm-dashboard spec, GM dashboard (/gm-dashboard), One entry rule (recognised browser), Both paths in the first screen (join / run)

### Community 160 - "Community 160"
Cohesion: 0.33
Nodes (6): UVTT Exporter Fixtures README, Arkenforge tavern fixture (rejected: duplicate points), Dungeondraft test dd2vtt fixture, Default portrait artwork credits, Requirements traceability matrix (B/~/D), Functional Requirements (FR-GM, FR-PL, FR-TAC, FR-SYNC, FR-REC)

### Community 161 - "Community 161"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 162 - "Community 162"
Cohesion: 0.47
Nodes (5): check(), CROP, gridSvg(), MAPS, root()

### Community 163 - "Community 163"
Cohesion: 0.60
Nodes (5): ADR 0038 Attack styles, nuke, reduced animations, AnimationDef data schema, library_animations table and routes, nuke.detonate / MapNuked, RoomState.reducedEffects

### Community 164 - "Community 164"
Cohesion: 0.47
Nodes (6): upload-storage spec, Earlier disk uploads stay reachable, Every upload kept on local disk; delete removes both, No request-checksum trailers for SeaweedFS, Production requires SeaweedFS, Uploads go to SeaweedFS when available (S3_ENDPOINT, autodetect)

### Community 165 - "Community 165"
Cohesion: 0.70
Nodes (3): DEFAULT_AC, DEFAULT_HP, statsWithDefaults()

### Community 166 - "Community 166"
Cohesion: 0.60
Nodes (3): OpenSpec config.yaml, Project context for AI, spec-driven schema

### Community 167 - "Community 167"
Cohesion: 0.60
Nodes (5): room-load-isolation spec, Failed room load fails only that REST request (500), Failed room load is retried, not cached, Failed room load refuses only that socket (not_found), Unhandled rejections logged, not fatal

### Community 168 - "Community 168"
Cohesion: 0.50
Nodes (5): token-image-preview spec, Token image preview matches board rendering, token-placement spec, GM chooses new token square on board (ghost, repeat placing), Keyboard placing and cancel

### Community 169 - "Community 169"
Cohesion: 0.50
Nodes (4): ADR 0014 Dice drops on ephemeral channel, Drop-to-roll pairing by thrower, expression, order, diceDrop ephemeral payload {expression, from, to}, Reliable (non-volatile) delivery for drops

### Community 170 - "Community 170"
Cohesion: 0.50
Nodes (3): npx, playwright, @playwright/mcp

### Community 171 - "Community 171"
Cohesion: 0.50
Nodes (3): extends, include, ../../tsconfig.base.json

## Ambiguous Edges - Review These
- `Explicitly Out of Scope` → `To-hit roll vs damage roll (why attacks did no damage)`  [AMBIGUOUS]
  docs/ATTACK-PERFORMANCE-REVIEW.md · relation: conceptually_related_to

## Knowledge Gaps
- **572 isolated node(s):** `npx`, `@playwright/mcp`, `@vtt/shared`, `sharp`, `zod` (+567 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1684 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MemoryRoomStore` connect `Creature Library & Memory Store` to `Credentials & Encounter Templates`, `Grid Detection State`, `Server Test Suite`, `Dev Account & Auth Middleware`, `Animation Library Store`, `Uploads & UVTT Export`, `Express App Lifecycle`, `Room Client & Area Templates`, `Community 142`, `Room Registry`, `Account & Activity Tests`, `LibraryStore Interface`, `Room Uploads & Game Presets`, `Community 45`, `Community 63`, `Community 67`, `Community 82`, `Community 97`, `Community 105`, `Community 121`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **What connects `npx`, `@playwright/mcp`, `@vtt/shared` to the rest of the system?**
  _572 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Credentials & Encounter Templates` be split into smaller, more focused modules?**
  _Cohesion score 0.034482758620689655 - nodes in this community are weakly interconnected._
- **Why does `PostgresRoomStore` connect `Animation Library Store` to `Credentials & Encounter Templates`, `Grid Detection State`, `Dev Account & Auth Middleware`, `Community 67`, `LibraryStore Interface`, `Express App Lifecycle`, `Room Uploads & Game Presets`, `Community 140`, `Community 82`, `Room Registry`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Should `Grid Detection State` be split into smaller, more focused modules?**
  _Cohesion score 0.03464686845612031 - nodes in this community are weakly interconnected._
- **Why does `RoomStore` connect `Room Registry` to `Credentials & Encounter Templates`, `Grid Detection State`, `Dev Account & Auth Middleware`, `Community 67`, `Animation Library Store`, `Express App Lifecycle`, `LiveRoom Methods`, `LibraryStore Interface`, `Uploads & UVTT Export`, `Room Replay & Checkpoints`, `Creature Library & Memory Store`, `Room Uploads & Game Presets`, `Community 45`, `Community 82`, `LiveRoom Pipeline`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Explicitly Out of Scope` and `To-hit roll vs damage roll (why attacks did no damage)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._