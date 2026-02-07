# Feature Specification: Authoring & Reliability — Critical Adoption Blockers

**Feature Branch**: `003-authoring-reliability`  
**Created**: 2026-02-07  
**Status**: Draft  
**Input**: User description: "Address critical adoption blockers: readable action block syntax replacing URL-encoded links, authoring tooling with autocomplete and validation, visible error feedback for failed actions, and preflight deck validation before presenting"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Readable Action Syntax (Priority: P1)

As a presenter authoring a `.deck.md` file, I want to define actions using a human-readable YAML-based fenced code block instead of URL-encoded inline links, so that my action definitions are easy to write, review in pull requests, and maintain over time.

**Why this priority**: The current URL-encoded syntax is the single largest source of authoring friction. Every user who writes a deck encounters this pain immediately. Fixing it unblocks all other authoring improvements.

**Independent Test**: A user can author a new `.deck.md` file using fenced action blocks, present it, and have every action execute correctly — without ever writing a URL-encoded action link.

**Acceptance Scenarios**:

1. **Given** a slide contains a fenced `action` code block with valid YAML, **When** the deck is parsed, **Then** the parser produces the same action model as the equivalent inline action link.
2. **Given** a slide contains a fenced `action` block defining a sequence of steps, **When** the user clicks the associated trigger in the presentation, **Then** each step executes in order with the same behavior as a `sequence` action link.
3. **Given** a slide contains both a fenced `action` block and an inline action link, **When** the deck is parsed, **Then** both action formats are recognized and executable.
4. **Given** a fenced `action` block contains invalid YAML syntax, **When** the deck is parsed, **Then** a clear, user-facing parse error is reported identifying the slide and block.

---

### User Story 2 — Preflight Deck Validation (Priority: P2)

As a presenter preparing for a talk, I want to run a validation command that checks all actions, file references, and render directives in my deck before I go live, so that I discover broken references and configuration errors during preparation rather than mid-presentation.

**Why this priority**: Discovering a missing file or invalid line range during a live demo is the most damaging failure mode. Preflight validation is the safety net that makes Executable Talk trustworthy for high-stakes presentations.

**Independent Test**: A user runs the validation command on a deck containing intentional errors (missing file, out-of-range line numbers, nonexistent debug config) and receives a clear report listing every issue with location.

**Acceptance Scenarios**:

1. **Given** a deck references a file path that does not exist in the workspace, **When** the user runs the validation command, **Then** the report lists the missing file, the slide number, and the action that references it.
2. **Given** a deck contains an `editor.highlight` action with a line range that exceeds the target file's length, **When** the user runs the validation command, **Then** the report identifies the invalid range and the actual file length.
3. **Given** a deck contains a `debug.start` action referencing a launch configuration that does not exist, **When** the user runs the validation command, **Then** the report flags the missing configuration by name.
4. **Given** a deck contains a `render:command` directive with a command that is not found on the system PATH, **When** the user runs the validation command, **Then** the report warns about the unavailable command.
5. **Given** a deck passes all validation checks, **When** the user runs the validation command, **Then** a success message confirms the deck is ready to present along with a summary of what was checked.

---

### User Story 3 — Visible Error Feedback During Presentation (Priority: P3)

As a presenter running a live demo, I want to see clear, non-blocking feedback when an action fails during execution, so that I can understand what went wrong and recover quickly without the audience seeing a frozen or broken state.

**Why this priority**: Silent failures force presenters to guess what happened, causing visible confusion in front of an audience. Real-time feedback enables immediate recovery using Undo or manual workaround.

**Independent Test**: A user triggers an action that fails (e.g., opening a deleted file) and sees an inline error notification in the presentation UI with enough detail to understand the failure, without a modal dialog blocking the flow.

**Acceptance Scenarios**:

