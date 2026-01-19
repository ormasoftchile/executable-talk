# Executable Talk

Transform your Markdown presentations into live coding demonstrations with VS Code integration.

## Features

- **Navigate Slides**: Use arrow keys to navigate between slides in a full-screen presentation view
- **Execute Actions**: Click on action links to open files, highlight code, run terminal commands, or start debug sessions
- **Undo/Redo**: Recover from demo failures by undoing IDE changes with `Cmd+Z` / `Ctrl+Z`
- **Zen Mode**: Presentations automatically enter distraction-free Zen Mode
- **Presenter View**: Open speaker notes and next slide preview on a secondary panel
- **Workspace Trust**: Actions that execute code require Workspace Trust for security

## Getting Started

### Create a Presentation

Create a file with the `.deck.md` extension:

```markdown
---
title: My First Presentation
author: Your Name
---

# Welcome to Executable Talk

This is your first slide!

---

## Opening a File

Click the action link to see it in action:

[Open Main File](action:file.open?file=src/main.ts)

---

## Highlighting Code

Draw attention to specific lines:

[Highlight the function](action:editor.highlight?file=src/main.ts&lines=5-10)

---
notes: Remember to explain the architecture diagram!
---

## Running Commands

Execute terminal commands during your demo:

[Install Dependencies](action:terminal.run?command=npm%20install)

---

## Debugging

Start a debug session:

[Launch Debugger](action:debug.start?config=Launch%20Program)

```

### Start a Presentation

1. Open a `.deck.md` file in VS Code
2. Press `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
3. Run `Executable Talk: Start Presentation`

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `→` or `Space` | Next slide |
| `←` or `Backspace` | Previous slide |
| `Home` | First slide |
| `End` | Last slide |
| `Cmd+Z` / `Ctrl+Z` | Undo IDE changes |
| `Cmd+Shift+Z` / `Ctrl+Y` | Redo IDE changes |
| `Escape` | Exit presentation |

### Commands

| Command | Description |
|---------|-------------|
| `Executable Talk: Start Presentation` | Open the current `.deck.md` file as a presentation |
| `Executable Talk: Stop Presentation` | Close the presentation and restore IDE state |
| `Executable Talk: Reset Presentation` | Reset to the first slide and clear all changes |
| `Executable Talk: Next Slide` | Navigate to the next slide |
| `Executable Talk: Previous Slide` | Navigate to the previous slide |
| `Executable Talk: Open Presenter View` | Show speaker notes and next slide preview |

## Action Reference

### `file.open`

Opens a file in the editor.

```markdown
[Open File](action:file.open?file=path/to/file.ts)
```

| Parameter | Description | Required |
|-----------|-------------|----------|
| `file` | Relative path to the file | Yes |

### `editor.highlight`

Highlights specific lines in a file.

```markdown
[Highlight Code](action:editor.highlight?file=path/to/file.ts&lines=5-10)
```

| Parameter | Description | Required |
|-----------|-------------|----------|
| `file` | Relative path to the file | Yes |
| `lines` | Line range (e.g., `5-10` or `5`) | Yes |

### `terminal.run`

Runs a command in the integrated terminal. **Requires Workspace Trust.**

```markdown
[Run Command](action:terminal.run?command=npm%20test)
```

| Parameter | Description | Required |
|-----------|-------------|----------|
| `command` | URL-encoded command to execute | Yes |

### `debug.start`

Starts a debug session. **Requires Workspace Trust.**

```markdown
[Start Debugging](action:debug.start?config=Launch%20Program)
```

| Parameter | Description | Required |
|-----------|-------------|----------|
| `config` | Name of the launch configuration | Yes |

### `sequence`

Executes multiple actions in order.

```markdown
[Demo Flow](action:sequence?actions=file.open%3Ffile%3Dsrc/main.ts,editor.highlight%3Ffile%3Dsrc/main.ts%26lines%3D1-5)
```

| Parameter | Description | Required |
|-----------|-------------|----------|
| `actions` | Comma-separated list of URL-encoded actions | Yes |

## Speaker Notes

Add speaker notes to any slide using the `notes` field in YAML frontmatter:

```markdown
---
notes: |
  Key points to cover:
  - Explain the architecture
  - Show the demo
  - Answer questions
---

# Slide Title

Slide content goes here...
```

View speaker notes by running `Executable Talk: Open Presenter View`.

## Workspace Trust

For security, actions that execute code (`terminal.run` and `debug.start`) require [Workspace Trust](https://code.visualstudio.com/docs/editor/workspace-trust). When opening a presentation with executable actions in an untrusted workspace:

1. You'll be prompted to confirm before proceeding
2. Actions requiring trust will show as blocked
3. You can still use `file.open` and `editor.highlight` actions

## Requirements

- VS Code 1.85.0 or higher
- Workspace Trust enabled for `terminal.run` and `debug.start` actions

## Extension Settings

This extension does not contribute any settings.

## Known Issues

- Multi-monitor presenter view requires manual command execution (no automatic detection)
- Zen Mode state detection is approximate

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

MIT

---

Made with ❤️ for live coding presentations
