# Feature Specification: Deck Environment Variables

**Feature Branch**: `006-deck-env-variables`  
**Created**: 2026-02-08  
**Status**: Draft  
**Input**: User description: "Deck environment variables with .deck.env sidecar file for portable onboarding decks and secret masking for live presentations"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Environment Variable Declaration and Resolution (Priority: P1)

As a deck author, I want to declare environment variables in my deck's frontmatter and reference them with `{{VAR}}` placeholders in action parameters, so that the same deck works on any machine without editing the deck itself.

**Why this priority**: This is the foundational primitive. Without variable declaration and resolution, none of the other stories (validation, secrets, guided setup) are possible. A deck that adapts to the student's machine is the entire value proposition.

**Independent Test**: Create a deck with an `env:` frontmatter block and `{{PROJECT_ROOT}}` placeholders in `terminal.run` actions. Supply values via a `.deck.env` file. Verify the resolved commands contain the real values.

**Acceptance Scenarios**:

1. **Given** a deck declares `env: [{ name: PROJECT_ROOT, required: true }]` in frontmatter and uses `{{PROJECT_ROOT}}` in a `terminal.run` action, **When** a `.deck.env` file provides `PROJECT_ROOT=/Users/jane/projects`, **Then** the action executes with the resolved value `/Users/jane/projects` substituted in the command.
2. **Given** a deck uses `{{DB_PORT}}` in an action parameter, **When** the `.deck.env` file provides `DB_PORT=5432`, **Then** every occurrence of `{{DB_PORT}}` across all action parameters in all slides is resolved to `5432`.
3. **Given** a deck uses both `{{VAR}}` env placeholders and existing `${home}` platform placeholders, **When** the deck loads, **Then** both placeholder syntaxes are resolved independently and can coexist in the same command string.
4. **Given** a deck declares an env variable with `required: false` and a `default` value but the `.deck.env` file does not provide it, **When** the deck loads, **Then** the placeholder `{{VAR}}` is replaced with the `default` value.
5. **Given** a deck declares an env variable with `required: false`, no `default`, and the `.deck.env` file does not provide it, **When** the deck loads, **Then** the placeholder `{{VAR}}` is replaced with an empty string and the deck loads without error.
6. **Given** resolution happens at deck load time, **When** the presenter views a slide with a `terminal.run` action, **Then** the resolved command (with actual values) is visible on the slide before clicking run.

---

### User Story 2 - Preflight Environment Validation (Priority: P1)

As a presenter or student, I want the extension to validate that all required environment variables are present and valid before I start presenting, so that I don't discover missing configuration mid-presentation.

**Why this priority**: Equally critical as US1 — without validation, the user discovers broken `{{VAR}}` placeholders mid-demo, which defeats the purpose. This is what makes env vars a "verifiable contract" rather than just string interpolation.

**Independent Test**: Open a deck with required env declarations and no `.deck.env` file. Verify warning diagnostics appear and the user is notified.

**Acceptance Scenarios**:

1. **Given** a deck declares `env: [{ name: TOKEN, required: true }]` and no `.deck.env` file exists, **When** the deck is opened, **Then** a toast notification appears: "This deck requires environment setup" with a quick-action button.
2. **Given** a deck declares `env: [{ name: PROJECT_ROOT, required: true, validate: "directory" }]` and the `.deck.env` provides `PROJECT_ROOT=/nonexistent/path`, **When** the deck loads, **Then** a warning diagnostic appears on the `env` entry in frontmatter indicating the directory does not exist.
3. **Given** a deck declares `env: [{ name: DB_URL, validate: "regex:^postgres://" }]` and the `.deck.env` provides `DB_URL=mysql://localhost`, **When** the deck loads, **Then** a warning diagnostic appears indicating the value does not match the expected pattern.
4. **Given** all required variables are present and all validations pass, **When** the deck loads, **Then** a status bar item shows a green indicator (e.g., "Env ✓") confirming environment readiness.
5. **Given** the existing `executableTalk.validateDeck` preflight command, **When** the user runs it, **Then** env variable checks are included in the preflight results alongside file path, line range, and debug config validations.

---

### User Story 3 - Secret Masking for Live Presentations (Priority: P1)

As a presenter, I want to mark environment variables as secret so that their values never appear on screen — neither in the slide preview nor in captured terminal output — protecting tokens and credentials during live demos.

**Why this priority**: For any deck used in a live or recorded setting that involves tokens, passwords, or API keys, leaking a secret is a security incident. This must ship alongside env vars or authors will avoid using the feature for anything sensitive.

**Independent Test**: Create a deck with `secret: true` on an env variable, use it in a `terminal.run` action. Verify the slide shows the placeholder name, not the value, and that terminal output containing the value is scrubbed before display.

**Acceptance Scenarios**:

