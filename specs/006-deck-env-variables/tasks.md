# Tasks: Deck Environment Variables

**Input**: Design documents from `/specs/006-deck-env-variables/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: Included — Constitution principle IV (Test-First Development) is non-negotiable. Tests are written FIRST and must FAIL before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: VS Code extension at repository root
- Source: `src/`, Tests: `test/`
- Paths are relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create directory structure and type definitions needed by all user stories

- [x] T001 Create directory structure: `src/env/`, `test/unit/env/`, `test/unit/validation/envRuleValidator/`
- [x] T002 [P] Define `EnvDeclaration`, `EnvFile`, `EnvFileError`, `ResolvedEnv`, `ResolvedVar`, `ResolvedVarStatus` (4 values: `'resolved'`, `'resolved-invalid'`, `'missing-optional'`, `'missing-required'`), `EnvValidationResult`, `EnvValidationContext`, `EnvStatus`, `EnvStatusEntry` types and interfaces per data-model.md entity tables in `src/models/env.ts`
- [x] T003 [P] Export all new types from `src/models/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core modules that multiple user stories depend on — env file loading, declaration parsing, and resolution

**⚠️ CRITICAL**: US1 needs EnvFileLoader and EnvDeclarationParser. US2 needs EnvResolver. US3 needs SecretScrubber. All user stories depend on these foundations.

### Tests for Foundational

> **Write these tests FIRST — ensure they FAIL before implementation**

- [x] T004 [P] Write unit tests for EnvFileLoader covering: valid `.deck.env` file parsing (simple `KEY=VALUE`), quoted values (single and double quotes stripped), values containing `=` (first `=` splits), empty values (`KEY=`), comment lines (skipped), blank lines (skipped), malformed lines (no `=` → `EnvFileError` with line number), invalid key characters → error, duplicate keys (last wins), file not found → `{ exists: false, values: empty, errors: [] }`, BOM stripping, and `generateTemplate()` output format per env-file-format contract in `test/unit/env/envFileLoader.test.ts`
- [x] T005 [P] Write unit tests for EnvDeclarationParser covering: valid `env:` block with all properties, `env` absent → empty array, `env` not array → `DeckParseError`, entry missing `name` → error, invalid `name` pattern → error, duplicate names → error, unknown fields silently ignored, `required`/`secret` coerced to boolean, unrecognized `validate` rule → error, `default` property preserved, per env-resolver contract parse rules in `test/unit/env/envDeclarationParser.test.ts`
- [x] T006 [P] Write unit tests for EnvResolver `resolveDeclarations()` covering: value from `.deck.env` → `status: 'resolved'`, `source: 'env-file'`; default used when not in file → `status: 'resolved'`, `source: 'default'`; required missing → `status: 'missing-required'`; optional missing → `status: 'missing-optional'`, `resolvedValue: ''`; `isComplete` true when all required satisfied; `isComplete` false when any required missing; `secretValues` sorted longest first; `displayValue` for secret is `'•••••'`; `displayValue` for missing is `'<missing>'`; `required: true` with `default` → still `missing-required` when not in file; **resolveDeclarations does NOT run validation** (no `'resolved-invalid'` status, no `validationResult` set — validation is a separate async step) per env-resolver contract algorithm in `test/unit/env/envResolver.test.ts`

### Implementation for Foundational

- [x] T007 Implement `EnvFileLoader` class with `loadEnvFile(deckFilePath)` that derives `.deck.env` path (replace `.deck.md` → `.deck.env`), reads file via `fs.readFile`, parses line-by-line with regex `/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/`, handles quoted value stripping, comment/blank skipping, malformed line collection, BOM stripping, and `generateTemplate(declarations)` that produces `.deck.env.example` content per env-resolver contract and env-file-format contract in `src/env/envFileLoader.ts`
- [x] T008 Implement `EnvDeclarationParser` class with `parseEnvDeclarations(frontmatter)` that validates `env` is array (or absent → `[]`), validates each entry has `name` matching `/^[A-Za-z_][A-Za-z0-9_]*$/`, checks for duplicates, coerces `required`/`secret` to booleans, validates `validate` rule against recognized rules (`directory`, `file`, `command`, `url`, `port`, `regex:<pattern>`), throws `DeckParseError` on structural errors, per env-resolver contract parse rules in `src/env/envDeclarationParser.ts`
- [x] T009 Implement `EnvResolver` class with synchronous `resolveDeclarations(declarations, envFile)` that merges declarations with file values per the algorithm in env-resolver contract (env-file → `status: 'resolved'`, default → `status: 'resolved'` with `source: 'default'`, missing-required/missing-optional), computes `displayValue` (secret → `'•••••'`, missing → `'<missing>'`, else real value), builds `secretValues` sorted by descending length, and computes `isComplete` flag — **no validation rule execution** (that is a separate async step in T023) in `src/env/envResolver.ts`
- [x] T010 [P] Create barrel exports for `EnvFileLoader`, `EnvDeclarationParser`, `EnvResolver` from `src/env/index.ts`

