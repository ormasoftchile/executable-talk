# Executable Talk

Transform your Markdown presentations into live coding demonstrations with VS Code integration.

## Features

- **Navigate Slides**: Use arrow keys to navigate between slides in a full-screen presentation view
- **Fragment Animations**: Reveal bullet points one at a time with PowerPoint-like animations
- **Execute Actions**: Click on action links to open files, highlight code, run terminal commands, or start debug sessions
- **Dynamic Content**: Embed live file contents, command output, and git diffs directly in your slides
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

[Open Main File](action:file.open?path=src/main.ts)

---

## Highlighting Code

Draw attention to specific lines:

[Highlight the function](action:editor.highlight?path=src/main.ts&lines=5-10)

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
| `→` or `Space` | Next fragment or next slide |
| `←` or `Backspace` | Previous fragment or previous slide |
| `Shift+→` | Skip fragments, go to next slide |
| `Shift+←` | Skip fragments, go to previous slide |
| `Home` | First slide |
| `End` | Last slide |
| `Cmd+Z` / `Ctrl+Z` | Undo IDE changes |
| `Cmd+Shift+Z` / `Ctrl+Y` | Redo IDE changes |
| `Escape` | Exit presentation |

### Floating Toolbar

A floating toolbar appears in the bottom-right corner when you hover over the presentation. It provides quick access to VS Code workspace toggles:

| Icon | Action |
|------|--------|
| ◧ | Toggle Sidebar |
| ◫ | Toggle Panel |
| ⌨ | Toggle Terminal |
| ☰ | Toggle Activity Bar |
| ⛶ | Toggle Zen Mode |

### Commands

| Command | Description |
|---------|-------------|
| `Executable Talk: Start Presentation` | Open the current `.deck.md` file as a presentation |
| `Executable Talk: Stop Presentation` | Close the presentation and restore IDE state |
| `Executable Talk: Reset Presentation` | Reset to the first slide and clear all changes |
| `Executable Talk: Next Slide` | Navigate to the next slide |
| `Executable Talk: Previous Slide` | Navigate to the previous slide |
| `Executable Talk: Open Presenter View` | Show speaker notes and next slide preview |
| `Executable Talk: Validate Deck` | Run preflight checks on the current `.deck.md` file |

## Action Reference

### `file.open`

Opens a file in the editor.

```markdown
[Open File](action:file.open?path=path/to/file.ts)
```

| Parameter | Description | Required |
|-----------|-------------|----------|
| `path` | Relative path to the file | Yes |

### `editor.highlight`

Highlights specific lines in a file.

```markdown
[Highlight Code](action:editor.highlight?path=path/to/file.ts&lines=5-10)
```

| Parameter | Description | Required |
|-----------|-------------|----------|
| `path` | Relative path to the file | Yes |
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

### `vscode.command`

Executes any VS Code command. **Requires Workspace Trust.**

```markdown
[Open Settings](action:vscode.command?id=workbench.action.openSettings)
```

| Parameter | Description | Required |
|-----------|-------------|----------|
| `id` | VS Code command ID | Yes |
| `args` | URL-encoded JSON arguments | No |

**Examples:**

```markdown
[Open Settings](action:vscode.command?id=workbench.action.openSettings)

[Toggle Sidebar](action:vscode.command?id=workbench.action.toggleSidebarVisibility)

[Search Extensions](action:vscode.command?id=workbench.extensions.search&args=%22python%22)

[Focus Terminal](action:vscode.command?id=workbench.action.terminal.focus)

[Open Keyboard Shortcuts](action:vscode.command?id=workbench.action.openGlobalKeybindings)
```

## Dynamic Content Rendering

### Action Block Syntax (YAML)

In addition to inline action links, you can define actions using readable YAML fenced code blocks. Both syntaxes coexist — use whichever you prefer:

**Before (inline link — URL-encoded):**

```markdown
[Open Main](action:file.open?path=src/main.ts)
```

**After (YAML action block — human-readable):**

````markdown
```action
type: file.open
path: src/main.ts
label: Open Main
```
````

Action blocks support all 6 action types. Here are some examples:

````markdown
```action
type: editor.highlight
path: src/main.ts
lines: 5-10
```
````

````markdown
```action
type: terminal.run
command: npm test
label: Run Tests
```
````

````markdown
```action
type: sequence
label: Full Demo
steps:
  - type: file.open
    path: src/main.ts
  - type: editor.highlight
    path: src/main.ts
    lines: 5-10
  - type: terminal.run
    command: npm test
```
````

### Preflight Deck Validation

Before presenting, validate your deck to catch common errors:

1. Press `Cmd+Shift+P` / `Ctrl+Shift+P`
2. Run **Executable Talk: Validate Deck**

The command checks for:
- **Missing files** — referenced file paths that don't exist
- **Out-of-range lines** — highlight ranges exceeding file length
- **Missing debug configurations** — `debug.start` configs not in launch.json
- **Unavailable commands** — terminal commands not found on PATH
- **Trust issues** — actions requiring trust in untrusted workspaces

Results appear as:
- **Inline diagnostics** (squiggly underlines) in the `.deck.md` file
- **Output channel** (Executable Talk Validation) with a detailed log
- **Summary notification** with a link to the Problems panel

### Error Notifications During Presentation

When an action fails during a live presentation, a toast notification appears in the bottom-right corner showing:

