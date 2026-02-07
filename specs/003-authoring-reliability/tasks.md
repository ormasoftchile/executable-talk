# Tasks: Authoring & Reliability — Critical Adoption Blockers

**Input**: Design documents from `/specs/003-authoring-reliability/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Included — Constitution principle IV (Test-First Development) is non-negotiable. Tests are written FIRST and must FAIL before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: VS Code extension at repository root
- Source: `src/`, Tests: `test/`
- Paths are relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and create directory structure for new modules

- [X] T001 Add `js-yaml` v4 as production dependency and `@types/js-yaml` as dev dependency in `package.json`
- [X] T002 [P] Create directory structure: `src/validation/`, `src/providers/`, `test/unit/validation/`, `test/unit/providers/`, `test/integration/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types and metadata used by multiple user stories

**⚠️ CRITICAL**: US1 needs ActionSchema for type/param validation. US4 builds entirely on ActionSchema. US2 can leverage it for enhanced checks.

- [X] T003 Define `ActionSchema` and `ActionParameterSchema` interfaces and build static metadata map for all 6 action types (`file.open`, `editor.highlight`, `terminal.run`, `debug.start`, `sequence`, `vscode.command`) with required/optional params, types, descriptions, and `completionKind` hints per data-model.md entity schema in `src/providers/actionSchema.ts`
- [X] T004 [P] Add optional `source: 'inline' | 'block'` field to `InteractiveElement` interface in `src/models/slide.ts`, defaulting to `'inline'` for backward compatibility

**Checkpoint**: Shared infrastructure ready — user story implementation can now begin

---

## Phase 3: User Story 1 — Readable Action Syntax (Priority: P1) 🎯 MVP

**Goal**: Replace URL-encoded inline action links with human-readable YAML fenced code blocks (language: `action`). Both syntaxes coexist per FR-004.

**Independent Test**: A user can author a `.deck.md` file using fenced action blocks, parse the deck, and have every action produce the correct Action model — without ever writing a URL-encoded action link.

### Tests for User Story 1

> **Write these tests FIRST — ensure they FAIL before implementation**

- [X] T005 [P] [US1] Write unit tests for action block parser covering: valid single action YAML (`file.open` with `path`), sequence with `steps` array, action with `label`, invalid YAML syntax (error includes line/column from js-yaml `.mark`), missing `type` field, unknown action type, missing required params, YAML non-object (scalar/array), mixed blocks and content on same slide, backward compat (inline links unaffected by block parser), and `source: 'block'` set on resulting elements in `test/unit/parser/actionBlockParser.test.ts`

### Implementation for User Story 1

- [X] T006 [US1] Implement `parseActionBlocks()` function with `ACTION_BLOCK_PATTERN` regex (`/^```action\s*\n([\s\S]*?)^```\s*$/gm`) pre-pass on raw content, `js-yaml.load()` YAML parsing, type validation against ActionSchema, required param checking per action type, `ActionBlockParseResult` and `ActionBlockParseError` interfaces per action-block-syntax contract, and set `source: 'block'` on all created `InteractiveElement` objects in `src/parser/actionBlockParser.ts`
- [X] T007 [US1] Integrate `parseActionBlocks()` as step 2 in `parseSlideContent()` pipeline — call after frontmatter extraction but before `md.render()`, pass `cleanedContent` (blocks stripped) to renderer, merge block `elements` into `slide.interactiveElements` alongside inline link elements from step 5 in `src/parser/slideParser.ts`
- [X] T008 [US1] Surface action block parse errors via deck-level error reporting — aggregate `ActionBlockParseError[]` from all slides, include slide number and error details, ensure parse errors do NOT prevent deck from loading (graceful degradation) in `src/parser/deckParser.ts`
- [X] T009 [US1] Export `parseActionBlocks`, `ActionBlockParseResult`, `ActionBlockParseError` types from `src/parser/index.ts`

