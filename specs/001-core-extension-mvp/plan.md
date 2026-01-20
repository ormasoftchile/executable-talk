# Implementation Plan: Executable Talk Core Extension MVP

**Branch**: `001-core-extension-mvp` | **Date**: 2026-01-19 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-core-extension-mvp/spec.md`

## Summary

Build a VS Code extension that transforms `.deck.md` files into executable presentations. The extension uses a Three-Layer Architecture (Webview → Conductor → VS Code API) to render Markdown slides in a fullscreen Webview while orchestrating IDE actions (file.open, terminal.run, editor.highlight, debug.start) based on YAML frontmatter directives. Core differentiator is the State Stack enabling undo/redo of IDE state for "Demo Effect" recovery.

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode enabled)  
**Primary Dependencies**: VS Code Extension API, markdown-it (Markdown parsing), gray-matter (YAML frontmatter extraction)  
**Storage**: N/A (session-only state; no persistent storage required for MVP)  
**Testing**: VS Code Extension Test Suite (@vscode/test-electron) + Mocha for unit tests  
**Target Platform**: VS Code 1.85+ (desktop, all OS)  
**Project Type**: VS Code Extension (single project)  
**Performance Goals**: Slide transitions < 100ms, action feedback < 200ms, startup < 2s  
**Constraints**: Webview CSP required, workspace-scoped file access, Workspace Trust integration  
**Scale/Scope**: Target 50-slide decks, 50-snapshot State Stack limit, single active presentation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Three-Layer Architecture | ✅ PASS | Design explicitly separates Webview (UI), Conductor (bridge), VS Code API (executor) |
| II. Stateful Demo Management | ✅ PASS | State Stack with auto-snapshot before actions, undo/redo, reset command defined |
| III. Action Registry Compliance | ✅ PASS | All actions declarative (YAML frontmatter, inline links); Action entity defined with type/params schema |
| IV. Test-First Development | ✅ PASS | Plan includes unit tests for Conductor, integration tests for Webview↔Host, E2E for slides |
| V. Presentation-First UX | ✅ PASS | Zen Mode integration, visual feedback (loading/success/error), keyboard navigation scoped to Webview |

**Gate Status**: ✅ PASSED — Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/001-core-extension-mvp/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── extension.ts                 # Extension entry point, activation
├── conductor/
│   ├── conductor.ts             # Message parser, action sequencer
│   └── stateStack.ts            # Snapshot management, undo/redo
├── actions/
│   ├── registry.ts              # Action type registry
│   ├── fileOpen.ts              # file.open executor
│   ├── terminalRun.ts           # terminal.run executor
│   ├── editorHighlight.ts       # editor.highlight executor
│   ├── debugStart.ts            # debug.start executor
│   └── sequence.ts              # sequence executor
├── parser/
│   ├── deckParser.ts            # .deck.md file parser
│   ├── slideParser.ts           # Individual slide extraction
│   └── actionLinkParser.ts      # vscode:action: URI parser
├── webview/
│   ├── webviewProvider.ts       # Webview panel management
│   ├── messageHandler.ts        # postMessage protocol
│   └── assets/                  # HTML, CSS, JS for slides
├── models/
│   ├── deck.ts                  # Deck data structure
│   ├── slide.ts                 # Slide data structure
│   ├── action.ts                # Action data structure
│   └── snapshot.ts              # Snapshot data structure
└── utils/
    ├── zenMode.ts               # Zen Mode toggle helper
    └── workspaceTrust.ts        # Trust status utilities

test/
├── unit/
│   ├── conductor.test.ts
│   ├── stateStack.test.ts
│   ├── deckParser.test.ts
│   └── actions/*.test.ts
├── integration/
│   ├── webviewMessaging.test.ts
│   └── actionExecution.test.ts
└── e2e/
    └── presentation.test.ts
```

**Structure Decision**: Single VS Code extension project. The `src/` directory follows the Three-Layer Architecture: `webview/` (Presentation), `conductor/` (Bridge), `actions/` (Executor). Parser and models are shared utilities.

## Complexity Tracking

> No violations identified. All design decisions align with constitution principles.

---

## Phase 1 Completion Summary

**Status**: ✅ COMPLETE

**Artifacts Generated**:
- [research.md](research.md) - VS Code API research for Webview, Terminal, Editor Decorations, Workspace Trust
- [data-model.md](data-model.md) - Entity definitions (Deck, Slide, Action, Snapshot, StateStack)
- [contracts/message-protocol.md](contracts/message-protocol.md) - Webview ↔ Extension Host postMessage protocol
- [contracts/action-executor.md](contracts/action-executor.md) - ActionExecutor interface and all action types
- [contracts/state-stack.md](contracts/state-stack.md) - StateStack operations and snapshot management
- [quickstart.md](quickstart.md) - Developer onboarding and local setup guide

**Agent Context Updated**:
- [/.github/copilot-instructions.md](../../.github/copilot-instructions.md) - GitHub Copilot context for this project

---

## Post-Design Constitution Check

*Re-evaluation after Phase 1 design completion*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Three-Layer Architecture | ✅ PASS | contracts/message-protocol.md defines postMessage boundary; no direct VS Code API calls from Webview |
| II. Stateful Demo Management | ✅ PASS | contracts/state-stack.md defines 50-snapshot cap, FIFO eviction, session-only persistence |
| III. Action Registry Compliance | ✅ PASS | contracts/action-executor.md defines ActionRegistry interface and all executor contracts |
| IV. Test-First Development | ✅ PASS | quickstart.md documents test structure; plan.md defines test directories |
| V. Presentation-First UX | ✅ PASS | research.md confirms Zen Mode API; message protocol includes non-blocking error handling |

**Post-Design Gate**: ✅ PASSED — Ready for Phase 2 task generation (`/speckit.tasks`)
