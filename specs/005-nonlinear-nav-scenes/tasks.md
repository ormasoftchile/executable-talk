# Tasks: Non-Linear Navigation, Scenes & Cross-Platform Commands

**Input**: Design documents from `/specs/005-nonlinear-nav-scenes/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Included — TDD is mandatory per project constitution (Principle IV).

**Organization**: Tasks grouped by user story (5 stories: 2× P1, 2× P2, 1× P3)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1–US5) this task belongs to
- File paths are relative to repository root

---

## Phase 1: Setup (Extension Manifest & Shared Types)

**Purpose**: Register new commands, keybindings, and extend shared model types

- [x] T001 Register 3 new commands (executableTalk.goToSlide, executableTalk.saveScene, executableTalk.restoreScene) in package.json contributes.commands
- [x] T002 [P] Register keybindings in package.json contributes.keybindings: Ctrl+G/Cmd+G → goToSlide, Ctrl+S/Cmd+S → saveScene, Ctrl+R/Cmd+R → restoreScene, all with when clause "activeWebviewPanelId == 'executableTalkPresentation'"
- [x] T003 [P] Add SceneDefinition, NavigationMethod type, and NavigationHistoryBreadcrumb interface to src/models/deck.ts per data-model.md and contracts/navigation-protocol.md
- [x] T004 [P] Extend EditorState interface with optional cursorPosition: { line: number; character: number } in src/models/snapshot.ts per data-model.md
- [x] T005 [P] Update src/models/index.ts to re-export new types (SceneDefinition, NavigationMethod, NavigationHistoryBreadcrumb)

**Checkpoint**: Extension manifest has new commands and keybindings; shared model types are available

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can begin

**⚠️ CRITICAL**: All user stories depend on these message types, snapshot enhancements, and NavigationHistory

- [x] T006 Add all new message types to src/webview/messages.ts per contracts/navigation-protocol.md and contracts/scene-store.md: goBack, saveScene, restoreScene, deleteScene (Webview→Host); openSlidePicker, openScenePicker, openSceneNameInput, sceneChanged, warning (Host→Webview); extend slideChanged payload with navigationHistory[] and canGoBack
- [x] T007 Add routing stubs for new message types in src/webview/messageHandler.ts — dispatch goBack, saveScene, restoreScene, deleteScene to Conductor; dispatch openSlidePicker, openScenePicker, openSceneNameInput, sceneChanged, warning to Webview
- [x] T008 [P] Extend src/conductor/snapshotFactory.ts — capture cursorPosition via editor.selection.active in captureEditorStates(); restore cursorPosition via editor.selection = new Selection(...) + editor.revealRange() in restoreEditorStates(); add partial restore returning RestoreResult with skipped resources per contracts/scene-store.md
- [x] T009 [P] Create src/conductor/navigationHistory.ts with NavigationHistory class: push(entry), goBack() → previousSlideIndex, getRecent(count) → NavigationHistoryEntry[], clear(), 50-entry FIFO cap per data-model.md

**Checkpoint**: Foundation ready — all message types, enhanced snapshots, and NavigationHistory available for user stories

---

## Phase 3: User Story 1 — Jump to Any Slide During Q&A (Priority: P1) 🎯 MVP

**Goal**: Open a slide picker overlay, jump to any slide by number/search, and go back to the previous slide

**Independent Test**: Open a 20-slide deck, press Ctrl+G, slide picker appears with all slides listed. Select slide 15 — presentation jumps instantly. Type "7" + Enter — jumps to slide 7. Press Alt+Left — returns to slide 15.

### Tests for User Story 1

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T010 [P] [US1] Unit test for NavigationHistory push/goBack/getRecent/clear/cap in test/unit/conductor/navigationHistory.test.ts
- [x] T011 [P] [US1] Integration test for non-linear navigation: goto message → slideChanged response, goBack → returns to previous slide, out-of-range index → error in test/integration/nonLinearNavigation.test.ts

### Implementation for User Story 1

- [x] T012 [US1] Implement goto case in Conductor navigate switch in src/conductor/conductor.ts — validate slideIndex in range, push NavigationHistory entry (method: 'jump'), capture snapshot → push StateStack, navigate to slideIndex, execute onEnter actions, send slideChanged
- [x] T013 [US1] Implement goBack message handler in src/conductor/conductor.ts — query NavigationHistory.goBack(), if non-null navigate via goto flow with method 'go-back'
- [x] T014 [US1] Register executableTalk.goToSlide command handler in src/extension.ts — sends { type: 'openSlidePicker' } postMessage to active Webview panel
- [x] T015 [P] [US1] Create slide picker overlay UI in src/webview/assets/presentation.js — fixed-position overlay with search input, filterable slide list (number + title), keyboard navigation (ArrowUp/Down to select, Enter to confirm, Escape to dismiss), focus trapping while open
- [x] T016 [P] [US1] Add slide picker overlay styles in src/webview/assets/presentation.css — position fixed, z-index 1000, VS Code theme variables (--vscode-quickInput-background, --vscode-quickInput-foreground, --vscode-widget-shadow), semi-transparent backdrop
- [x] T017 [US1] Add digit-key jump-by-number input handler in src/webview/assets/presentation.js — accumulate digit keypresses with visual indicator, Enter sends navigate goto, Escape/timeout clears accumulator
- [x] T018 [US1] Add Alt+Left keydown handler in src/webview/assets/presentation.js — sends { type: 'goBack' } postMessage
- [x] T019 [US1] Wire slide picker selection to postMessage { type: 'navigate', payload: { direction: 'goto', slideIndex } } in src/webview/assets/presentation.js
- [x] T020 [US1] Handle openSlidePicker message from extension host in src/webview/assets/presentation.js — show overlay, populate slide list from current deck data

**Checkpoint**: User Story 1 complete — can jump to any slide via picker, number input, or go back. Independently testable.

---

## Phase 4: User Story 2 — Save and Restore Named Scenes (Priority: P1)

**Goal**: Save current IDE state as a named scene and restore it instantly for demo recovery

**Independent Test**: Navigate to slide 5 with 3 files and 1 terminal open, press Ctrl+S, name it "demo-start". Continue to slide 10, open more files. Press Ctrl+R, select "demo-start" — IDE returns to exact state (files, cursors, terminal, slide 5).

### Tests for User Story 2

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T021 [P] [US2] Unit test for SceneStore save/get/restore/delete/list/getRuntimeCount/clear/loadAuthored/20-cap-limit/authored-read-only in test/unit/conductor/sceneStore.test.ts
- [x] T022 [P] [US2] Integration test for scene lifecycle: save scene → modify state → restore scene → verify IDE state matches, partial restore with missing file → warning in test/integration/sceneRestore.test.ts

### Implementation for User Story 2

- [x] T023 [US2] Create src/conductor/sceneStore.ts with SceneStore class implementing save, get, restore, delete, list, loadAuthored, getRuntimeCount, clear per contracts/scene-store.md — Map<string, SceneEntry> storage, 20 runtime cap, authored scenes read-only
- [x] T024 [US2] Register executableTalk.saveScene command handler in src/extension.ts — sends { type: 'openSceneNameInput' } postMessage to active Webview panel
- [x] T025 [US2] Register executableTalk.restoreScene command handler in src/extension.ts — sends { type: 'openScenePicker' } postMessage to active Webview panel
- [x] T026 [US2] Implement saveScene message handler in src/conductor/conductor.ts — validate name not authored (send error if so), call SceneStore.save() which throws if runtime count ≥ 20 and name is new → catch and send non-blocking error to Webview ("Scene limit reached. Delete an existing scene to save a new one."), on success call SnapshotFactory.capture(), send sceneChanged to Webview
- [x] T027 [US2] Implement restoreScene message handler in src/conductor/conductor.ts — capture pre-restore snapshot → push StateStack, call SceneStore.restore(), if snapshot exists call SnapshotFactory.restore() with partial restore handling, navigate to scene slideIndex, push NavigationHistory entry (method: 'scene-restore'), send slideChanged + sceneChanged, send warning if skipped resources
- [x] T027a [US2] Implement deleteScene message handler in src/conductor/conductor.ts — validate scene is not authored (send error if so), call SceneStore.delete(name), send sceneChanged to Webview with updated list
- [x] T028 [P] [US2] Create scene name input overlay in src/webview/assets/presentation.js — text field with placeholder "Scene name...", Enter to confirm, Escape to cancel, sends { type: 'saveScene', payload: { sceneName } }
- [x] T029 [P] [US2] Create scene picker overlay in src/webview/assets/presentation.js — reuse slide picker overlay pattern, display scenes with name/origin/slide/timestamp, keyboard navigation, sends { type: 'restoreScene', payload: { sceneName } }; add delete action (icon button or keyboard shortcut) on saved scenes only → sends { type: 'deleteScene', payload: { sceneName } }
- [x] T030 [US2] Add scene overlay styles (name input + scene picker) to src/webview/assets/presentation.css — consistent with slide picker styling
- [x] T031 [US2] Handle sceneChanged message in src/webview/assets/presentation.js — update cached scene list for picker
- [x] T032 [US2] Handle warning message in src/webview/assets/presentation.js — display non-blocking toast notification with title, message, and expandable details

**Checkpoint**: User Story 2 complete — can save/restore named scenes with full IDE state. Independently testable.

---

## Phase 5: User Story 3 — Define Cross-Platform Commands (Priority: P2)

**Goal**: Author terminal commands with per-OS variants so one deck works on macOS, Windows, and Linux

**Independent Test**: Create deck with `command: { macos: "open .", windows: "explorer .", linux: "xdg-open ." }` in a terminal.run onEnter action. Run on current OS — correct command executes. Run preflight — no warnings. Remove current OS key and default — preflight warns about missing platform.

### Tests for User Story 3

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T033 [P] [US3] Unit test for PlatformResolver resolve/getCurrentPlatform/expandPlaceholders/validate in test/unit/actions/platformResolver.test.ts — test string passthrough, platform map resolution, default fallback, missing platform error, all 4 placeholder expansions, validation coverage
- [x] T034 [P] [US3] Unit test for cross-platform command parsing from YAML in test/unit/parser/crossPlatformParsing.test.ts — PlatformCommandMap object parsed correctly, string command unchanged, invalid map rejected

### Implementation for User Story 3

- [x] T035 [US3] Create src/actions/platformResolver.ts with PlatformResolver class per contracts/platform-resolver.md — resolve(command: string | PlatformCommandMap), getCurrentPlatform() mapping process.platform, expandPlaceholders() for ${pathSep}/${home}/${shell}/${pathDelimiter}, validate() returning PlatformValidationResult
- [x] T036 [US3] Integrate PlatformResolver into src/actions/terminalRunExecutor.ts — resolve params.command via PlatformResolver.resolve() before sendText(), return non-blocking ActionError if resolved.command is undefined
- [x] T037 [US3] Extend src/parser/actionBlockParser.ts to recognize and validate PlatformCommandMap object syntax in terminal.run command params — accept both string and object, validate at least one key present
- [x] T038 [US3] Extend src/validation/preflightValidator.ts with cross-platform coverage check — for each terminal.run action with PlatformCommandMap, call PlatformResolver.validate(), add warning if current platform not covered and no default

**Checkpoint**: User Story 3 complete — cross-platform commands resolve correctly per OS, preflight validates coverage. Independently testable.

---

## Phase 6: User Story 4 — Navigation History Trail (Priority: P2)

**Goal**: Display a breadcrumb trail of visited slides for orientation during non-linear navigation

**Independent Test**: Jump between slides 1 → 5 → 12 → 3 → 8. View breadcrumb trail — shows this sequence. Click slide 12 in trail — presentation jumps there. Trail now shows 1 → 5 → 12 → 3 → 8 → 12.

### Tests for User Story 4

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T039a [P] [US4] Unit test for breadcrumb rendering logic and history-click navigation — verify getRecent(10) returns correct slice, verify breadcrumb click sends navigate goto with method 'history-click', verify sequential navigation pushes entries in test/unit/conductor/navigationHistory.test.ts (extend T010 file)
- [x] T039b [P] [US4] Integration test for history trail end-to-end: jump 5 slides → verify slideChanged contains navigationHistory array → click breadcrumb entry → verify navigation in test/integration/nonLinearNavigation.test.ts (extend T011 file)

### Implementation for User Story 4

- [x] T039 [US4] Extend slideChanged message construction in src/conductor/conductor.ts — include NavigationHistory.getRecent(10) as navigationHistory breadcrumb array and NavigationHistory.goBack() !== null as canGoBack flag
- [x] T040 [P] [US4] Create history breadcrumb rendering in src/webview/assets/presentation.js — display recent slide visits as clickable breadcrumb trail, "show more" toggle for entries beyond 10, click sends navigate goto with method 'history-click'
- [x] T041 [P] [US4] Add history breadcrumb styles in src/webview/assets/presentation.css — non-intrusive bottom or top bar, semi-transparent background, VS Code theme variables, show/hide on hover or toggle
- [x] T042 [US4] Track navigation method in NavigationHistory entries from Conductor — extend existing sequential navigation methods (nextSlide, previousSlide, firstSlide, lastSlide) to push NavigationHistory entries with method 'sequential'; pass correct method ('jump', 'scene-restore', 'history-click', 'go-back') for each non-linear navigation type in src/conductor/conductor.ts

**Checkpoint**: User Story 4 complete — breadcrumb trail visible and interactive. Independently testable.

---

## Phase 7: User Story 5 — Pre-Authored Scene Anchors in Deck Frontmatter (Priority: P3)

**Goal**: Define scene checkpoints in deck YAML frontmatter so presenters get pre-configured recovery points

**Independent Test**: Create deck with `scenes: [{name: "intro", slide: 1}, {name: "live-demo", slide: 8}]` in frontmatter. Open presentation — "intro" and "live-demo" appear in scene picker marked as "authored". Restore "live-demo" — navigates to slide 8. Attempt to overwrite "live-demo" via save — error shown.

### Tests for User Story 5

> **Write these tests FIRST, ensure they FAIL before implementation**
> *(Note: T042a/T042b are US5 test tasks — unrelated to Phase 6 task T042)*

- [x] T042a [P] [US5] Unit test for authored scene parsing and validation — valid frontmatter scenes parsed to SceneDefinition[], duplicate name rejected, out-of-range slide rejected, missing name rejected in test/unit/parser/authoredSceneParsing.test.ts
- [x] T042b [P] [US5] Unit test for authored scene lifecycle in SceneStore — loadAuthored initializes with null snapshot, restore of null-snapshot scene returns entry, save with authored name throws, list() shows authored first in test/unit/conductor/sceneStore.test.ts (extend T021 file)

### Implementation for User Story 5

- [x] T043 [US5] Extend src/parser/deckParser.ts to extract scenes array from deck frontmatter metadata and map to SceneDefinition[] on the Deck model — validate name uniqueness, slide range [1, slides.length]
- [x] T044 [US5] Call SceneStore.loadAuthored(deck.sceneDefinitions) from Conductor when deck is loaded in src/conductor/conductor.ts — initialize authored scenes with null snapshot
- [x] T045 [US5] Display authored scenes (labeled "authored") alongside saved scenes (labeled "saved") in scene picker in src/webview/assets/presentation.js — authored scenes shown first, alphabetically sorted
- [x] T046 [US5] Handle restore of authored scene with null snapshot in src/conductor/conductor.ts — navigate to anchored slide index, execute onEnter actions, do NOT attempt SnapshotFactory.restore() for null snapshot

**Checkpoint**: User Story 5 complete — authored scenes load from frontmatter and appear in picker. Independently testable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements affecting multiple user stories

- [x] T047 [P] Update src/conductor/index.ts to export SceneStore and NavigationHistory classes
- [x] T047a Extend executableTalk.resetPresentation command handler in src/conductor/conductor.ts to call SceneStore.clear() and NavigationHistory.clear() — ensures global reset restores clean state per Constitution Principle II
- [x] T047b [P] Add ARIA roles and labels to overlay components in src/webview/assets/presentation.js — slide picker (role=dialog, aria-label="Go to slide"), scene picker (role=dialog), breadcrumb trail (role=navigation, aria-label="Slide history"), toast warning (role=alert) per Constitution Quality Gate 4
- [x] T048 [P] Update src/actions/index.ts to export PlatformResolver class
- [x] T049 [P] Create examples/cross-platform.deck.md showcasing platform command maps, scene anchors, and navigation features
- [x] T050 [P] Add actionSchema entries for PlatformCommandMap command variant in src/providers/actionSchema.ts
- [x] T051 [P] Add hover/completion support for scenes frontmatter in src/providers/actionCompletionProvider.ts
- [x] T052 Update README.md with non-linear navigation, scenes, and cross-platform command documentation
- [x] T053 Update CHANGELOG.md with feature 005 version notes
- [x] T054 Validate all acceptance scenarios from spec.md pass end-to-end
- [x] T055 Run quickstart.md validation to ensure developer setup works

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup                → No dependencies — can start immediately
Phase 2: Foundational         → Depends on Setup (BLOCKS all user stories)
Phase 3: US1 (Jump to Slide)  → Depends on Foundational
Phase 4: US2 (Scenes)         → Depends on Foundational
Phase 5: US3 (Cross-Platform) → Depends on Foundational
Phase 6: US4 (History Trail)  → Depends on US1 (NavigationHistory populated by goto)
Phase 7: US5 (Authored Scenes)→ Depends on US2 (SceneStore exists)
Phase 8: Polish               → Depends on all desired stories complete
```