**Checkpoint**: Fenced action blocks parse correctly and produce the same Action model as inline links. Both syntaxes coexist. Run T005 tests — all should pass.

---

## Phase 4: User Story 2 — Preflight Deck Validation (Priority: P2)

**Goal**: Provide an `Executable Talk: Validate Deck` command (ID: `executableTalk.validateDeck`) that scans the entire deck and reports all detectable issues before presentation per preflight-validation contract.

**Independent Test**: A user runs the validation command on a deck with intentional errors (missing file, out-of-range lines, nonexistent debug config, unavailable command) and receives a structured report with severity, slide number, and description for every issue.

### Tests for User Story 2

> **Write these tests FIRST — ensure they FAIL before implementation**

- [X] T010 [P] [US2] Write unit tests for FilePathValidator covering: existing file passes, missing file returns `error` severity issue, workspace-relative path resolution via `workspaceRoot`, validates paths from `file.open`, `editor.highlight`, `render:file`, and `render:diff` actions/directives, parallel execution of multiple file checks in `test/unit/validation/filePathValidator.test.ts`
- [X] T011 [P] [US2] Write unit tests for LineRangeValidator covering: valid range passes, range exceeding file length returns `error` with actual line count in message (format: "Line range {start}-{end} exceeds file length ({actualLines} lines)"), only runs when file exists, applies to `editor.highlight` and `render:file` with `lines` param in `test/unit/validation/lineRangeValidator.test.ts`
- [X] T012 [P] [US2] Write unit tests for DebugConfigValidator covering: existing config name passes, missing config returns `error` listing available config names, reads from `vscode.workspace.getConfiguration('launch')`, handles multi-root workspace config merging, handles empty/missing launch.json gracefully in `test/unit/validation/debugConfigValidator.test.ts`
- [X] T013 [P] [US2] Write unit tests for CommandAvailabilityValidator covering: found command passes, missing command returns `warning` severity (not error — may be shell builtin), 2-second timeout per check produces `info` severity issue ("Command check timed out"), extracts binary name (first whitespace-delimited token) from command string, platform-aware (`which` on Unix / `where.exe` on Windows) in `test/unit/validation/commandValidator.test.ts`
- [X] T014 [P] [US2] Write unit tests for PreflightValidator orchestrator covering: all-pass produces success summary with check counts (FR-012), mixed results report includes severity/slide/source/description (FR-011), empty deck (no actions) succeeds with "no actions found" message, cancellation via `CancellationToken` aborts in-progress checks, trust-requiring actions emit `warning` (not error) in untrusted workspace (FR-013), `passed` is `false` only when errors exist (warnings alone = pass) in `test/unit/validation/preflightValidator.test.ts`

### Implementation for User Story 2

