# Quickstart: 005-nonlinear-nav-scenes

**Feature**: Non-Linear Navigation, Scenes & Cross-Platform Commands  
**Branch**: `005-nonlinear-nav-scenes`

## Prerequisites

- VS Code 1.85+
- Node.js 18+
- The repository cloned and on the `005-nonlinear-nav-scenes` branch

## Setup

```bash
# Clone and switch to branch
git clone https://github.com/ormasoftchile/executable-talk.git
cd executable-talk
git checkout 005-nonlinear-nav-scenes

# Install dependencies
npm install

# Compile
npm run compile
```

## Run the Extension

1. Open the repo in VS Code
2. Press `F5` to launch the Extension Development Host
3. In the Extension Development Host window, open a `.deck.md` file
4. Run command: `Executable Talk: Start Presentation`

## Test

```bash
# Run all unit tests
npm test

# Run specific test suites (when implemented)
npm test -- --grep "SceneStore"
npm test -- --grep "NavigationHistory"
npm test -- --grep "PlatformResolver"
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/conductor/conductor.ts` | Add `goto` direction handling, scene commands, history tracking |
| `src/conductor/sceneStore.ts` | **NEW** — Named scene checkpoint storage |
| `src/conductor/navigationHistory.ts` | **NEW** — Breadcrumb navigation history |
| `src/actions/terminalRunExecutor.ts` | Platform map resolution before `sendText()` |
| `src/actions/platformResolver.ts` | **NEW** — OS detection + command selection + placeholder expansion |
| `src/models/deck.ts` | Add `SceneDefinition[]` to `DeckMetadata` |
| `src/models/snapshot.ts` | Add `cursorPosition` to `EditorState` |
| `src/parser/deckParser.ts` | Parse `scenes` from deck frontmatter |
| `src/validation/preflightValidator.ts` | Add cross-platform coverage check |
| `src/webview/messages.ts` | Add new message types |
| `src/webview/messageHandler.ts` | Route new message types |
| `src/webview/assets/presentation.js` | Slide picker overlay, scene picker, history breadcrumb |
| `src/webview/assets/presentation.css` | Overlay styles, breadcrumb styles |
| `src/extension.ts` | Register `goToSlide`, `saveScene`, `restoreScene` commands |
| `package.json` | Add keybindings and commands |

## Key Files to Create (Tests)

| File | Tests |
|------|-------|
| `test/unit/conductor/sceneStore.test.ts` | SceneStore save/restore/limit/clear |
| `test/unit/conductor/navigationHistory.test.ts` | Push/goBack/cap/clear |
| `test/unit/actions/platformResolver.test.ts` | OS detection, map resolution, placeholders |
| `test/unit/parser/crossPlatformParsing.test.ts` | PlatformCommandMap parsing from YAML |
| `test/integration/nonLinearNavigation.test.ts` | Slide picker → goto → slideChanged |
| `test/integration/sceneRestore.test.ts` | Save → modify → restore → verify |

## Architecture Reference

```
Webview (Presentation UI)
    │ postMessage protocol
    │ - navigate (goto), goBack, saveScene, restoreScene
    │ - openSlidePicker, openScenePicker (from host)
    ▼
Conductor Layer (Orchestration)
    │
    ├── NavigationHistory (breadcrumb trail, go-back stack)
    ├── SceneStore (named checkpoints, 20 cap)
    ├── StateStack (unchanged: undo/redo, 50 max)
    ├── SnapshotFactory (extended: cursor + partial restore)
    └── PlatformResolver (OS detection, command selection)
    │
    ▼
VS Code API Layer (window, workspace, terminal)
    - terminalRunExecutor (extended: platform map → resolved command)
```

## Keyboard Shortcuts (Webview-scoped)

| Shortcut | Command | Behavior |
|----------|---------|----------|
| `Ctrl+G` / `Cmd+G` | `executableTalk.goToSlide` | Opens slide picker overlay |
| `Ctrl+S` / `Cmd+S` | `executableTalk.saveScene` | Opens scene name input |
| `Ctrl+R` / `Cmd+R` | `executableTalk.restoreScene` | Opens scene picker overlay |
| `Alt+Left` | *(Webview keydown)* | Go back to previously viewed slide |
| Digit keys + Enter | *(Webview keydown)* | Jump to slide by number |

## Spec Reference

- [spec.md](spec.md) — Full feature specification
- [research.md](research.md) — VS Code API research findings
- [data-model.md](data-model.md) — Entity definitions
- [contracts/navigation-protocol.md](contracts/navigation-protocol.md) — Message protocol extensions
- [contracts/scene-store.md](contracts/scene-store.md) — Scene store interface
- [contracts/platform-resolver.md](contracts/platform-resolver.md) — Cross-platform command resolution