**Checkpoint**: Foundation ready — EnvFileLoader, EnvDeclarationParser, EnvResolver all pass unit tests. User story implementation can begin.

---

## Phase 3: User Story 1 — Environment Variable Declaration and Resolution (Priority: P1) 🎯 MVP

**Goal**: Deck authors declare env variables in frontmatter, supply values via `.deck.env`, and `{{VAR}}` placeholders in action parameters are resolved at deck load time.

**Independent Test**: Create a deck with an `env:` frontmatter block and `{{PROJECT_ROOT}}` placeholders in `terminal.run` actions. Supply values via `.deck.env`. Verify resolved commands contain real values. Verify coexistence with `${home}` platform placeholders.

### Tests for User Story 1

> **Write these tests FIRST — ensure they FAIL before implementation**

- [x] T011 [P] [US1] Write unit tests for EnvResolver `interpolateForDisplay()` and `interpolateForExecution()` covering: non-secret variable replaced in both modes; secret variable kept as `{{VAR}}` in display mode but replaced with real value in execution mode; unknown `{{VAR}}` left as literal in both modes; nested object params recursively walked; array params recursively walked; non-string primitives pass through unchanged; multiple `{{VAR}}` references in same string; coexistence with `${home}` platform placeholders (untouched by env interpolation) per env-resolver contract interpolation algorithm in `test/unit/env/envResolver.test.ts` (append to existing test file)
- [x] T012 [P] [US1] Write integration test for end-to-end env resolution: parse deck with `env:` block and `{{VAR}}` action params, load `.deck.env`, resolve declarations, interpolate for display (secret masked), interpolate for execution (secret resolved), verify both output paths in `test/integration/envResolution.test.ts`

### Implementation for User Story 1

- [x] T013 [US1] Add `interpolateForDisplay(params, resolvedEnv)` and `interpolateForExecution(params, resolvedEnv)` methods to `EnvResolver` using regex `/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g` with recursive object walker (deep clone, visit strings only), display mode preserves `{{VAR}}` for secrets, execution mode substitutes real value, per env-resolver contract interpolation algorithm in `src/env/envResolver.ts`
- [x] T014 [US1] Add `envDeclarations: EnvDeclaration[]` field to `Deck` interface (default `[]`) and `DeckMetadata` type in `src/models/deck.ts`
- [x] T015 [US1] Integrate `EnvDeclarationParser.parseEnvDeclarations()` into `parseDeck()` flow — call after gray-matter extracts frontmatter, store result in `deck.envDeclarations`, surface parse errors via deck-level error reporting (graceful degradation, do not prevent deck loading) in `src/parser/deckParser.ts`
- [x] T016 [US1] Add `resolvedEnv: ResolvedEnv | undefined` state field, `envFileLoader`, `envDeclarationParser`, `envResolver`, and `envRuleValidator` dependencies to Conductor — in `openDeck()`: after parse, call `envFileLoader.loadEnvFile()`, call `envResolver.resolveDeclarations()` (sync merge), then call `await envResolver.validateResolved(resolvedEnv, envRuleValidator, context)` (async validation), store final `resolvedEnv` in conductor state in `src/conductor/conductor.ts`
- [x] T017 [US1] Add `envStatus?: EnvStatus` field to `DeckLoadedMessage` interface and add `EnvStatusChangedMessage` (`type: 'envStatusChanged'`, `envStatus: EnvStatus`) and `EnvSetupRequestMessage` (`type: 'envSetupRequest'`) message types in `src/webview/messages.ts`
- [x] T018 [US1] Include `envStatus` in `deckLoaded` message sent to webview after env resolution completes — build `EnvStatus` from `ResolvedEnv` (total, resolved, missing, invalid, hasSecrets, isComplete, variables array with display values only) in `src/conductor/conductor.ts`
- [x] T019 [US1] Modify `executeAction()` in Conductor to run env interpolation before executor dispatch — call `interpolateForDisplay()` for `actionStatusChanged` message params, call `interpolateForExecution()` for executor params, ensure `{{VAR}}` interpolation runs BEFORE `platformResolver.expandPlaceholders()` per env-resolver contract integration points in `src/conductor/conductor.ts`