### User Story Dependencies

| Story | Can Start After | Dependencies |
|-------|-----------------|--------------|
| US1 (P1) — Jump to Slide | Foundational | None — core MVP |
| US2 (P1) — Scenes | Foundational | None — independent of US1 |
| US3 (P2) — Cross-Platform | Foundational | None — fully independent |
| US4 (P2) — History Trail | US1 | Needs NavigationHistory populated by goto navigation |
| US5 (P3) — Authored Scenes | US2 | Needs SceneStore from US2 |

### Within Each User Story

1. Tests MUST be written and FAIL before implementation (TDD — Constitution Principle IV)
2. Conductor logic before Webview UI
3. Extension host commands before Webview message handling
4. Core implementation before integration
5. Story complete before moving to next priority

### Parallel Opportunities

**Within Setup (Phase 1)**:
- T002, T003, T004, T005 can run in parallel (different files)

**Within Foundational (Phase 2)**:
- T008, T009 can run in parallel (snapshotFactory.ts vs navigationHistory.ts)

**Within US1 (Phase 3)**:
- T010, T011 (tests) can run in parallel
- T015, T016 (picker UI + CSS) can run in parallel

**Within US2 (Phase 4)**:
- T021, T022 (tests) can run in parallel
- T028, T029 (scene input + picker overlays) can run in parallel