1. **Given** a deck declares `env: [{ name: GITHUB_TOKEN, secret: true }]` and uses `{{GITHUB_TOKEN}}` in a `terminal.run` command, **When** the slide is rendered in the webview, **Then** the command displays with the placeholder `{{GITHUB_TOKEN}}` (not the resolved value).
2. **Given** a secret env variable's resolved value appears in terminal output (e.g., an error message echoes the token), **When** that output is sent to the webview, **Then** every occurrence of the secret value is replaced with `•••••`.
3. **Given** a secret env variable is used in a `terminal.run` action, **When** the presenter clicks run, **Then** the terminal receives the actual resolved value (execution is not affected by masking).
4. **Given** the env status badge in the webview or status bar lists environment variables, **When** a variable is marked `secret: true`, **Then** its value is shown as `•••••` instead of the actual value.
5. **Given** a secret value is fewer than 4 characters, **When** the deck loads, **Then** a preflight warning is emitted: "Variable X is very short — masking may over-scrub terminal output."

---

### User Story 4 - Guided Environment Setup Flow (Priority: P2)

As a new team member opening an onboarding deck for the first time, I want a guided setup experience that helps me create my `.deck.env` file from a template, so that I can get started without reading external documentation.

**Why this priority**: Improves first-time experience significantly but is not strictly required — a user can always create the `.deck.env` file manually. The core feature (US1–US3) works without this.

**Independent Test**: Open a deck that has a `.deck.env.example` but no `.deck.env`. Click the "Set Up Now" action. Verify the example is copied and opened in the editor.

**Acceptance Scenarios**:

1. **Given** a deck requires env variables and a `.deck.env.example` exists alongside the deck but no `.deck.env` exists, **When** the user clicks "Set Up Now" on the toast notification, **Then** `.deck.env.example` is copied to `.deck.env` and opened in the editor.
2. **Given** the generated `.deck.env` file is open in the editor, **When** the user edits and saves it, **Then** the extension re-runs validation in real-time and updates diagnostics.
3. **Given** the user has filled all required variables and all validations pass, **When** the file is saved, **Then** a toast appears: "Environment ready ✓" and the deck loads normally.
4. **Given** no `.deck.env.example` exists, **When** the user clicks "Set Up Now", **Then** a new `.deck.env` file is generated from the frontmatter declarations with each variable as a blank entry and its `description` as a comment above it.

---

### User Story 5 - Authoring Assistance for Env Declarations (Priority: P3)

As a deck author, I want autocomplete and hover documentation when writing `env:` blocks in frontmatter, so that I can author env declarations quickly and correctly.

**Why this priority**: Quality-of-life improvement for authors. The feature works without it, but it makes authoring faster and reduces syntax errors.

**Independent Test**: Type `env:` in a `.deck.md` frontmatter block. Verify autocomplete suggests `name`, `description`, `required`, `secret`, `validate`. Hover over `validate` and verify documentation appears.

**Acceptance Scenarios**:

1. **Given** the cursor is inside an `env:` block in frontmatter, **When** the user triggers autocomplete, **Then** suggestions include the env declaration properties: `name`, `description`, `required`, `secret`, `validate`.
2. **Given** the cursor is on the `validate` property, **When** the user triggers autocomplete for the value, **Then** suggestions include the built-in validators: `directory`, `file`, `command`, `url`, `port`, and `regex:`.
3. **Given** the cursor hovers over `secret` in an env declaration, **When** hover info appears, **Then** it explains that the variable's value will be masked in the webview and scrubbed from terminal output.

---

### Edge Cases