- **Action type icon** (📄 file, 🔍 highlight, ▶ terminal, 🐛 debug, 🔗 sequence)
- **Target** (which file, command, or config failed)
- **Error message** (what went wrong)
- **Step breakdown** (for sequences: ✅ success, ❌ failed, ⏭ skipped)

Toasts auto-dismiss after 8 seconds for simple failures. Sequence failures and timeouts persist until manually dismissed. Up to 5 toasts can stack.

### Authoring Assistance

When editing `.deck.md` files, you get full IDE support inside action blocks:

- **Autocomplete**: Type suggestions after `type:`, parameter suggestions scoped to the selected action type, triggered by `:` and `/`
- **Hover documentation**: Hover on action type keywords to see descriptions and parameter tables. Hover on parameter names for type info and allowed values.
- **Real-time diagnostics**: Squiggly underlines for unknown action types (error), missing required parameters (error), unknown parameter keys (warning), and invalid YAML syntax (error)

## Dynamic Content Rendering (Render Directives)

Embed live content directly in your slides using render directives. These are invisible links that get replaced with actual content when the slide is displayed.

### `render:file`

Embed file contents with optional line range.

```markdown
[](render:file?path=src/main.ts&lines=1-20)
```

| Parameter | Description | Required |
|-----------|-------------|----------|
| `path` | Relative path to the file | Yes |
| `lines` | Line range (e.g., `1-20` or `5`) | No |
| `lang` | Language for syntax highlighting | No (auto-detected) |
| `format` | Output format: `code`, `quote`, or `raw` | No (default: `code`) |

**Examples:**

```markdown
# Show the first 10 lines of package.json
[](render:file?path=package.json&lines=1-10)

# Show a specific function with TypeScript highlighting
[](render:file?path=src/utils.ts&lines=25-40&lang=typescript)
```

### `render:command`

Execute a command and embed its output. **Requires Workspace Trust.**

```markdown
[](render:command?cmd=npm%20--version)
```

| Parameter | Description | Required |
|-----------|-------------|----------|
| `cmd` | URL-encoded command to execute | Yes |
| `cwd` | Working directory for the command | No |
| `timeout` | Timeout in milliseconds | No (default: 30000) |
| `format` | Output format: `code`, `json`, or `raw` | No (default: `code`) |
| `cached` | Cache output between renders | No (default: `true`) |

**Examples:**

```markdown
# Show npm version
[](render:command?cmd=npm%20--version)

# List source files
[](render:command?cmd=ls%20-la%20src/)

# Show git status
[](render:command?cmd=git%20status%20--short)
```

### `render:diff`

Show git diffs or file comparisons.

```markdown
[](render:diff?path=src/main.ts&before=HEAD~1)
```

| Parameter | Description | Required |
|-----------|-------------|----------|
| `path` | File to show git diff for | Yes* |
| `before` | Git ref to compare against (e.g., `HEAD~1`, `main`) | No (default: `HEAD`) |
| `after` | Git ref to compare to | No (default: working tree) |
| `left` | Left file for file-to-file diff | Yes* |
| `right` | Right file for file-to-file diff | Yes* |
| `mode` | Display mode: `unified` or `split` | No (default: `unified`) |
| `context` | Number of context lines | No (default: 3) |

*Either `path` OR both `left` and `right` are required.

**Examples:**

```markdown
# Show recent changes to a file
[](render:diff?path=src/main.ts&before=HEAD~3)

# Compare two files
[](render:diff?left=old/config.json&right=new/config.json)

# Show changes since a specific branch
[](render:diff?path=src/feature.ts&before=main)
```

## Fragment Animations

Reveal content step-by-step using fragment markers. Add `<!-- .fragment -->` after any element to make it appear on the next arrow key press:

```markdown
## Key Features

- First point appears <!-- .fragment -->
- Then the second <!-- .fragment -->
- And finally the third! <!-- .fragment -->
```

### Animation Types

Specify an animation style after `.fragment`:

```markdown
- Fade in (default) <!-- .fragment fade -->
- Slide up from below <!-- .fragment slide-up -->
- Slide in from right <!-- .fragment slide-left -->
- Zoom in <!-- .fragment zoom -->
- Dimmed, then highlighted <!-- .fragment highlight -->
```

| Animation | Effect |
|-----------|--------|
| `fade` | Fade in (default) |
| `slide-up` | Slide up from below |
| `slide-left` | Slide in from the right |
| `zoom` | Zoom in from smaller |
| `highlight` | Visible but dimmed, then highlighted |

Fragments work on list items, paragraphs, headings, and block elements. The syntax is compatible with [Reveal.js](https://revealjs.com/fragments/).

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

## Presentation Options

Customize the presentation using the `options` field in the deck frontmatter:

```yaml
---
title: My Presentation
author: Your Name
options:
  toolbar: true                    # Show toolbar (default: true)
  zenMode: true                    # Enter Zen Mode on start (default: true)
  showSlideNumbers: true           # Show slide numbers (default: true)
  showProgress: false              # Show progress bar (default: false)
  fontSize: medium                 # Font size: small, medium, large
  theme: dark                      # Theme: dark, light
---
```

### Toolbar Customization

The floating toolbar can be customized to show only specific buttons:

```yaml
options:
  toolbar:
    - sidebar      # Toggle Sidebar
    - panel        # Toggle Panel
    - terminal     # Toggle Terminal
    - activityBar  # Toggle Activity Bar
    - zenMode      # Toggle Zen Mode
```

Set `toolbar: false` to hide it completely.

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
