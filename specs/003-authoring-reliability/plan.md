# Implementation Plan: Authoring & Reliability — Critical Adoption Blockers

**Branch**: `003-authoring-reliability` | **Date**: 2026-02-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-authoring-reliability/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Replace URL-encoded inline action links with human-readable YAML fenced code blocks (`action` language), add a preflight validation command to catch broken references before presenting, surface non-blocking error feedback in the presentation webview when actions fail at runtime, and provide autocomplete/hover/diagnostics for authoring action blocks in `.deck.md` files. The existing inline link syntax remains supported for backward compatibility.

## Technical Context

**Language/Version**: TypeScript 5.3+ (strict mode)  
**Primary Dependencies**: gray-matter 4.x (YAML frontmatter), markdown-it 14.x (Markdown rendering), VS Code Extension API 1.85+  
**Storage**: N/A (file-based; reads `.deck.md` and workspace files)  
**Testing**: Mocha + @vscode/test-electron for integration, Mocha + chai for unit tests  
**Target Platform**: VS Code desktop (macOS, Windows, Linux)  
**Project Type**: VS Code Extension (single project)  
**Performance Goals**: Slide transitions < 100ms, action execution feedback < 200ms, state snapshot creation non-blocking  
**Constraints**: Webview must use Content Security Policy; file access limited to workspace scope; terminal commands explicitly defined in deck files  
**Scale/Scope**: Decks typically 10–50 slides with 1–20 actions per deck

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Three-Layer Architecture (NON-NEGOTIABLE) ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Fenced action block parsing** | Parser layer (`src/parser/`) — no Webview or VS Code API involvement |
| **Preflight validation** | Conductor layer (`src/conductor/`) invokes validators; results sent to Webview via `postMessage` |
| **Error feedback** | Extension Host sends `actionStatusChanged`/`error` messages to Webview; Webview renders notifications |
| **Authoring assistance** | Extension Host registers `CompletionItemProvider`, `HoverProvider`, `DiagnosticCollection` — no Webview involvement |

All four capabilities sit within the correct layers. No cross-layer violations detected.

### II. Stateful Demo Management ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Fenced action blocks** | Parsed to the same `Action` model; snapshot captured before execution (unchanged) |
| **Preflight validation** | Read-only operation; does not modify IDE state; no snapshot needed |
| **Error feedback** | Errors reported after failed actions; snapshot was already captured by pipeline |
| **Authoring assistance** | Edit-time only; not active during presentation |

No changes to State Stack mechanics required.

### III. Action Registry Compliance ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Fenced action blocks** | Parsed YAML produces `Action` objects identical to inline links; routed through same `ActionRegistry` |
| **Preflight validation** | Uses `ActionRegistry.get()` and `executor.validate()` for each action; does not bypass registry |
| **Error feedback** | Extends `ExecutionResult` already returned by registry executors |
| **Authoring assistance** | Schema metadata derived from registered executors (action types, parameter definitions) |

All actions continue to flow through the registry.

### IV. Test-First Development ✅ PASS (process gate)

TDD will be enforced during implementation. Plan includes test points for:
- Unit tests for YAML action block parser
- Unit tests for each preflight validator
- Integration tests for error notification delivery
- Unit tests for completion/hover/diagnostic providers

### V. Presentation-First UX ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Fenced action blocks** | Transparent to presenter; same button/link UX in webview |
| **Preflight validation** | Runs before presentation; never blocks live flow |
| **Error feedback** | Non-blocking, dismissible notifications; no modal dialogs |
| **Authoring assistance** | Editor-time only; invisible during presentation |

**GATE RESULT: ALL 5 PRINCIPLES PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/003-authoring-reliability/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── action-block-syntax.md
│   ├── preflight-validation.md
│   └── error-feedback.md
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── parser/
│   ├── actionLinkParser.ts      # Existing — inline action link parsing
│   ├── actionBlockParser.ts     # NEW — fenced action block YAML parsing
│   ├── deckParser.ts            # MODIFIED — integrate block parser
│   └── slideParser.ts           # MODIFIED — detect action blocks before MD render
├── validation/                  # NEW directory
│   ├── preflightValidator.ts    # NEW — orchestrates all checks
│   ├── filePathValidator.ts     # NEW — checks file existence
│   ├── lineRangeValidator.ts    # NEW — checks line range validity
│   ├── debugConfigValidator.ts  # NEW — checks launch.json configs
│   ├── commandValidator.ts      # NEW — checks PATH availability
│   └── types.ts                 # NEW — ValidationReport, ValidationIssue types
├── actions/
│   ├── executionPipeline.ts     # MODIFIED — enhanced error reporting on result
│   └── errors.ts                # MODIFIED — add structured error context
├── conductor/
│   └── conductor.ts             # MODIFIED — register validation command, forward errors
├── webview/
│   ├── messages.ts              # MODIFIED — add error notification messages
│   └── assets/
│       ├── presentation.js      # MODIFIED — error notification rendering & dismiss
│       └── presentation.css     # MODIFIED — error notification styles
├── providers/                   # NEW directory
│   ├── actionCompletionProvider.ts  # NEW — CompletionItemProvider for action blocks
│   ├── actionHoverProvider.ts       # NEW — HoverProvider for action types
│   ├── actionDiagnosticProvider.ts  # NEW — DiagnosticCollection for validation
│   └── actionSchema.ts             # NEW — action type metadata (types, params, docs)
└── extension.ts                 # MODIFIED — register providers and validate command

test/
├── unit/
│   ├── parser/
│   │   └── actionBlockParser.test.ts    # NEW
│   ├── validation/
│   │   ├── preflightValidator.test.ts   # NEW
│   │   ├── filePathValidator.test.ts    # NEW
│   │   ├── lineRangeValidator.test.ts   # NEW
│   │   ├── debugConfigValidator.test.ts # NEW
│   │   └── commandValidator.test.ts     # NEW
│   └── providers/
│       ├── actionCompletionProvider.test.ts  # NEW
│       ├── actionHoverProvider.test.ts       # NEW
│       └── actionDiagnosticProvider.test.ts  # NEW
└── integration/
    ├── actionBlockExecution.test.ts      # NEW
    └── preflightCommand.test.ts          # NEW
```

**Structure Decision**: Follows existing single-project VS Code extension layout. New capabilities added as new modules (`validation/`, `providers/`) to avoid bloating existing files. Parser extension follows existing `actionLinkParser` pattern.

## Complexity Tracking

> No constitution violations detected — this section is intentionally empty.
