# Implementation Plan: Non-Linear Navigation, Scenes & Cross-Platform Commands

**Branch**: `005-nonlinear-nav-scenes` | **Date**: 2026-02-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/005-nonlinear-nav-scenes/spec.md`

## Summary

Extend Executable Talk with non-linear slide navigation (slide picker overlay, jump-by-number, go-back history), named scene checkpoints that capture and restore full IDE state (extending the existing Snapshot/StateStack model with a parallel named-scene store), and a cross-platform command abstraction for `terminal.run` actions (platform-map syntax in YAML `onEnter` params with OS-detection and placeholder resolution). The existing `navigate` message type already defines `'goto'` direction with `slideIndex` — this feature implements the unhandled path and layers three new capabilities on top.

## Technical Context

**Language/Version**: TypeScript 5.3+ (strict mode)  
**Primary Dependencies**: VS Code Extension API 1.85+, gray-matter 4.x (YAML frontmatter), markdown-it 14.x (Markdown rendering), js-yaml 4.x (action block parsing)  
**Storage**: N/A (session-only state; scenes are not persisted across sessions)  
**Testing**: Mocha + @vscode/test-electron for integration, Mocha for unit tests  
**Target Platform**: VS Code desktop (macOS, Windows, Linux)  
**Project Type**: VS Code Extension (single project)  
**Performance Goals**: Slide jump < 200ms, scene restore < 2s (5 editors + 2 terminals), picker overlay open < 100ms  
**Constraints**: Webview CSP required, workspace-scoped file access, keyboard shortcuts scoped to Webview focus context  
**Scale/Scope**: Decks up to 50 slides, 20 named scenes per session, 50-entry navigation history cap

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Three-Layer Architecture (NON-NEGOTIABLE) ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Slide picker overlay** | Webview layer renders the picker UI; sends `navigate` (`goto`) message to Conductor |
| **Navigation history** | Conductor maintains `NavigationHistory` stack; Webview renders breadcrumb trail via `slideChanged` payload extension |
| **Scene save/restore** | Webview sends `saveScene`/`restoreScene` messages; Conductor manages `SceneStore`; VS Code API layer handles editor/terminal manipulation via existing `SnapshotFactory` |
| **Cross-platform commands** | Conductor/Parser resolves platform map before passing to `terminalRunExecutor` in the VS Code API layer |

All four capabilities sit within the correct layers. No cross-layer violations.

### II. Stateful Demo Management ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Non-linear navigation** | Auto-snapshot captured before every jump (FR-007); undo reverts the jump |
| **Scenes** | Scenes use the existing `Snapshot` model extended with named persistence; restore invokes `SnapshotFactory.restore()` |
| **Cross-platform commands** | Platform resolution is transparent; snapshots capture terminal state identically to single-platform commands |

Scene checkpoints extend the existing snapshot mechanism — they do not replace or bypass the StateStack.

### III. Action Registry Compliance ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Non-linear navigation** | Navigation is not an "action" — it goes through Conductor's `navigateToSlide()`, which then triggers registered `onEnter` actions |
| **Scenes** | Scene save/restore are Conductor commands, not actions. Scene restore triggers `onEnter` actions via standard action pipeline |
| **Cross-platform commands** | Platform map resolution occurs inside `terminalRunExecutor` (the registered executor for `terminal.run`). No new action type needed — only a parameter enhancement |

All IDE manipulation continues to flow through the Action Registry.

### IV. Test-First Development ✅ PASS (process gate)

TDD will be enforced during implementation. Plan includes test points for:
- Unit tests for `NavigationHistory`, `SceneStore`, `PlatformResolver`
- Unit tests for cross-platform command parsing and placeholder expansion
- Integration tests for slide picker → navigate → slide displayed flow
- Integration tests for scene save → restore → IDE state verified

### V. Presentation-First UX ✅ PASS

| Concern | Compliance |
|---------|-----------|
| **Slide picker** | Rendered as an overlay within the Webview (no VS Code Quick Pick); maintains presentation immersion |
| **Scene shortcuts** | `Ctrl+S` / `Cmd+S` (save) and `Ctrl+R` / `Cmd+R` (restore) scoped to Webview — no modal dialogs |
| **Navigation history** | Breadcrumb trail is non-intrusive; visible on demand |
| **Cross-platform errors** | Non-blocking error messages (no modal popups) |

**GATE RESULT: ALL 5 PRINCIPLES PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/005-nonlinear-nav-scenes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── navigation-protocol.md
│   ├── scene-store.md
│   └── platform-resolver.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── conductor/
│   ├── conductor.ts             # MODIFIED — add 'goto' handling, scene commands, history tracking
│   ├── stateStack.ts            # UNCHANGED — existing undo/redo
│   ├── snapshotFactory.ts       # MODIFIED — minor: expose partial-restore with warning
│   ├── sceneStore.ts            # NEW — named scene checkpoint storage (Map<string, SceneSnapshot>)
│   └── navigationHistory.ts     # NEW — breadcrumb navigation history stack
├── actions/
│   ├── terminalRunExecutor.ts   # MODIFIED — platform map resolution + placeholder expansion
│   └── platformResolver.ts      # NEW — OS detection, command selection, placeholder substitution
├── parser/
│   ├── deckParser.ts            # MODIFIED — parse `scenes` from deck frontmatter
│   └── actionBlockParser.ts     # MODIFIED — validate cross-platform command blocks
├── models/
│   ├── deck.ts                  # MODIFIED — add SceneDefinition[], NavigationMethod, NavigationHistoryBreadcrumb
│   ├── snapshot.ts              # MODIFIED — extend EditorState with cursorPosition
│   └── slide.ts                 # UNCHANGED
├── validation/
│   └── preflightValidator.ts    # MODIFIED — add cross-platform coverage check
├── webview/
│   ├── messages.ts              # MODIFIED — add saveScene, restoreScene, sceneChanged message types
│   ├── messageHandler.ts        # MODIFIED — route new message types
│   └── assets/
│       ├── presentation.js      # MODIFIED — slide picker UI, scene shortcuts, history breadcrumb
│       └── presentation.css     # MODIFIED — picker overlay styles, breadcrumb styles
└── extension.ts                 # MODIFIED — register new commands (saveScene, restoreScene)

test/
├── unit/
│   ├── conductor/
│   │   ├── sceneStore.test.ts           # NEW
│   │   └── navigationHistory.test.ts    # NEW
│   ├── actions/
│   │   └── platformResolver.test.ts     # NEW
│   └── parser/
│       ├── crossPlatformParsing.test.ts  # NEW
│       └── authoredSceneParsing.test.ts  # NEW
└── integration/
    ├── nonLinearNavigation.test.ts       # NEW
    └── sceneRestore.test.ts             # NEW
```