- [X] T015 [US2] Define `ValidationReport`, `ValidationIssue`, `ValidationSeverity`, `ValidationCheck`, and `ValidationContext` interfaces matching preflight-validation contract signatures in `src/validation/types.ts`
- [X] T016 [P] [US2] Implement `FilePathValidator` implementing `ValidationCheck` interface — resolves paths relative to `context.workspaceRoot` using `vscode.workspace.fs.stat()`, applies to `file.open`, `editor.highlight`, `render:file`, `render:diff` actions, parallel execution for all paths in `src/validation/filePathValidator.ts`
- [X] T017 [P] [US2] Implement `LineRangeValidator` implementing `ValidationCheck` — parses `lines` param (e.g., "10-20"), reads file via `vscode.workspace.fs.readFile()` to count lines, validates range, only runs after file existence confirmed, applies to `editor.highlight` and `render:file` with `lines` in `src/validation/lineRangeValidator.ts`
- [X] T018 [P] [US2] Implement `DebugConfigValidator` implementing `ValidationCheck` — reads configs via `vscode.workspace.getConfiguration('launch').get('configurations')`, matches `params.configName` against config `name` fields, lists available names in error message for discoverability in `src/validation/debugConfigValidator.ts`
- [X] T019 [P] [US2] Implement `CommandAvailabilityValidator` implementing `ValidationCheck` — extracts binary (first token) from command, uses `child_process.execFile('which'/'where.exe')` with 2-second timeout, severity `warning` (not error), platform-aware, applies to `terminal.run` actions and `render:command` directives in `src/validation/commandValidator.ts`
- [X] T020 [US2] Implement `PreflightValidator` orchestrator — collects checks from all slides, executes with `vscode.window.withProgress({ location: ProgressLocation.Notification, cancellable: true })`, phased parallel execution (file stats 40%, line ranges 25%, commands 25%, config+trust 10%), includes `TrustCheck` logic for `terminal.run`/`debug.start` in untrusted workspaces, builds `ValidationReport` in `src/validation/preflightValidator.ts`
- [X] T021 [US2] Register `executableTalk.validateDeck` command in `src/extension.ts` — add `commands` contribution to `package.json` with title "Executable Talk: Validate Deck", handler delegates to `Conductor.validateDeck()`
- [X] T022 [US2] Implement `Conductor.validateDeck()` method — calls `PreflightValidator`, maps `ValidationIssue[]` to `DiagnosticCollection('Executable Talk: Validation')` for inline squiggles on `.deck.md` file, writes detailed timestamped log to `OutputChannel('Executable Talk Validation')`, shows summary notification toast with "Show Problems" action in `src/conductor/conductor.ts`
- [X] T023 [US2] Export all validation types and modules from `src/validation/index.ts`
- [X] T024 [US2] Write integration test for validate deck command end-to-end — create temp `.deck.md` with: missing file ref, out-of-range highlight lines, nonexistent debug config, unavailable command; run `executableTalk.validateDeck`; verify diagnostics set on file URI and output channel contains report in `test/integration/preflightCommand.test.ts`

**Checkpoint**: Validate Deck command works end-to-end. Run T010–T014 unit tests and T024 integration test — all should pass.

---

## Phase 5: User Story 3 — Visible Error Feedback During Presentation (Priority: P3)

**Goal**: When an action fails during presentation, display a non-blocking toast notification in the webview with action type, target, reason, and sequence step detail — without modal dialogs, per error-feedback contract.

**Independent Test**: A user triggers an action that fails (e.g., opening a deleted file) during presentation and sees a toast notification in the bottom-right corner showing what failed, why, and (for sequences) which step failed. The toast auto-dismisses or can be manually dismissed.

### Tests for User Story 3

> **Write these tests FIRST — ensure they FAIL before implementation**

- [X] T025 [P] [US3] Write integration test for error notification delivery covering: simple `file.open` failure produces toast with actionType/actionTarget/error fields, `sequence` failure shows `SequenceErrorDetail` with step breakdown (✅/❌/⏭ statuses), multiple consecutive failures stack (max 5 visible), dismiss button clears individual toast, auto-dismiss fires after 8s for simple failures, sequence failures persist until manual dismiss in `test/integration/actionBlockExecution.test.ts`

### Implementation for User Story 3