**Checkpoint**: Decks with `env:` blocks load, `.deck.env` files are parsed, `{{VAR}}` placeholders resolve in action params (display and execution paths), `envStatus` reaches webview. Run T011-T012 tests — all should pass.

---

## Phase 4: User Story 2 — Preflight Environment Validation (Priority: P1)

**Goal**: Validate that all required environment variables are present and their values pass declared validation rules before presenting. Integrate with existing `executableTalk.validateDeck` command.

**Independent Test**: Open a deck with required env declarations and no `.deck.env` file. Verify warning diagnostics appear. Supply a `.deck.env` with a `validate: directory` pointing to a nonexistent path. Verify validation failure reported.

### Tests for User Story 2

> **Write these tests FIRST — ensure they FAIL before implementation**

- [x] T020 [P] [US2] Write unit tests for EnvRuleValidator covering: `directory` rule — existing directory passes, missing directory fails, non-directory path fails; `file` rule — existing file passes, missing file fails; `command` rule — known command (e.g., `node`) passes, nonexistent command fails; `url` rule — valid `https://` passes, `ftp://` fails, malformed fails; `port` rule — `3000` passes, `0` fails, `99999` fails, non-numeric fails; `regex:<pattern>` — matching value passes, non-matching fails, invalid regex pattern fails; `isValidRule()` recognizes all 6 types and rejects unknown in `test/unit/validation/envRuleValidator.test.ts`
- [x] T021 [P] [US2] Write unit tests for env validation phase in PreflightValidator covering: missing `.deck.env` file emits warning; malformed `.deck.env` lines emit warnings with line numbers; required variable missing emits error; validation rule failure emits warning; `.gitignore` not covering `.deck.env` emits warning; unused variable in `.deck.env` emits info; all required satisfied and valid → no errors per env-validator contract Phase 6 in `test/unit/env/envValidator.test.ts`

### Implementation for User Story 2

- [x] T022 [US2] Implement `EnvRuleValidator` class with `validateValue(value, rule, context)` dispatching to `validateDirectory()`, `validateFile()`, `validateCommand()`, `validateUrl()`, `validatePort()`, `validateRegex()` per env-validator contract rule implementations, and `isValidRule(rule)` checking against known rule strings in `src/validation/envRuleValidator.ts`
- [x] T023 [US2] Implement `EnvResolver.validateResolved(resolved, envRuleValidator, context)` as async post-resolution step — for each variable with `status === 'resolved'` and a `validate` rule, call `await envRuleValidator.validateValue()`, set `validationResult` and update `status` to `'resolved-invalid'` on failure, recompute `isComplete`, return updated `ResolvedEnv` per env-resolver contract `validateResolved` algorithm in `src/env/envResolver.ts`
- [x] T024 [US2] Add `envDeclarations?: EnvDeclaration[]` and `resolvedEnv?: ResolvedEnv` optional fields to `ValidationContext` interface in `src/validation/types.ts`
- [x] T025 [US2] Add Phase 6 `validateEnvironment(context)` to `PreflightValidator.validate()` — check `.deck.env` existence, collect parse errors, check missing-required variables, check resolved-invalid variables, run `checkGitignore()` (primary: `git check-ignore -q`, fallback: string search in `.gitignore`), warn about unused `.deck.env` variables, per env-validator contract Phase 6 algorithm in `src/validation/preflightValidator.ts`
- [x] T026 [US2] Pass `envDeclarations` and `resolvedEnv` from Conductor state into `ValidationContext` when running `executableTalk.validateDeck` command in `src/conductor/conductor.ts`
- [x] T027 [US2] Extend `ActionDiagnosticProvider` with new diagnostic codes: `env-undeclared-ref` (warning — `{{VAR}}` used but not declared), `env-duplicate-name` (error), `env-invalid-rule` (error), `env-invalid-name` (error) per env-validator contract diagnostic table in `src/providers/actionDiagnosticProvider.ts`

**Checkpoint**: Preflight validation reports missing required env vars, validation failures, gitignore warnings, and unused variables. Diagnostics appear in Problems panel. Run T020-T021 tests — all should pass.

---

## Phase 5: User Story 3 — Secret Masking for Live Presentations (Priority: P1)