**Structure Decision**: Follows existing single-project VS Code extension layout established in 001-core-extension-mvp. New capabilities added as new modules (`sceneStore.ts`, `navigationHistory.ts`, `platformResolver.ts`) to maintain single-responsibility. Existing files receive targeted modifications — no restructuring needed.

## Complexity Tracking

> No constitution violations detected — this section is intentionally empty.

---

## Post-Design Constitution Re-evaluation

*Re-check after Phase 1 design artifacts (data-model.md, contracts/, quickstart.md) are complete.*

### I. Three-Layer Architecture ✅ PASS (confirmed)

| Design Artifact | Compliance Verification |
|-----------------|------------------------|
| **navigation-protocol.md** | Messages flow Webview → Conductor (`navigate`, `goBack`, `saveScene`, `restoreScene`). Host → Webview (`slideChanged`, `sceneChanged`, `openSlidePicker`, `openScenePicker`). No direct VS Code API calls from Webview. |
| **scene-store.md** | `SceneStore` lives in Conductor layer. Uses `SnapshotFactory` (VS Code API layer) for capture/restore. Webview only receives serialized `SceneListItem` data — never raw VS Code objects. |
| **platform-resolver.md** | `PlatformResolver` hooks into `terminalRunExecutor` (VS Code API layer executor). Resolution happens before `sendText()`. Webview is unaware of platform resolution. |
| **data-model.md** | `SceneEntry.snapshot` contains `EditorState`/`TerminalState` — these are Conductor-layer DTOs, not raw VS Code API objects. |

### II. Stateful Demo Management ✅ PASS (confirmed)

| Design Artifact | Compliance Verification |
|-----------------|------------------------|
| **scene-store.md** | Scene restore flow explicitly captures pre-restore snapshot → pushes to StateStack (line: "Capture pre-restore snapshot → push to StateStack (enables undo of restore)"). |
| **navigation-protocol.md** | Every `goto` navigation captures snapshot before execution (step 3 of conductor behavior). |
| **data-model.md** | `SceneEntry` wraps existing `Snapshot` model — no separate state mechanism. `NavigationHistory` is read-only breadcrumb; does not replace StateStack for undo. |

### III. Action Registry Compliance ✅ PASS (confirmed)

| Design Artifact | Compliance Verification |
|-----------------|------------------------|
| **platform-resolver.md** | Cross-platform resolution is internal to `terminalRunExecutor` — the registered executor for `terminal.run`. No new action type introduced. |
| **scene-store.md** | Scene restore re-triggers `onEnter` actions for the target slide via the standard action pipeline. |

### IV. Test-First Development ✅ PASS (process gate confirmed)

`quickstart.md` documents 6 new test files across unit and integration suites. TDD workflow will be enforced during `/speckit.tasks` phase.

### V. Presentation-First UX ✅ PASS (confirmed)

| Design Artifact | Compliance Verification |
|-----------------|------------------------|
| **scene-store.md** | Partial restore returns a non-blocking warning via `{ type: 'warning' }` message — no modal dialogs. |
| **navigation-protocol.md** | Slide picker and scene picker are overlay components within the Webview — no VS Code Quick Pick modals that break immersion. |
| **data-model.md** | History breadcrumb is delivered via `slideChanged` payload — Webview renders it as a non-intrusive trail. |

**POST-DESIGN GATE RESULT: ALL 5 PRINCIPLES PASS — design is constitution-compliant. Proceed to `/speckit.tasks`.**
