# Implementation Plan: Deck Environment Variables

**Branch**: `006-deck-env-variables` | **Date**: 2026-02-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-deck-env-variables/spec.md`

## Summary

Add a `.deck.env` sidecar file system that lets deck authors declare environment variables in frontmatter (`env:` block), supply machine-specific values via a dotenv file, and reference them with `{{VAR}}` placeholders in action parameters. Variables are resolved at deck load time with dual-path interpolation: non-secret values appear resolved on slides, while `secret: true` values keep the `{{VAR}}` placeholder in the webview and only resolve in the extension host for execution. Preflight validation enforces required variables, runs type-specific validators (`directory`, `file`, `command`, `url`, `port`, `regex:`), and warns when `.deck.env` is not gitignored. A guided setup flow helps first-time users create their `.deck.env` from a template.

## Technical Context

**Language/Version**: TypeScript 5.3+ (strict mode)
**Primary Dependencies**: gray-matter 4.x (YAML frontmatter), markdown-it 14.x (Markdown rendering), VS Code Extension API 1.85+
**Storage**: N/A (file-based; reads `.deck.md`, `.deck.env`, `.deck.env.example`, `.gitignore`)
**Testing**: Mocha + @vscode/test-electron for integration, Mocha + chai for unit tests
**Target Platform**: VS Code desktop (macOS, Windows, Linux)
**Project Type**: VS Code Extension (single project)
**Performance Goals**: Env file loading + resolution < 100ms for 20 variables; slide transitions < 100ms; validation rules < 500ms total
**Constraints**: Webview must use Content Security Policy; secret values must never cross postMessage boundary; file access limited to workspace scope; `{{VAR}}` syntax must not conflict with existing `${platform}` placeholders
**Scale/Scope**: Typical decks declare 3–15 env variables; `.deck.env` files < 1KB; validation runs 6 built-in rule types

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Three-Layer Architecture (NON-NEGOTIABLE) ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Env declaration parsing** | Parser layer (`src/parser/deckParser.ts`) — parses `env:` frontmatter block into `EnvDeclaration[]` |
| **Env file loading & resolution** | New `src/env/` module — file I/O via `vscode.workspace.fs`, resolution logic in pure functions |
| **Secret masking** | Conductor layer — maintains dual `ResolvedEnv` (display vs execution), scrubs terminal output before webview |
| **Preflight env validation** | Extends `src/validation/preflightValidator.ts` — new validation phase alongside existing checks |
| **Guided setup flow** | Conductor layer — triggers toast via `vscode.window`, copies files via `workspace.fs`, opens editor |
| **Env status display** | Webview receives masked status via `postMessage`; never receives raw secret values (FR-010) |
| **Authoring assistance** | Extension Host registers completion/hover providers — no Webview involvement |

All capabilities sit within the correct layers. **The critical security boundary (FR-010) is enforced at the Conductor → Webview message layer**: secret `resolvedValue` never enters any `postMessage` payload.

### II. Stateful Demo Management ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Env resolution** | Resolved at deck load time, immutable during session. No IDE state modification. |
| **Env validation** | Read-only check. Does not modify IDE state. No snapshot needed. |
| **Guided setup flow** | Creates/opens a file. File operations are already captured by the existing snapshot mechanism. |
| **Secret scrubbing** | Post-processing on terminal output. Does not modify IDE state. |

No changes to State Stack mechanics required. Env resolution is deterministic and idempotent.

### III. Action Registry Compliance ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Env var interpolation** | Modifies action `params` values before they enter the registry pipeline. Actions themselves unchanged. |
| **No new action types** | Env vars are a parameter pre-processing layer, not a new action type. All actions still flow through `ActionRegistry`. |
| **Executor integration** | `TerminalRunExecutor` receives resolved values via `ExecutionContext.resolvedEnv`. No direct VS Code API calls from env modules. |

Env vars are a transparent pre-processing layer. The action registry and executor pipeline are unmodified.

### IV. Test-First Development ✅ PASS (process gate)

TDD will be enforced during implementation. Plan includes test points for:
- Unit tests for dotenv file parser
- Unit tests for `{{VAR}}` interpolation engine (display vs execution paths)
- Unit tests for each validation rule type (directory, file, command, url, port, regex)
- Unit tests for secret scrubbing (including substring ordering, short values)
- Unit tests for env completion/hover providers
- Integration tests for guided setup flow (toast → file creation → re-validation)
- Integration tests for end-to-end env resolution in terminal.run execution

### V. Presentation-First UX ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Env resolution** | Happens at deck load time, not during presentation. Slides show resolved (or masked) values. |
| **Missing env vars** | Non-blocking toast with quick-action ("Set Up Now"), not a modal dialog. |
| **Validation feedback** | Inline diagnostics + status bar indicator. Never interrupts active presentation. |
| **Secret masking** | Transparent to presenter. Slides display `{{TOKEN}}` for secrets; execution uses real values. |
| **Re-validation on save** | Background process, updates diagnostics silently. |

**GATE RESULT: ALL 5 PRINCIPLES PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/006-deck-env-variables/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── env-resolver.md
│   ├── env-validator.md
│   └── env-file-format.md
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── env/                             # NEW directory — environment variable system
│   ├── index.ts                     # NEW — barrel exports
│   ├── envFileLoader.ts             # NEW — loads/parses .deck.env files (dotenv format)
│   ├── envDeclarationParser.ts      # NEW — parses env: frontmatter block into EnvDeclaration[]
│   ├── envResolver.ts               # NEW — merges declarations + file values + defaults, dual interpolation
│   ├── envValidator.ts              # NEW — validates required vars, runs validation rules
│   └── secretScrubber.ts            # NEW — scrubs secret values from output strings
├── parser/
│   └── deckParser.ts                # MODIFIED — parse env: frontmatter, trigger env resolution
├── models/
│   ├── deck.ts                      # MODIFIED — add envDeclarations field
│   └── env.ts                       # NEW — EnvDeclaration, ResolvedEnv, EnvStatus types
├── conductor/
│   └── conductor.ts                 # MODIFIED — store ResolvedEnv, guided setup flow, status bar
├── actions/
│   └── terminalRunExecutor.ts       # MODIFIED — use execution-path env values
├── validation/
│   ├── preflightValidator.ts        # MODIFIED — add env validation phase
│   ├── envRuleValidator.ts          # NEW — built-in validation rules (directory, file, etc.)
│   └── types.ts                     # MODIFIED — add env fields to ValidationContext
├── providers/
│   ├── actionCompletionProvider.ts  # MODIFIED — add env: frontmatter completions
│   ├── actionHoverProvider.ts       # MODIFIED — add env: frontmatter hover docs
│   └── actionSchema.ts             # MODIFIED — update terminal.run docs to mention {{VAR}}
├── webview/
│   ├── messages.ts                  # MODIFIED — add envStatus to DeckLoadedMessage, new EnvStatusChanged
│   └── assets/
│       ├── presentation.js          # MODIFIED — render env status badge
│       └── presentation.css         # MODIFIED — env badge styles
└── extension.ts                     # MODIFIED — register file watcher for .deck.env

test/
├── unit/
│   ├── env/
│   │   ├── envFileLoader.test.ts         # NEW
│   │   ├── envDeclarationParser.test.ts  # NEW
│   │   ├── envResolver.test.ts           # NEW
│   │   ├── envValidator.test.ts          # NEW
│   │   └── secretScrubber.test.ts        # NEW
│   ├── validation/
│   │   └── envRuleValidator.test.ts      # NEW
│   └── providers/
│       └── envProviders.test.ts          # NEW
└── integration/
    ├── envResolution.test.ts             # NEW
    └── guidedSetup.test.ts               # NEW
```