- What happens when a `{{VAR}}` placeholder appears in the deck but is not declared in the `env:` frontmatter block? The placeholder is left as the literal string `{{VAR}}` and a preflight warning is emitted.
- What happens when a `.deck.env` file defines variables not declared in frontmatter? They are silently ignored (no error).
- What happens when a secret value is a substring of another secret value? Both are scrubbed; the longer value is scrubbed first to avoid partial replacement artifacts.
- What happens when a secret value appears in a filename that needs to be opened? The file is opened normally (the URI goes to VS Code API, not the webview), but any display of the path in the webview is scrubbed.
- What happens when `{{VAR}}` syntax appears in regular Markdown content (not action parameters)? It is not resolved — interpolation only applies to action parameter values, not prose content.
- What happens when a `.deck.env` file has syntax errors (e.g., missing `=`)? A warning diagnostic is shown on the `.deck.env` file, malformed lines are skipped, and valid lines are still loaded.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support an `env:` block in deck YAML frontmatter that declares environment variables with properties: `name` (string, required), `description` (string), `required` (boolean, default false), `secret` (boolean, default false), `validate` (string), `default` (string, optional fallback value used when `.deck.env` does not supply the variable).
- **FR-002**: System MUST load environment variable values from a `.deck.env` sidecar file located alongside the `.deck.md` file, using standard `KEY=VALUE` dotenv format (one per line, `#` comments, blank lines ignored).
- **FR-003**: System MUST resolve `{{VAR_NAME}}` placeholders in action parameter values at deck load time, replacing them with the corresponding values from the `.deck.env` file.
- **FR-004**: System MUST coexist with the existing `${home}`, `${pathSep}`, `${shell}`, `${pathDelimiter}` platform placeholders without conflicts.
- **FR-005**: System MUST validate required variables on deck open and emit warning diagnostics for missing or invalid values.
- **FR-006**: System MUST support built-in validation rules: `directory` (path exists as directory), `file` (path exists as file), `command` (value found on PATH), `url` (valid URL), `port` (integer 1–65535), `regex:<pattern>` (matches regex).
- **FR-007**: System MUST include environment variable checks in the existing `executableTalk.validateDeck` preflight command results.
- **FR-008**: For variables marked `secret: true`, the system MUST maintain two interpolation paths: a display path (placeholder preserved as `{{VAR}}`) for the webview, and an execution path (real value) for VS Code APIs and terminal execution.
- **FR-009**: For variables marked `secret: true`, the system MUST scrub the variable's resolved value from any terminal output before sending it to the webview, replacing occurrences with `•••••`.
- **FR-010**: The resolved value of a secret variable MUST never cross the postMessage boundary between extension host and webview.
- **FR-011**: System MUST provide a guided setup flow: when a deck requires env variables and no `.deck.env` exists, offer a toast notification with a quick-action to create the file from `.deck.env.example` or from frontmatter declarations.
- **FR-012**: System MUST re-validate environment variables when the `.deck.env` file is saved, updating diagnostics in real-time.
- **FR-013**: System MUST provide autocomplete suggestions for `env:` block properties in frontmatter and for `validate` rule values.
- **FR-014**: System MUST provide hover documentation for env declaration properties in frontmatter.
- **FR-015**: System MUST show a status indicator (status bar or webview badge) reflecting current environment readiness (all required variables satisfied and valid).
- **FR-016**: System MUST emit a non-blocking preflight warning if a `.deck.env` file exists but is not covered by a `.gitignore` rule, alerting the user to the risk of committing secrets to version control.

### Key Entities

- **EnvDeclaration**: A single environment variable requirement declared in frontmatter. Attributes: name, description, required, secret, validate rule, default value.
- **EnvFile**: A `.deck.env` sidecar file containing `KEY=VALUE` pairs. Associated 1:1 with a `.deck.md` file by naming convention.
- **EnvFileTemplate**: A `.deck.env.example` file committed to the repository as a starting point for new users. Contains variable names, comments, and placeholder values.
- **ResolvedEnv**: The runtime collection of resolved environment variables, each carrying a `resolvedValue` (real) and optionally a `maskedValue` (for secrets). Used by the interpolation engine.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A deck with 5+ environment variables loads and resolves all placeholders in under 1 second on a standard machine.
- **SC-002**: A new user opening an onboarding deck with missing env configuration can complete the guided setup flow (create `.deck.env`, fill values, pass validation) in under 3 minutes.
- **SC-003**: 100% of `secret: true` variable values are absent from all webview-rendered content (slide HTML, toast messages, env status display) under all tested scenarios.
- **SC-004**: Terminal output scrubbing catches 100% of literal secret value occurrences before they reach the webview.
- **SC-005**: Preflight validation reports all missing required variables and all validation failures — no silent pass-throughs on invalid environment state.
- **SC-006**: Existing decks without `env:` blocks continue to function identically with zero behavioral changes (full backward compatibility).
- **SC-007**: Autocomplete and hover documentation for `env:` properties appear within the standard VS Code responsiveness threshold (under 500ms).

## Assumptions

- The `.deck.env` file uses standard dotenv format (`KEY=VALUE`, one per line, `#` for comments). Multiline values, variable expansion (`${OTHER_VAR}`), and `export` prefixes are not supported in the initial implementation.
- The `{{VAR}}` interpolation syntax was chosen to avoid conflict with the existing `${placeholder}` platform variable syntax. Double-curly-brace is a widely recognized template syntax.
- Secret masking operates on literal string replacement. It does not protect against encoded forms of the secret (e.g., base64-encoded tokens in output). This is a reasonable first-pass protection for the common case.
- The `.deck.env` file is expected to be gitignored. The extension emits a preflight warning if `.deck.env` is not covered by `.gitignore`. The `.deck.env.example` template should include a comment recommending the gitignore entry.
- Interpolation applies only to action parameter values (inside `action` blocks and action link query strings), not to Markdown prose content in slides.

## Clarifications

### Session 2026-02-08

- Q: Should EnvDeclaration support a `default` property for optional variables? → A: Yes — add `default` property; if supplied and no `.deck.env` value, use the default; if no default, resolve to empty string.
- Q: How should the extension handle the risk of `.deck.env` being accidentally committed with secrets? → A: Emit a preflight warning if `.deck.env` is not listed in `.gitignore` (non-blocking, informational).
- Q: Should `{{VAR}}` interpolation extend to Markdown prose content on slides? → A: No — action parameters only. Prose `{{VAR}}` left as literal text. Keeps implementation surface small and avoids accidental interpolation.
