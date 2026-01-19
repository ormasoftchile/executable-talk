# Executable Talk - GitHub Copilot Instructions

## Project Overview

Executable Talk is a VS Code extension that transforms Markdown-based presentations (`.deck.md` files) into executable narratives with interactive code demonstrations.

## Technology Stack

- **Language**: TypeScript 5.x (strict mode)
- **Platform**: VS Code Extension API 1.85+
- **Parser**: gray-matter (YAML frontmatter), markdown-it (Markdown rendering)
- **Testing**: @vscode/test-electron, Mocha
- **Architecture**: Three-Layer (Webview → Conductor → VS Code API)

## Core Architecture

```
Webview (Presentation UI)
    │ postMessage protocol
    ▼
Conductor Layer (Orchestration)
    │
    ├── Action Registry (executor dispatch)
    ├── State Stack (undo/redo, 50 max snapshots)
    └── Deck Parser (gray-matter + custom action links)
    │
    ▼
VS Code API Layer (window, workspace, debug, terminal)
```

## Key Files

- `src/extension.ts` - Extension entry point
- `src/conductor/Conductor.ts` - Main orchestrator
- `src/conductor/StateStack.ts` - Undo/redo management
- `src/actions/ActionRegistry.ts` - Action executor registry
- `src/parser/DeckParser.ts` - .deck.md file parser
- `src/webview/WebviewProvider.ts` - Presentation UI

## Action Types

- `file.open` - Opens file in editor (no trust required)
- `editor.highlight` - Highlights lines (no trust required)
- `terminal.run` - Runs terminal command (requires Workspace Trust)
- `debug.start` - Starts debug session (requires Workspace Trust)
- `sequence` - Executes multiple actions in order

## Coding Standards

1. **Three-Layer Architecture**: Webview communicates only via postMessage to Conductor
2. **Action Registry**: All actions must go through ActionRegistry, never call VS Code APIs directly from Webview
3. **Stateful Demo Management**: Every navigation/action must capture state snapshot before execution
4. **Test-First**: Write tests before implementation
5. **Presentation-First UX**: Never block presentation flow with modal dialogs

## Message Protocol

Webview → Extension Host:
- `navigate`, `executeAction`, `undo`, `redo`, `close`, `ready`

Extension Host → Webview:
- `slideChanged`, `actionStatusChanged`, `deckLoaded`, `error`, `trustStatusChanged`

## Security Model

- Actions with `requiresTrust: true` blocked in untrusted workspaces
- Use `vscode.workspace.isTrusted` to check trust status
- Show user-friendly error when trust blocks action

## File Conventions

- Presentation files: `*.deck.md`
- Slide delimiter: `---` (horizontal rule)
- Action links: `[Label](action:type?param=value)`