**Within US3 (Phase 5)**:
- T033, T034 (tests) can run in parallel

**Within US4 (Phase 6)**:
- T039a, T039b (tests) can run in parallel
- T040, T041 (breadcrumb UI + CSS) can run in parallel

**Within US5 (Phase 7)**:
- T042a, T042b (tests) can run in parallel

**Across Stories** (once Foundational completes):
- US1, US2, US3 can start in parallel (no cross-dependencies)
- US4 starts after US1 completes
- US5 starts after US2 completes

---

## Parallel Example: User Story 1

```bash
# Launch tests in parallel:
Task T010: "Unit test for NavigationHistory in test/unit/conductor/navigationHistory.test.ts"
Task T011: "Integration test for non-linear navigation in test/integration/nonLinearNavigation.test.ts"

# After tests written and failing, implement sequentially:
Task T012: "Implement goto case in conductor.ts"
Task T013: "Implement goBack in conductor.ts"
Task T014: "Register goToSlide command in extension.ts"

# Launch UI tasks in parallel:
Task T015: "Create slide picker overlay in presentation.js"
Task T016: "Add slide picker styles in presentation.css"

# Remaining sequential:
Task T017: "Add digit-key jump handler in presentation.js"
Task T018: "Add Alt+Left goBack handler in presentation.js"
Task T019: "Wire picker selection to navigate goto in presentation.js"
Task T020: "Handle openSlidePicker message in presentation.js"
```