**Structure Decision**: New `src/env/` directory provides clean separation for the env variable subsystem. Follows the same pattern as `src/validation/` introduced in feature 003. Parser, conductor, and providers are extended but not restructured.

## Post-Design Constitution Re-evaluation

*Re-checked after Phase 1 design artifacts (data-model.md, contracts/, quickstart.md).*

| Principle | Pre-Design | Post-Design | Notes |
|-----------|:----------:|:-----------:|-------|
| I. Three-Layer Architecture | ✅ PASS | ✅ PASS | `EnvResolver.interpolateForExecution` output confirmed never in postMessage payloads (env-resolver contract §Security Invariant). `EnvStatus` is the ONLY env data crossing the webview boundary. |
| II. Stateful Demo Management | ✅ PASS | ✅ PASS | Guided setup creates/opens files — already covered by existing snapshot mechanism. `ResolvedEnv` is immutable during session. |
| III. Action Registry Compliance | ✅ PASS | ✅ PASS | Data model confirms Action interface unchanged. Interpolation is a transparent pre-processing layer before executor dispatch. |
| IV. Test-First Development | ✅ PASS | ✅ PASS | Data model entities have clear validation rules → direct test targets. Contracts specify exact algorithms → testable pure functions. 9 new test files planned. |
| V. Presentation-First UX | ✅ PASS | ✅ PASS | Quickstart confirms non-blocking UX: env badge + toast (not modal). Live reload on `.deck.env` save via FileSystemWatcher. |

**GATE RESULT: ALL 5 PRINCIPLES PASS POST-DESIGN — ready for Phase 2 (tasks).**

## Complexity Tracking

> No constitution violations detected — this section is intentionally empty.