- [X] T026 [US3] Extend `ActionStatusChangedMessage` payload interface with optional `actionType: ActionType`, `actionTarget: string`, and `sequenceDetail: SequenceErrorDetail` fields per error-feedback contract in `src/webview/messages.ts`
- [X] T027 [P] [US3] Add `SequenceErrorDetail` interface (`totalSteps`, `failedStepIndex`, `failedStepType`, `stepResults[]`) and `StepResult` interface (`type`, `target?`, `status: 'success'|'failed'|'skipped'`, `error?`) to `src/actions/errors.ts`
- [X] T028 [US3] Enhance `executeWithPipeline()` to populate `actionType` (from `action.type`) and `actionTarget` (from primary param: `path` for file.open/editor.highlight, `command` for terminal.run, `configName` for debug.start, `id` for vscode.command, `undefined` for sequence — detail provided via sequenceDetail) on `ExecutionResult` when `success: false` in `src/actions/executionPipeline.ts`
- [X] T029 [US3] Update sequence executor to track per-step `StepResult[]` — record `'success'`/`'failed'`/`'skipped'` for each step, build `SequenceErrorDetail` with `totalSteps`, `failedStepIndex`, `failedStepType`, and full `stepResults` array on sequence failure in `src/actions/sequenceExecutor.ts`
- [X] T030 [US3] Update conductor's action failure handler to extract `actionType`, `actionTarget`, and `sequenceDetail` from `ExecutionResult` and forward them in `actionStatusChanged` postMessage payload to webview in `src/conductor/conductor.ts`
- [X] T031 [US3] Implement toast notification system in webview — toast container (`.toast-container`), toast DOM creation from structured `ActionStatusChangedMessage` payload (icon per action type: 📄 file, 🔍 highlight, ▶ terminal, 🐛 debug, 🔗 sequence), dismiss button (`[✕]`), auto-dismiss timer (8s simple, persist sequences/timeouts, pause on hover), max-5 stack with `column-reverse` ordering, overflow eviction of oldest auto-dismissible toast, entry animation (300ms `translateX(100%)→0`), exit animation (200ms `opacity 1→0, translateX(0→50px)`) in `src/webview/assets/presentation.js`
- [X] T032 [US3] Add toast notification CSS per error-feedback contract — `.toast-container` fixed positioning (`bottom: 5rem`, `right: 1rem`, `z-index: 80`, `column-reverse`), `.toast` base + `.toast--error` (red accent) + `.toast--warning` (yellow accent), `.toast__header` / `.toast__target` / `.toast__message` / `.toast__steps`, step classes `.toast__step--success` / `.toast__step--failed` / `.toast__step--skipped`, `.toast--entering` / `.toast--exiting` animation states, responsive width `min(350px, 40vw)` in `src/webview/assets/presentation.css`

**Checkpoint**: Action failures produce visible, informative toast notifications in the presentation UI. Run T025 integration test — should pass.

---

## Phase 6: User Story 4 — Authoring Assistance for Action Blocks (Priority: P4)

**Goal**: Provide autocomplete suggestions, hover documentation, and real-time diagnostic validation when writing action blocks in `.deck.md` files, reducing authoring errors to near zero.

**Independent Test**: A user opens a `.deck.md` file, begins typing inside a fenced `action` block, receives autocomplete for action types and parameters, sees hover documentation, and gets diagnostic squiggles for invalid types or missing required params.

**Dependency**: Requires US1 (fenced action block syntax must exist for providers to target)

### Tests for User Story 4

> **Write these tests FIRST — ensure they FAIL before implementation**

- [X] T033 [P] [US4] Write unit tests for ActionCompletionProvider covering: action type suggestions when cursor is after `type:` (all 6 types offered), parameter suggestions scoped to selected type (e.g., `file.open` → `path`, `line`, `column`, `range`, `viewColumn`, `preview`), file path completion for `path:` values using workspace files, `SnippetString` insertion for `steps:` array, trigger characters `:` and `/` in `test/unit/providers/actionCompletionProvider.test.ts`
- [X] T034 [P] [US4] Write unit tests for ActionDiagnosticProvider covering: unknown action type → `Error` diagnostic, missing required param → `Error` diagnostic, unknown param key → `Warning` diagnostic, invalid YAML syntax → `Error` diagnostic with line info, valid action block → no diagnostics, diagnostics cleared when file closed in `test/unit/providers/actionDiagnosticProvider.test.ts`
- [X] T035 [P] [US4] Write unit tests for ActionHoverProvider covering: hover on action type keyword (e.g., `file.open`) shows description and parameter table from ActionSchema, hover on parameter name shows type and description, hover outside action block returns `null`, hover on `sequence` shows `steps` param documentation, only activates inside `action` fences in `test/unit/providers/actionHoverProvider.test.ts`

### Implementation for User Story 4