**Goal**: Secret variables' resolved values never appear in the webview. Display path preserves `{{VAR}}` placeholders; execution path uses real values. Error messages and streaming output are scrubbed.

**Independent Test**: Create a deck with `secret: true` env var used in `terminal.run`. Verify the slide shows `{{TOKEN}}` not the real value. Trigger an error and verify the error message is scrubbed.

### Tests for User Story 3

> **Write these tests FIRST — ensure they FAIL before implementation**

- [x] T028 [P] [US3] Write unit tests for SecretScrubber covering: single secret value replaced with mask (`•••••`); multiple secrets all replaced; longer secrets replaced first (prevent partial replacement artifacts); secret that is a substring of another secret handled correctly; empty secret values skipped (not scrubbed); custom mask string; text with no secrets returns unchanged; case-sensitive matching per env-resolver contract scrubbing scope in `test/unit/env/secretScrubber.test.ts`
- [x] T029 [P] [US3] Write unit tests verifying short secret warning: secret value fewer than 4 characters triggers preflight warning "Variable X is very short — masking may over-scrub terminal output" per US3 acceptance scenario 5 in `test/unit/env/envValidator.test.ts` (append to existing test file)

### Implementation for User Story 3

- [x] T030 [US3] Implement `SecretScrubber` class with `scrub(text, resolvedEnv, mask?)` that iterates `resolvedEnv.secretValues` (pre-sorted longest first), replaces all occurrences of each secret value in `text` with the mask string (default `'•••••'`), skips empty values, returns scrubbed text per env-resolver contract SecretScrubber interface in `src/env/secretScrubber.ts`
- [x] T031 [US3] Wire `SecretScrubber` into Conductor error handling — in `executeAction()` catch block, scrub error message via `secretScrubber.scrub()` before including in `actionStatusChanged` message sent to webview in `src/conductor/conductor.ts`
- [x] T032 [US3] Add short secret preflight warning — during `resolveDeclarations()`, if a secret variable's `resolvedValue` has length < 4, add an informational note to `EnvValidationResult` — surface in preflight Phase 6 as warning in `src/env/envResolver.ts` and `src/validation/preflightValidator.ts`
- [x] T033 [US3] Export `SecretScrubber` from `src/env/index.ts`

**Checkpoint**: Secret values never appear in webview messages. Display path shows `{{VAR}}` for secrets. Error messages are scrubbed. Short secret warning fires. Run T028-T029 tests — all should pass.

---

## Phase 6: User Story 4 — Guided Environment Setup Flow (Priority: P2)

**Goal**: When a deck requires env variables and no `.deck.env` exists, offer a toast with "Set Up Now" that creates the file from a template and opens it in the editor. Live reload on save.

**Independent Test**: Open a deck with `env:` declarations but no `.deck.env` file. Click "Set Up Now" on the toast. Verify `.deck.env.example` is generated, `.deck.env` is created and opened. Edit and save — verify validation updates.

### Tests for User Story 4

> **Write these tests FIRST — ensure they FAIL before implementation**

- [x] T034 [P] [US4] Write integration test for guided setup flow: open deck with env declarations but no `.deck.env`, verify toast notification fires, simulate "Set Up Now" click, verify `.deck.env.example` is generated with correct format per env-file-format contract, verify `.deck.env` is created as a copy, verify `.deck.env` is opened in editor in `test/integration/guidedSetup.test.ts`
- [x] T035 [P] [US4] Write unit test for `EnvFileLoader.generateTemplate()` output format: header comment with deck filename, each declaration as `# description` + `# Required: yes|no | Secret: yes|no | Validate: rule|none` + `# Default: value` (if set) + `NAME=` per env-file-format contract `.deck.env.example` generation rules in `test/unit/env/envFileLoader.test.ts` (append to existing test file)

### Implementation for User Story 4

