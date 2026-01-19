# Tasks: Executable Talk Core Extension MVP

**Input**: Design documents from `/specs/001-core-extension-mvp/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Not explicitly requested in spec. Tasks focus on implementation only.

**Organization**: Tasks grouped by user story (6 stories: 2x P1, 2x P2, 2x P3)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US6) this task belongs to
- File paths are relative to repository root

---

## Phase 1: Setup (Project Initialization)

**Purpose**: Initialize VS Code extension project structure and tooling

- [X] T001 Create project structure per plan.md with src/, test/, .vscode/ directories
- [X] T002 Initialize package.json with VS Code extension manifest (activationEvents, contributes)
- [X] T003 [P] Configure tsconfig.json with strict mode and ES2022 target
- [X] T004 [P] Add .eslintrc.json with TypeScript rules
- [X] T005 [P] Create .vscodeignore for extension packaging
- [X] T006 Install dependencies: gray-matter, markdown-it, @types/vscode, @vscode/test-electron
- [X] T007 [P] Create src/extension.ts with basic activate/deactivate stubs
- [X] T008 [P] Create .vscode/launch.json with Extension Development Host configuration

**Checkpoint**: Project compiles and opens in Extension Development Host

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can begin

**⚠️ CRITICAL**: All user stories depend on these components

### Models (Shared Entities)

- [X] T009 [P] Create src/models/action.ts with ActionType, ActionStatus, Action interface per data-model.md
- [X] T010 [P] Create src/models/slide.ts with Slide, SlideFrontmatter, InteractiveElement interfaces per data-model.md
- [X] T011 [P] Create src/models/deck.ts with Deck interface per data-model.md
- [X] T012 [P] Create src/models/snapshot.ts with Snapshot, EditorState, TerminalState, DecorationState interfaces per data-model.md
- [X] T013 Create src/models/index.ts re-exporting all model types

### Parser Foundation

- [X] T014 [P] Create src/parser/deckParser.ts with parseDeck() using gray-matter for frontmatter extraction
- [X] T015 [P] Create src/parser/slideParser.ts with parseSlides() splitting content on `---` delimiter
- [X] T016 [P] Create src/parser/actionLinkParser.ts with parseActionLinks() for `[text](action:type?params)` syntax
- [X] T017 Create src/parser/index.ts orchestrating full deck parsing pipeline

### Message Protocol

- [X] T018 Create src/webview/messages.ts with WebviewToHostMessage and HostToWebviewMessage types per contracts/message-protocol.md
- [X] T019 [P] Create src/webview/messageHandler.ts with type guards and message dispatch per contracts/message-protocol.md

### Action Registry Foundation

- [X] T020 Create src/actions/types.ts with ActionExecutor interface, ExecutionContext, ExecutionResult per contracts/action-executor.md
- [X] T021 Create src/actions/registry.ts with ActionRegistry class (register, get, has, listActionTypes) per contracts/action-executor.md
- [X] T022 [P] Create src/actions/errors.ts with ValidationError, UnknownActionError, TimeoutError, TrustError per contracts/action-executor.md

### State Stack Foundation

- [X] T023 Create src/conductor/stateStack.ts with StateStack class (push, undo, redo, canUndo, canRedo, clear) per contracts/state-stack.md
- [X] T024 [P] Create src/conductor/snapshotFactory.ts with SnapshotFactory class (capture, restore) per contracts/state-stack.md

### Utilities

- [X] T025 [P] Create src/utils/workspaceTrust.ts with isTrusted(), onTrustChanged() wrappers per research.md
- [X] T026 [P] Create src/utils/zenMode.ts with enterZenMode(), exitZenMode(), wasZenModeActive() per research.md

**Checkpoint**: Foundation ready - all models, parser, registry, state stack infrastructure in place

---

## Phase 3: User Story 1 - Open and Navigate Presentation (Priority: P1) 🎯 MVP

**Goal**: Open `.deck.md` files and navigate slides in fullscreen Webview

**Independent Test**: Create simple `.deck.md`, run "Open Presentation" command, navigate with arrow keys, close with Escape

### Webview Implementation

- [X] T027 [US1] Create src/webview/webviewProvider.ts with WebviewProvider class managing panel lifecycle
- [X] T028 [P] [US1] Create src/webview/assets/presentation.html with slide container and navigation controls
- [X] T029 [P] [US1] Create src/webview/assets/presentation.css with fullscreen slide layout and transitions
- [X] T030 [P] [US1] Create src/webview/assets/presentation.js with keyboard handler (arrows, Escape) and message posting
- [X] T031 [US1] Implement postMessage handling in webviewProvider.ts for navigate, ready, close messages
- [X] T032 [US1] Implement slideChanged, deckLoaded message sending from extension to Webview

### Conductor Core

- [X] T033 [US1] Create src/conductor/conductor.ts with Conductor class orchestrating navigation and state
- [X] T034 [US1] Implement goToSlide(index) with bounds checking and snapshot capture before navigation
- [X] T035 [US1] Implement nextSlide(), previousSlide(), firstSlide(), lastSlide() navigation methods
- [X] T036 [US1] Wire Conductor to WebviewProvider via message handler delegation

### Extension Commands

- [X] T037 [US1] Register `executableTalk.openPresentation` command in package.json and extension.ts
- [X] T038 [US1] Register `executableTalk.closePresentation` command in package.json and extension.ts
- [X] T039 [US1] Implement command handler that parses active .deck.md file and opens WebviewProvider

**Checkpoint**: User Story 1 complete - can open deck, navigate slides, close presentation

---

## Phase 4: User Story 2 - Execute Actions from Slides (Priority: P1)

**Goal**: Slides automatically execute IDE actions (file.open, terminal.run, etc.) on navigation

**Independent Test**: Create deck with `onEnter` YAML actions, navigate to slide, verify IDE actions execute

### Action Executors

- [X] T040 [P] [US2] Create src/actions/fileOpenExecutor.ts implementing ActionExecutor for file.open per contracts/action-executor.md
- [X] T041 [P] [US2] Create src/actions/editorHighlightExecutor.ts implementing ActionExecutor for editor.highlight per contracts/action-executor.md
- [X] T042 [P] [US2] Create src/actions/terminalRunExecutor.ts implementing ActionExecutor for terminal.run per contracts/action-executor.md
- [X] T043 [P] [US2] Create src/actions/debugStartExecutor.ts implementing ActionExecutor for debug.start per contracts/action-executor.md
- [X] T044 [US2] Create src/actions/sequenceExecutor.ts implementing ActionExecutor for sequence (depends on other executors)

### Registry Integration

- [X] T045 [US2] Register all executors in ActionRegistry during extension activation in src/extension.ts
- [X] T046 [US2] Create src/actions/executionPipeline.ts with trust gate, validation, timeout wrapper per contracts/action-executor.md

### Conductor Integration

- [X] T047 [US2] Extend Conductor.goToSlide() to execute slide.onEnterActions after navigation
- [X] T048 [US2] Implement action status tracking and send actionStatusChanged messages to Webview
- [X] T049 [US2] Add action timeout handling with configurable default (30s)
- [X] T050 [US2] Implement Workspace Trust check blocking terminal.run and debug.start in untrusted workspaces
- [X] T051 [US2] Implement first-use confirmation dialog per FR-023 warning user deck contains executable actions

**Checkpoint**: User Story 2 complete - slides can trigger file.open, terminal.run, editor.highlight, debug.start

---

## Phase 5: User Story 3 - Click Interactive Elements (Priority: P2)

**Goal**: Click action links within slides to trigger IDE actions on demand

**Independent Test**: Create deck with `[Run Tests](action:terminal.run?command=npm%20test)` link, click it, verify terminal runs

### Parser Enhancement

- [X] T052 [US3] Enhance src/parser/actionLinkParser.ts to extract InteractiveElements from Markdown content
- [X] T053 [US3] Generate unique IDs for each interactive element within a slide

### Webview Enhancement

- [X] T054 [US3] Update presentation.js to detect clicks on action links and send executeAction message
- [X] T055 [US3] Add loading/success/error indicators to action links in presentation.css

### Conductor Integration

- [X] T056 [US3] Implement executeAction message handler in Conductor looking up action by ID
- [X] T057 [US3] Capture snapshot before interactive action execution (supports undo)
- [X] T058 [US3] Send actionStatusChanged (running → success/failed) back to Webview

**Checkpoint**: User Story 3 complete - can click action links in slides to trigger actions

---

## Phase 6: User Story 4 - Undo/Redo IDE State (Priority: P2)

**Goal**: Undo IDE changes made by slide actions for demo recovery

**Independent Test**: Navigate to slide that opens files, press Cmd+Z, verify files close

### Snapshot Capture Enhancement

- [X] T059 [US4] Implement captureEditorStates() in SnapshotFactory tracking open files and visible ranges
- [X] T060 [US4] Implement captureTerminalStates() in SnapshotFactory tracking presentation-created terminals
- [X] T061 [US4] Implement captureDecorations() in SnapshotFactory tracking active highlight decorations

### Snapshot Restore Implementation

- [X] T062 [US4] Implement restoreEditorStates() closing presentation-opened files
- [X] T063 [US4] Implement restoreTerminalStates() disposing presentation-created terminals
- [X] T064 [US4] Implement restoreDecorations() clearing and re-applying decorations

### Conductor Undo/Redo

- [X] T065 [US4] Implement Conductor.undo() popping StateStack and calling SnapshotFactory.restore()
- [X] T066 [US4] Implement Conductor.redo() re-applying undone snapshots
- [X] T067 [US4] Wire undo/redo messages from Webview to Conductor
- [X] T068 [US4] Update slideChanged messages with canUndo/canRedo flags

### Keyboard Bindings

- [X] T069 [US4] Add Cmd+Z / Ctrl+Z handling in presentation.js for undo
- [X] T070 [US4] Add Cmd+Shift+Z / Ctrl+Y handling in presentation.js for redo

**Checkpoint**: User Story 4 complete - can undo/redo IDE state during presentation

---

## Phase 7: User Story 5 - Zen Mode Integration (Priority: P3)

**Goal**: Auto-enter Zen Mode for distraction-free presentations

**Independent Test**: Start presentation, verify Side Bar and Activity Bar hide; exit, verify layout restores

### Zen Mode Implementation

- [X] T071 [US5] Implement zenMode.ts enterZenMode() using workbench.action.toggleZenMode command
- [X] T072 [US5] Track wasZenModeActive state before entering to preserve user preference
- [X] T073 [US5] Implement exitZenMode() restoring previous layout only if we enabled it

### Conductor Integration

- [X] T074 [US5] Call enterZenMode() when Conductor opens presentation
- [X] T075 [US5] Call exitZenMode() when Conductor closes presentation
- [X] T076 [US5] Handle edge case: user manually exits Zen Mode during presentation

**Checkpoint**: User Story 5 complete - presentations auto-enter/exit Zen Mode

---

## Phase 8: User Story 6 - Presenter View with Speaker Notes (Priority: P3)

**Goal**: Show speaker notes and next slide preview on secondary monitor

**Independent Test**: Connect second monitor, start presentation, verify notes appear on primary screen

### Multi-Monitor Detection

- [X] T077 [US6] Research window.getScreenDetails() API availability (limited browser API in Webview)
- [X] T078 [US6] Implement fallback: command palette option "Open Presenter View" creating second panel

### Presenter View Webview

- [X] T079 [P] [US6] Create src/webview/presenterViewProvider.ts managing presenter notes panel
- [X] T080 [P] [US6] Create src/webview/assets/presenter.html with notes, current slide, next preview layout
- [X] T081 [P] [US6] Create src/webview/assets/presenter.css with presenter view styling

### Synchronization

- [X] T082 [US6] Sync presenter view with main presentation on slide changes
- [X] T083 [US6] Display speaker notes from slide.speakerNotes in presenter view
- [X] T084 [US6] Show next slide preview (render slide[currentIndex + 1])

**Checkpoint**: User Story 6 complete - presenter view shows notes and upcoming slide

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements affecting multiple user stories

- [X] T085 Register executableTalk.resetPresentation command to close all presentation-opened resources
- [X] T086 [P] Add error handling for invalid .deck.md files with user-friendly error messages
- [X] T087 [P] Add trustStatusChanged message handling for dynamic trust changes
- [X] T088 [P] Create README.md with usage instructions and .deck.md format documentation
- [X] T089 [P] Create CHANGELOG.md with version 0.1.0 notes
- [X] T090 Validate all acceptance scenarios from spec.md pass
- [X] T091 Run quickstart.md validation to ensure developer setup works

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup              → No dependencies
Phase 2: Foundational       → Depends on Setup (BLOCKS all user stories)
Phase 3: US1 (Navigate)     → Depends on Foundational
Phase 4: US2 (Actions)      → Depends on Foundational + US1 (Conductor exists)
Phase 5: US3 (Interactive)  → Depends on US2 (ActionRegistry populated)
Phase 6: US4 (Undo/Redo)    → Depends on US2 (StateStack used by actions)
Phase 7: US5 (Zen Mode)     → Depends on US1 (Conductor exists)
Phase 8: US6 (Presenter)    → Depends on US1 (WebviewProvider exists)
Phase 9: Polish             → Depends on all desired stories complete
```

