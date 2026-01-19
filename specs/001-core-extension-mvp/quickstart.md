# Quickstart Guide

**Feature**: 001-core-extension-mvp  
**Date**: 2026-01-19  
**Version**: 1.0.0

## Prerequisites

- **Node.js**: 18.x or later
- **VS Code**: 1.85.0 or later
- **Git**: 2.x or later

---

## 1. Clone & Install

```bash
# Clone the repository
git clone <repository-url> executable-talk
cd executable-talk

# Install dependencies
npm install
```

---

## 2. Project Structure

```
executable-talk/
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── conductor/            # Conductor layer (orchestration)
│   │   ├── Conductor.ts      # Main orchestrator
│   │   └── StateStack.ts     # Undo/redo management
│   ├── actions/              # Action executors
│   │   ├── ActionRegistry.ts
│   │   ├── FileOpenExecutor.ts
│   │   ├── EditorHighlightExecutor.ts
│   │   ├── TerminalRunExecutor.ts
│   │   ├── DebugStartExecutor.ts
│   │   └── SequenceExecutor.ts
│   ├── parser/               # Deck file parser
│   │   ├── DeckParser.ts
│   │   └── ActionLinkParser.ts
│   ├── webview/              # Presentation UI
│   │   ├── WebviewProvider.ts
│   │   └── assets/           # CSS, client JS
│   └── models/               # TypeScript interfaces
│       ├── Deck.ts
│       ├── Slide.ts
│       ├── Action.ts
│       └── Snapshot.ts
├── test/
│   ├── suite/                # Integration tests
│   └── unit/                 # Unit tests
├── specs/                    # Feature specifications
├── .vscode/
│   ├── launch.json           # Debug configurations
│   └── tasks.json            # Build tasks
├── package.json
├── tsconfig.json
└── README.md
```

---

## 3. Development Workflow

### Build

```bash
# Compile TypeScript
npm run compile

# Watch mode (continuous compilation)
npm run watch
```

### Run Extension

1. Open the project in VS Code
2. Press `F5` to launch Extension Development Host
3. In the new window, open a `.deck.md` file
4. Run command: `Executable Talk: Start Presentation`

### Debug

1. Set breakpoints in `src/` files
2. Press `F5` to start debugging
3. Debug controls appear in the original VS Code window

---

## 4. Testing

### Run All Tests

```bash
npm test
```

### Run Specific Tests

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration
```

### Test Coverage

```bash
npm run coverage
```

---

## 5. Create a Sample Deck

Create `sample.deck.md` in any workspace:

```markdown
---
title: My First Talk
author: Developer
---

# Welcome

This is the first slide.

---

# Code Demo

Let's open a file: [Open index.ts](action:file.open?path=src/index.ts)

---

# Terminal Demo

Run the build: [npm build](action:terminal.run?command=npm%20run%20build)

---

# Questions?

Thank you!
```

---

## 6. Key Commands

| Command | Description |
|---------|-------------|
| `Executable Talk: Start Presentation` | Opens presentation view |
| `Executable Talk: Stop Presentation` | Closes presentation |
| `Executable Talk: Next Slide` | Navigate forward |
| `Executable Talk: Previous Slide` | Navigate backward |

### Keyboard Shortcuts (in Presentation View)

| Key | Action |
|-----|--------|
| `→` / `Space` | Next slide |
| `←` | Previous slide |
| `Home` | First slide |
| `End` | Last slide |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Escape` | Close presentation |

---

## 7. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Webview (Presentation UI)              │
│   Renders Markdown slides, handles keyboard, shows actions  │
└──────────────────────────┬──────────────────────────────────┘
                           │ postMessage
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Conductor Layer                          │
│   Orchestrates navigation, manages state stack, delegates   │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │ Action       │ │ Parser       │ │ State Stack  │
   │ Registry     │ │ (gray-matter)│ │ (Undo/Redo)  │
   └──────────────┘ └──────────────┘ └──────────────┘
          │
          ▼
   ┌──────────────────────────────────────────────────────────┐
   │                    VS Code API Layer                      │
   │   window.createWebviewPanel, workspace.openTextDocument   │
   │   window.createTerminal, debug.startDebugging             │
   └──────────────────────────────────────────────────────────┘
```

---

## 8. Constitution Principles

This extension follows 5 core principles. See `.specify/memory/constitution.md`:

1. **Three-Layer Architecture** - Webview → Conductor → VS Code API
2. **Stateful Demo Management** - Every action captures state for undo
3. **Action Registry Compliance** - All actions go through the registry
4. **Test-First Development** - Write tests before implementation
5. **Presentation-First UX** - Never disrupt the presentation flow

---

## 9. Common Tasks

### Add a New Action Type

1. Create `src/actions/MyNewExecutor.ts` implementing `ActionExecutor`
2. Register in `src/actions/ActionRegistry.ts`
3. Add unit tests in `test/unit/actions/MyNewExecutor.test.ts`
4. Update action link parser if new syntax needed

### Modify Slide Rendering

1. Edit Webview assets in `src/webview/assets/`
2. Update `WebviewProvider.ts` for new message types
3. Add CSS in `src/webview/assets/presentation.css`

### Debug Message Flow

1. Enable verbose logging: Set `executableTalk.verbose: true` in settings
2. Open Output panel, select "Executable Talk" channel
3. All messages logged with timestamps

---

## 10. Troubleshooting

### Extension Not Activating

- Check VS Code version (1.85+ required)
- Verify `.deck.md` file exists in workspace
- Check Output panel for errors

### Actions Not Executing

- Verify workspace is trusted (File → Trust Workspace)
- Check action syntax in `.deck.md` file
- Look for errors in Output panel

### Build Errors

```bash
# Clean and rebuild
npm run clean
npm run compile
```

---

## Need Help?

- Check [specs/001-core-extension-mvp/spec.md](./spec.md) for requirements
- Review [contracts/](./contracts/) for interface specifications
- Consult [research.md](./research.md) for VS Code API details