- [x] T036 [US4] Implement guided setup flow in Conductor — on `openDeck()`, if `envDeclarations.length > 0` and `.deck.env` does not exist, show toast via `vscode.window.showInformationMessage("This deck requires environment setup", "Set Up Now")` with quick action per env-validator contract guided setup flow in `src/conductor/conductor.ts`
- [x] T037 [US4] Implement "Set Up Now" handler in Conductor — on toast click: check/generate `.deck.env.example` via `envFileLoader.generateTemplate()`, write `.deck.env.example` if not exists, copy to `.deck.env` if not exists, open `.deck.env` via `vscode.window.showTextDocument()`, show "Fill in the values for your environment variables" info message in `src/conductor/conductor.ts`
- [x] T038 [US4] Handle `EnvSetupRequestMessage` from webview — when webview sends `envSetupRequest`, trigger the same guided setup logic as the toast quick action in `src/webview/messageHandler.ts` and `src/conductor/conductor.ts`
- [x] T039 [US4] Implement `EnvFileWatcher` — in `openDeck()`, create `vscode.workspace.createFileSystemWatcher` with `RelativePattern` scoped to deck directory matching `*.deck.env`, 500ms debounce via `setTimeout`/`clearTimeout`, on change: re-parse `.deck.env`, re-resolve declarations, send `envStatusChanged` message to webview with updated `EnvStatus`, push watcher into conductor disposables per env-resolver contract file watcher interface in `src/conductor/conductor.ts`
- [x] T040 [US4] Register watcher disposal in Conductor — dispose `EnvFileWatcher` when deck is closed or a different deck is opened, ensuring no stale watchers in `src/conductor/conductor.ts`

**Checkpoint**: Guided setup works end-to-end. Toast appears on missing `.deck.env`. "Set Up Now" creates template and opens file. FileSystemWatcher re-validates on save. Run T034-T035 tests — all should pass.

---

## Phase 7: User Story 5 — Authoring Assistance for Env Declarations (Priority: P3)

**Goal**: Autocomplete suggestions and hover documentation when authoring `env:` blocks in frontmatter, and when typing `{{VAR}}` references in action parameters.

**Independent Test**: Type `env:` in `.deck.md` frontmatter. Trigger autocomplete — see `name`, `description`, `required`, `secret`, `validate`, `default`. Hover over `validate` — see documentation with rule list.

### Tests for User Story 5

> **Write these tests FIRST — ensure they FAIL before implementation**

- [x] T041 [P] [US5] Write unit tests for env completions covering: inside `env:` block suggests declaration properties (`name`, `description`, `required`, `secret`, `validate`, `default`); `validate` value suggests rule list (`directory`, `file`, `command`, `url`, `port`, `regex:`); `{{` in action parameter suggests declared variable names; outside `env:` block does not suggest env properties per existing `provideScenesCompletions` pattern in `test/unit/providers/envProviders.test.ts`
- [x] T042 [P] [US5] Write unit tests for env hover covering: hover over `name` shows variable name description; hover over `secret` shows masking explanation; hover over `validate` shows rule type documentation; hover over `required` shows requirement explanation per existing `provideScenesHover` pattern in `test/unit/providers/envProviders.test.ts` (append to existing test file)

### Implementation for User Story 5

- [x] T043 [US5] Add env declaration schema metadata (properties, types, descriptions, valid values) to `actionSchema.ts` — static `ENV_DECLARATION_SCHEMA` with entries for `name`, `description`, `required`, `secret`, `validate`, `default`, and `VALIDATION_RULES` array with descriptions for each rule per data-model.md EnvDeclarationSchema in `src/providers/actionSchema.ts`
- [x] T044 [US5] Add `provideEnvCompletions()` to `ActionCompletionProvider` — detect cursor inside `env:` block (YAML context), suggest declaration properties from schema, suggest validation rule values for `validate:` property, suggest declared variable names when user types `{{` inside action params, following existing `provideScenesCompletions()` pattern in `src/providers/actionCompletionProvider.ts`
- [x] T045 [US5] Add `provideEnvHover()` to `ActionHoverProvider` — detect cursor on env declaration property, return hover markdown with property description and valid values from schema, following existing `provideScenesHover()` pattern in `src/providers/actionHoverProvider.ts`
- [x] T046 [US5] Update `actionSchema.ts` to mention `{{VAR}}` syntax in `terminal.run` and other action type documentation — add note that string params support `{{ENV_VAR}}` interpolation in `src/providers/actionSchema.ts`

**Checkpoint**: Authoring assistance works in `.deck.md` files. Env property completions and hover docs appear. Variable name suggestions work in `{{}}` contexts. Run T041-T042 tests — all should pass.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Webview UI, extension registration, backward compatibility verification