### User Story Dependencies

| Story | Can Start After | Dependencies |
|-------|-----------------|--------------|
| US1 (P1) | Foundational | None - core MVP |
| US2 (P1) | Foundational + US1 partial | Needs Conductor from US1 |
| US3 (P2) | US2 | Needs ActionRegistry populated |
| US4 (P2) | US2 | Needs StateStack active with actions |
| US5 (P3) | US1 | Only needs Conductor |
| US6 (P3) | US1 | Only needs WebviewProvider |

### Parallel Opportunities

**Within Setup (Phase 1)**:
- T003, T004, T005 (config files) can run in parallel
- T007, T008 (extension.ts, launch.json) can run in parallel

**Within Foundational (Phase 2)**:
- T009-T012 (all models) can run in parallel
- T014-T016 (all parsers) can run in parallel
- T020, T022 (action types, errors) can run in parallel
- T023, T024 (stateStack, snapshotFactory) can run in parallel
- T025, T026 (utilities) can run in parallel

**Within User Story 2 (Phase 4)**:
- T040-T043 (all executors except sequence) can run in parallel

**Within User Story 6 (Phase 8)**:
- T078-T080 (presenter view files) can run in parallel

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (Navigate)
4. Complete Phase 4: User Story 2 (Actions)
5. **STOP and VALIDATE**: Can open deck, navigate, execute actions
6. Deploy/demo MVP

### Incremental Delivery

| Increment | Stories | Value Delivered |
|-----------|---------|-----------------|
| MVP | US1 + US2 | Basic executable presentations |
| +Interactivity | +US3 | Click-triggered actions |
| +Recovery | +US4 | Demo failure recovery via undo |
| +Polish | +US5 | Distraction-free mode |
| +Professional | +US6 | Multi-monitor presenter support |

---

## Notes

- All file paths relative to repository root
- [P] = parallelizable (different files, no blocking dependencies)
- [US#] = maps to User Story # for traceability
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Workspace Trust critical for US2 (terminal.run, debug.start blocked in untrusted)