- [X] T036 [US4] Implement `findActionBlocks(document: TextDocument)` utility that scans document lines for `` ```action `` opening fences and closing `` ``` `` fences, returning array of `{ startLine, endLine, content }` block boundaries for use by all three providers in `src/providers/actionSchema.ts`
- [X] T037 [P] [US4] Implement `ActionCompletionProvider` implementing `CompletionItemProvider` with trigger characters `[':','/']`, context-aware logic: if no `type:` yet → suggest all 6 action types; if `type:` set → suggest valid params for that type from ActionSchema; if cursor on `path:` value → suggest workspace files via `workspace.findFiles()`; use `SnippetString` for `steps:` array scaffolding; gated to positions inside action blocks via `findActionBlocks()` in `src/providers/actionCompletionProvider.ts`
- [X] T038 [P] [US4] Implement `ActionHoverProvider` implementing `HoverProvider` — detect word at position via `getWordRangeAtPosition(position, /[\w.]+/)`, look up in static `Map<string, HoverDocumentation>` built from ActionSchema at activation, return `MarkdownString` with description + parameter table (name, type, required, description), gated to action blocks via `findActionBlocks()` in `src/providers/actionHoverProvider.ts`
- [X] T039 [US4] Implement `ActionDiagnosticProvider` with `DiagnosticCollection('Executable Talk: Authoring')` — trigger on `onDidChangeTextDocument` (300ms debounce), `onDidSaveTextDocument` (immediate), `onDidOpenTextDocument` (immediate), `onDidCloseTextDocument` (clear), validation checks: invalid YAML (`Error`), unknown action type (`Error`), missing required param (`Error`), unknown param key (`Warning`), file path not found (`Warning`, async via `workspace.fs.stat()`), invalid enum value (`Warning`); map diagnostic positions using `contentStartLine + yamlErrorLine` in `src/providers/actionDiagnosticProvider.ts`
- [X] T040 [US4] Register `CompletionItemProvider` (trigger chars `[':','/']`), `HoverProvider`, and subscribe `ActionDiagnosticProvider` event listeners, all for `{ language: 'deck-markdown' }` document selector, in `src/extension.ts`
- [X] T041 [US4] Export all provider modules from `src/providers/index.ts`

**Checkpoint**: Authoring `.deck.md` files with action blocks has full IDE assistance. Run T033–T035 unit tests — all should pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, validation, and final cleanup

- [X] T042 [P] Update `README.md` with documentation for fenced action block syntax (with before/after examples), validate deck command usage, error notification behavior, and authoring assistance features
- [X] T043 [P] Update `CHANGELOG.md` with version entry for `003-authoring-reliability` feature listing all 4 capabilities
- [X] T044 Run `specs/003-authoring-reliability/quickstart.md` scenarios as end-to-end smoke test — verify action blocks parse, validation catches errors, toasts appear on failure, autocomplete/hover/diagnostics work
- [X] T045 Final lint pass (`npm run lint`), compilation check (`npm run compile`), and code cleanup

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2) — ActionSchema needed for type/param validation
- **US2 (Phase 4)**: Depends on Foundational (Phase 2) — can start in parallel with US1
- **US3 (Phase 5)**: Depends on Foundational (Phase 2) — can start in parallel with US1 and US2
- **US4 (Phase 6)**: Depends on Foundational (Phase 2) AND US1 (Phase 3) — needs action block syntax to exist
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

```
Phase 1: Setup
    │
    ▼
Phase 2: Foundational
    │
    ├──────────────┬──────────────┐
    ▼              ▼              ▼
Phase 3: US1   Phase 4: US2   Phase 5: US3
(P1) 🎯 MVP   (P2)           (P3)
    │
    ▼
Phase 6: US4
(P4)
    │
    ▼
Phase 7: Polish
```