- [ ] T047 [P] Render env status badge in webview — display `Env ✓` (green) when `isComplete`, `Env ⚠` (yellow) with missing/invalid count when not complete, clicking badge sends `envSetupRequest` message to host, handle `envStatusChanged` message to update badge dynamically in `src/webview/assets/presentation.js`
- [ ] T048 [P] Add CSS styles for env status badge — green/yellow/red variants, positioning in presentation toolbar area, hover tooltip showing variable summary in `src/webview/assets/presentation.css`
- [ ] T049 Register `.deck.env` FileSystemWatcher creation in `extension.ts` `activate()` — ensure watcher lifecycle is tied to extension activation/deactivation in `src/extension.ts`
- [ ] T050 [P] Verify backward compatibility — ensure existing decks without `env:` blocks load identically with no behavioral changes, `envDeclarations` defaults to empty array, no env-related messages sent to webview when no declarations exist (SC-006)
- [ ] T051 Run quickstart.md complete example end-to-end — create test deck and `.deck.env` per quickstart guide, verify all 5 steps work (open project, check node, install deps, create branch, start server) with env variable resolution
- [ ] T052 [P] Update `package.json` description/keywords to mention environment variables and `.deck.env` support

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2) — core env resolution
- **US2 (Phase 4)**: Depends on Foundational (Phase 2) + US1 for `resolvedEnv` in conductor state
- **US3 (Phase 5)**: Depends on Foundational (Phase 2) + US1 for display/execution path separation
- **US4 (Phase 6)**: Depends on US1 (env loading in conductor) + US2 (validation for re-validation on save)
- **US5 (Phase 7)**: Depends on Foundational (Phase 2) only — authoring is independent of runtime
- **Polish (Phase 8)**: Depends on US1-US4 being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational — no dependencies on other stories
- **US2 (P1)**: Can start after Foundational, benefits from US1 `resolvedEnv` in conductor
- **US3 (P1)**: Can start after Foundational, needs US1 display/execution path
- **US4 (P2)**: Needs US1 (env loaded in conductor) + US2 (validation for re-validate)
- **US5 (P3)**: Can start after Foundational — fully independent of US1-US4

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models/types before logic
- Logic before integration
- Integration before UI
- Story complete before moving to next priority

### Parallel Opportunities

- Setup tasks T001-T003 can all run in parallel
- Foundational tests T004-T006 can all run in parallel
- Foundational implementations T007-T009 can run in parallel (different files)
- US1 tests T011-T012 can run in parallel
- US2 tests T020-T021 can run in parallel
- US3 tests T028-T029 can run in parallel
- US4 tests T034-T035 can run in parallel
- US5 tests T041-T042 can run in parallel
- US5 (Phase 7) can be developed in parallel with US4 (Phase 6) since they don't share files

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task T011: "Unit tests for interpolateForDisplay/interpolateForExecution in test/unit/env/envResolver.test.ts"
Task T012: "Integration test for end-to-end env resolution in test/integration/envResolution.test.ts"

# After tests written and failing, implementation can proceed sequentially:
Task T013: "Add interpolation methods to EnvResolver"
Task T014: "Add envDeclarations field to Deck interface"
Task T015: "Integrate EnvDeclarationParser into deckParser.ts"
Task T016: "Wire env loading into Conductor.openDeck()"
Task T017: "Add env message types"
Task T018: "Send envStatus in deckLoaded message"
Task T019: "Wire env interpolation into executeAction()"
```

---

## Parallel Example: User Story 2

```bash
# Launch all tests for User Story 2 together:
Task T020: "Unit tests for EnvRuleValidator in test/unit/validation/envRuleValidator.test.ts"
Task T021: "Unit tests for env validation phase in test/unit/env/envValidator.test.ts"

# Implementation is sequential (each builds on previous):
Task T022: "Implement EnvRuleValidator"
Task T023: "Wire EnvRuleValidator into EnvResolver"
Task T024: "Add env fields to ValidationContext"
Task T025: "Add Phase 6 to PreflightValidator"
Task T026: "Pass env context to validation command"
Task T027: "Extend ActionDiagnosticProvider with env diagnostics"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test env resolution end-to-end — deck loads, `.deck.env` parsed, `{{VAR}}` replaced in actions
5. This alone delivers the core value proposition: portable decks with env vars

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 → Test independently → MVP! (env vars work in actions)
3. Add US2 → Test independently → Validation catches config issues before presenting
4. Add US3 → Test independently → Secrets masked for live demos
5. Add US4 → Test independently → Guided setup for new users
6. Add US5 → Test independently → Authoring DX improvements
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (core resolution) → US3 (secret masking)
   - Developer B: US2 (validation) → US4 (guided setup)
   - Developer C: US5 (authoring assistance)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Secret values MUST never cross the postMessage boundary (FR-010) — this is the critical security invariant enforced by the display/execution interpolation split