1. **Given** a `file.open` action targets a file that has been deleted since the deck was loaded, **When** the user triggers the action during presentation, **Then** a non-blocking notification appears in the presentation UI indicating the file was not found.
2. **Given** a `terminal.run` action fails to execute (e.g., terminal creation fails, workspace trust is denied), **When** the user triggers the action, **Then** the presentation UI shows a non-blocking notification indicating the failure reason. *(Note: exit codes and command output are not observable via the VS Code Terminal API; only executor-level failures are reported.)*
3. **Given** a `sequence` action fails on step 2 of 4, **When** the failure occurs, **Then** the notification identifies which step failed and which steps completed successfully.
4. **Given** an action fails during presentation, **When** the presenter views the error, **Then** the error message includes enough context (action type, target, reason) to decide whether to Undo, retry, or skip.
5. **Given** multiple actions fail in succession, **When** notifications appear, **Then** they stack without obscuring slide content and can be dismissed individually.

---

### User Story 4 — Authoring Assistance for Action Blocks (Priority: P4)

As a deck author, I want autocomplete suggestions, hover documentation, and real-time validation when writing action blocks in `.deck.md` files, so that I can write correct actions without memorizing parameter names or consulting documentation.

**Why this priority**: Without authoring assistance, even the improved YAML syntax requires memorization. Autocomplete and validation close the feedback loop during authoring, dramatically reducing time-to-correct-deck. This depends on P1 (the new syntax) being in place first.

**Independent Test**: A user opens a `.deck.md` file, begins typing inside a fenced `action` block, and receives autocomplete suggestions for action types and their parameters — with validation errors appearing as they type invalid values.

**Acceptance Scenarios**:

1. **Given** a user types inside a fenced `action` block and starts a new key, **When** they trigger autocomplete, **Then** a list of valid action types (file.open, editor.highlight, terminal.run, debug.start, sequence, vscode.command) appears.
2. **Given** a user has specified `type: file.open` and starts a parameter key, **When** they trigger autocomplete, **Then** only parameters valid for `file.open` (e.g., `path`) are suggested.
3. **Given** a user types a `path` value inside a `file.open` action, **When** they trigger autocomplete, **Then** workspace file paths are suggested.
4. **Given** a user specifies an invalid parameter name for an action type, **When** the file is saved or on keystroke, **Then** a diagnostic warning appears on the invalid parameter.
5. **Given** a user hovers over an action type keyword (e.g., `editor.highlight`), **When** the hover tooltip appears, **Then** it shows a description of the action and its available parameters with types.

---

### Edge Cases

- What happens when a fenced action block contains valid YAML but an unrecognized action type? → A clear validation error is reported naming the unrecognized type.
- What happens when preflight validation is run on a deck with no actions or render directives? → Validation succeeds with a message noting that no actions were found to check.
- What happens when an action fails but the presenter has Undo disabled (e.g., at the beginning of the deck)? → The error notification still appears; Undo availability is independent of error reporting.
- What happens when a deck mixes old inline action links and new fenced action blocks? → Both formats are supported simultaneously; validation checks both.
- What happens when a `render:command` takes longer than expected during preflight? → Preflight uses a timeout and warns about slow commands without blocking completion.
- What happens during preflight if the workspace is untrusted? → Trust-requiring actions are flagged as "requires Workspace Trust" rather than treated as errors.

## Requirements *(mandatory)*

### Functional Requirements

**Fenced Action Block Syntax**

- **FR-001**: The parser MUST recognize fenced code blocks with the language identifier `action` as action definitions.
- **FR-002**: The content of `action` fenced blocks MUST be parsed as YAML, supporting all existing action types: `file.open`, `editor.highlight`, `terminal.run`, `debug.start`, `sequence`, and `vscode.command`.
- **FR-003**: Sequence actions in fenced blocks MUST support a `steps` array where each step defines a single action with its parameters.
- **FR-004**: The parser MUST continue to support existing inline action link syntax (`[Label](action:type?params)`) alongside fenced blocks.
- **FR-005**: When a fenced action block contains invalid YAML, the parser MUST report a descriptive error including the slide number and the nature of the syntax error.

**Preflight Deck Validation**