---

## Parallel Example: User Stories 1 + 2 + 3 (after Foundational)

```bash
# Developer A: US1 (Jump to Slide)
Tasks T010–T020

# Developer B: US2 (Scenes)
Tasks T021–T032

# Developer C: US3 (Cross-Platform)
Tasks T033–T038

# All three stories proceed independently in parallel
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 — Jump to Slide
4. **STOP and VALIDATE**: Open deck, Ctrl+G picker, number jump, Alt+Left go-back
5. Deploy/demo if ready — single most impactful improvement for live Q&A

### Incremental Delivery

| Increment | Stories | Value Delivered |
|-----------|---------|-----------------|
| MVP | US1 | Non-linear slide navigation during Q&A |
| +Recovery | +US2 | Named scene checkpoints for demo failure recovery |
| +Portability | +US3 | Cross-platform decks work on any OS |
| +Orientation | +US4 | Breadcrumb trail for non-linear navigation awareness |
| +Authored | +US5 | Pre-configured scene anchors in deck files |

### Parallel Team Strategy

With multiple developers:
1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (Jump to Slide) → then US4 (History Trail)
   - Developer B: US2 (Scenes) → then US5 (Authored Scenes)
   - Developer C: US3 (Cross-Platform) → then Polish
3. Stories complete and integrate independently

---

## Notes

- All file paths relative to repository root
- [P] = parallelizable (different files, no blocking dependencies)
- [US#] = maps to User Story # for traceability
- TDD is mandatory — write tests and verify they fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Workspace Trust: scenes save/restore may involve terminal.run actions → trust check applies
- Existing `navigate` message already defines `goto` direction — implementation fills the unhandled case