- **US1 → US4**: US4 provides autocomplete/hover/diagnostics for action blocks defined by US1
- **US2 ∥ US1**: Independent — US2 validates both inline and block actions (inline links already exist)
- **US3 ∥ US1**: Independent — US3 handles runtime failures regardless of action source syntax
- **US2 ∥ US3**: Independent — validation is pre-presentation, error feedback is during presentation

### Within Each User Story

1. Tests MUST be written and FAIL before implementation (Constitution IV)
2. Types/interfaces before implementations
3. Core modules before integration (pipeline/conductor wiring)
4. Unit tests before integration tests
5. Story complete before moving to next priority

### Modified Files: Conflict Awareness

These existing files are modified by multiple user stories:

| File | Modified By | Coordination |
|------|-------------|--------------|
| `src/extension.ts` | US2 (T021), US4 (T040) | Additive — separate command + provider registrations |
| `src/conductor/conductor.ts` | US2 (T022), US3 (T030) | Additive — `validateDeck()` method vs error forwarding in action handler |
| `src/parser/index.ts` | US1 (T009) | Single story |
| `src/webview/messages.ts` | US3 (T026) | Single story |
| `src/actions/errors.ts` | US3 (T027) | Single story |

All cross-story modifications are additive (no conflicting edits to the same lines).

### Parallel Opportunities

**Within Phase 2** (Foundational):
```
T003 (actionSchema.ts) ─┐
                         ├── both in parallel
T004 (slide.ts)         ─┘
```

**Within Phase 4** (US2 — highest parallelism):
```
T010 (filePathValidator.test.ts)  ─┐
T011 (lineRangeValidator.test.ts) ─┤
T012 (debugConfigValidator.test)  ─┤── all 5 tests in parallel
T013 (commandValidator.test.ts)   ─┤
T014 (preflightValidator.test.ts) ─┘

T016 (filePathValidator.ts)       ─┐
T017 (lineRangeValidator.ts)      ─┤── all 4 validators in parallel
T018 (debugConfigValidator.ts)    ─┤
T019 (commandValidator.ts)        ─┘
```

**Within Phase 6** (US4):
```
T033 (completionProvider.test.ts)  ─┐
T034 (diagnosticProvider.test.ts)  ─┤── all 3 tests in parallel
T035 (hoverProvider.test.ts)       ─┘

T037 (completionProvider.ts)       ─┐
T038 (hoverProvider.ts)            ─┘── 2 providers in parallel
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (2 tasks)
2. Complete Phase 2: Foundational (2 tasks)
3. Complete Phase 3: User Story 1 (5 tasks)
4. **STOP and VALIDATE**: Parse a deck with fenced action blocks — verify actions execute correctly
5. Ship v0.2.0-alpha if ready

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add User Story 1 → Test independently → **MVP** (readable syntax)
3. Add User Story 2 → Test independently → **Safety net** (preflight validation)
4. Add User Story 3 → Test independently → **Resilience** (error feedback)
5. Add User Story 4 → Test independently → **Productivity** (authoring assistance)
6. Each story adds value without breaking previous stories (SC-006 guarantees backward compat)

### Parallel Team Strategy

With multiple developers after Foundational completes:

- **Developer A**: US1 → then US4 (sequential dependency)
- **Developer B**: US2 (fully independent)
- **Developer C**: US3 (fully independent)

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Tests are written FIRST and must FAIL before implementation (Constitution IV)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Both inline action links and fenced blocks coexist — backward compatibility is guaranteed (FR-004, SC-006)
- `js-yaml` v4 is used (not gray-matter's bundled v3) per research decision R1
- Providers register for `{ language: 'deck-markdown' }` — no interference with regular Markdown
- Two distinct `DiagnosticCollection` instances: `'Executable Talk: Validation'` (preflight, US2) and `'Executable Talk: Authoring'` (real-time, US4) — no naming collision
- `findActionBlocks(document)` in `src/providers/` operates on `TextDocument` objects (for providers); `ACTION_BLOCK_PATTERN` in `src/parser/` operates on raw strings (for parsing) — similar purpose, different interfaces by design