- **FR-006**: The extension MUST provide a command (`Executable Talk: Validate Deck`) that scans the entire deck and reports all detectable issues before presentation.
- **FR-007**: Preflight validation MUST check that all file paths referenced by actions and render directives exist in the workspace.
- **FR-008**: Preflight validation MUST check that line ranges in `editor.highlight` actions do not exceed the actual length of the target file.
- **FR-009**: Preflight validation MUST check that debug configurations referenced by `debug.start` actions exist in the workspace's launch configuration.
- **FR-010**: Preflight validation MUST check that commands referenced by `render:command` directives and `terminal.run` actions are available on the system PATH.
- **FR-011**: Preflight validation MUST produce a structured report listing each issue with: severity (error/warning), slide number, action or directive, and a human-readable description.
- **FR-012**: Preflight validation MUST complete with a success summary when no issues are found, including the count of actions and directives that were checked.
- **FR-013**: Actions requiring Workspace Trust MUST be flagged as warnings (not errors) during preflight in untrusted workspaces.

**Action Execution Error Feedback**

- **FR-014**: When an action fails during presentation, the system MUST display a non-blocking notification in the presentation UI (not a modal dialog).
- **FR-015**: Error notifications MUST include: the action type, the target (file path, command, etc.), and a human-readable reason for the failure.
- **FR-016**: For sequence actions, error notifications MUST identify which step failed and list which preceding steps completed.
- **FR-017**: Error notifications MUST be dismissible by the presenter without disrupting slide navigation.
- **FR-018**: Multiple concurrent error notifications MUST stack visibly without obscuring primary slide content.

**Authoring Assistance**

- **FR-019**: The extension MUST provide autocomplete suggestions for action type names inside fenced `action` blocks.
- **FR-020**: The extension MUST provide parameter-aware autocomplete that suggests only valid parameters for the selected action type.
- **FR-021**: The extension MUST provide workspace file path completion for path-type parameters.
- **FR-022**: The extension MUST show diagnostic markers (warnings/errors) for unrecognized action types or invalid parameters inside fenced `action` blocks.
- **FR-023**: The extension MUST provide hover documentation for action type keywords showing their description and available parameters.

### Key Entities

- **Action Block**: A fenced code block (language: `action`) containing a YAML action definition. Replaces inline action links for improved readability. Contains a `type` field and type-specific parameters.
- **Validation Report**: A structured list of issues found during preflight validation. Each entry includes severity, location (slide number), source (action or render directive), and a description.
- **Action Error**: A runtime failure that occurs when an action cannot complete during presentation. Contains the action type, target, failure reason, and context about preceding steps (for sequences).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new user can author a 10-slide deck with 5 actions using only fenced action block syntax in under 15 minutes, without consulting external documentation.
- **SC-002**: Preflight validation detects 100% of missing file references and invalid line ranges before presentation.
- **SC-003**: Every action failure during presentation produces a visible, informative notification within 2 seconds of the failure.
- **SC-004**: Autocomplete eliminates >95% of action type and parameter errors for users who engage completion suggestions.
- **SC-005**: Presenters who run preflight validation experience zero surprises from broken file references or missing configurations during their talk.
- **SC-006**: Existing decks using inline action link syntax continue to work without any modification after this feature is shipped.
- **SC-007**: 90% of deck authors prefer fenced action block syntax over inline action links within 30 days of availability (measured by usage telemetry or survey). *(Deferred: telemetry infrastructure is out of scope for this feature. Measurement will be added in a follow-up.)*

## Assumptions

- The YAML parsing behavior will follow standard YAML 1.2 conventions; no custom extensions are needed.
- Autocomplete and hover documentation will leverage existing VS Code extension APIs (e.g., CompletionItemProvider, HoverProvider) rather than a full Language Server Protocol implementation — a full LSP can be considered in a future iteration.
- Preflight validation will operate on the saved state of files in the workspace; unsaved editor changes are not validated.
- Error feedback in the presentation webview will use the existing postMessage protocol to communicate failures from the extension host.
- The `render:command` PATH check during preflight will use the same shell environment that the terminal executor uses.
- Cross-platform terminal differences (addressed in the analysis as a separate "Important" issue) are out of scope for this feature; preflight will validate against the current platform only.
