# Changelog

All notable changes to the Executable Talk extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-02-08

### Added

- **Non-Linear Navigation** (US1): Jump to any slide during Q&A without sequential clicking
  - Slide picker overlay (`Ctrl+G` / `Cmd+G`) with search, filter, and keyboard navigation
  - Jump-by-number input: type digit keys + Enter to go directly to a slide
  - Go back (`Alt+Left`) returns to the previously viewed slide, not the sequentially previous one
  - Navigation history stack (50-entry FIFO) tracks all slide visits

- **Scene Checkpoints** (US2): Save and restore complete IDE state as named scenes
  - Save scene (`Ctrl+S` / `Cmd+S`): captures open files, cursor positions, terminals, and active slide
  - Restore scene (`Ctrl+R` / `Cmd+R`): returns IDE to the exact saved state
  - Scene picker overlay with search, keyboard navigation, and delete support
  - Up to 20 runtime-saved scenes per session; overwriting by name does not count against limit
  - Partial restore: skips missing files/terminals and shows a non-blocking warning summary
  - Pre-authored scene anchors in deck YAML frontmatter (read-only, available on presentation open)

- **Cross-Platform Commands** (US3): Terminal commands that adapt to the presenter's OS
  - Platform command map: `command: { macos: "...", windows: "...", linux: "...", default: "..." }`
  - Automatic OS detection and command resolution at execution time
  - Path placeholders: `${pathSep}`, `${home}`, `${shell}`, `${pathDelimiter}`
  - Preflight validation warns about missing platform coverage for the current OS

- **Navigation History Trail** (US4): Breadcrumb trail of visited slides
  - Visual breadcrumb bar at the bottom of the presentation (up to 10 recent entries)
  - Icons for navigation method: → sequential, ⤳ jump, ← go-back, 📌 scene restore
  - Click any breadcrumb to jump to that slide
  - Semi-transparent, fades in on hover to stay unobtrusive

- **Pre-Authored Scene Anchors** (US5): Define scene checkpoints declaratively in frontmatter
  - `scenes: [{ name: "intro", slide: 1 }, { name: "live-demo", slide: 8 }]`
  - Authored scenes appear in scene picker labeled "authored" (listed first, alphabetically sorted)
  - Restoring an authored scene navigates to the anchored slide and executes onEnter actions
  - Authored scenes are read-only: cannot be overwritten or deleted

- **Authoring enhancements**:
  - Autocomplete for `scenes` frontmatter properties (`name`, `slide`)
  - Hover documentation for `scenes`, `name`, and `slide` in frontmatter
  - ARIA roles and labels on all overlay components (slide picker, scene picker, breadcrumb trail, toast)

- **New commands**: `Go to Slide`, `Save Scene`, `Restore Scene`
- **New keybindings**: `Ctrl+G`, `Ctrl+S`, `Ctrl+R` (scoped to presentation Webview)
- **New example deck**: `examples/cross-platform.deck.md` showcasing all new features

## [0.2.0] - 2026-02-07

### Added

- **YAML Action Block Syntax** (US1): Human-readable fenced code blocks as an alternative to URL-encoded inline action links
  - Use `` ```action `` fences with YAML content (type, params, label)
  - All 6 action types supported: `file.open`, `editor.highlight`, `terminal.run`, `debug.start`, `sequence`, `vscode.command`
  - Both syntaxes coexist — inline links and YAML blocks work side by side
  - Parse errors reported at deck level without blocking presentation loading

- **Preflight Deck Validation** (US2): Validate entire deck before presenting
  - New command: `Executable Talk: Validate Deck` (`executableTalk.validateDeck`)
  - File path validation — checks referenced files exist
  - Line range validation — checks highlight ranges don't exceed file length
  - Debug config validation — verifies launch configurations exist
  - Command availability check — warns when terminal commands not found on PATH
  - Trust status check — warns about trust-requiring actions in untrusted workspaces
  - Results shown as inline diagnostics, output channel log, and summary notification

- **Error Feedback Toasts** (US3): Non-blocking error notifications during live presentations
  - Toast notifications for action failures with type icon, target, and error message
  - Sequence failure detail showing per-step breakdown (✅/❌/⏭)
  - Auto-dismiss after 8s for simple failures; sequence and timeout errors persist
  - Up to 5 toasts stacked, oldest auto-dismissible evicted on overflow
  - Smooth entry/exit animations, hover pauses auto-dismiss timer

- **Authoring Assistance** (US4): Full IDE support when writing action blocks
  - Autocomplete for action types and parameters (scoped to selected type)
  - Hover documentation with descriptions, parameter tables, and allowed values
  - Real-time diagnostics for unknown types, missing required params, unknown keys, and invalid YAML

## [0.1.28] - 2026-01-21

### Added

- **Skip Fragments Navigation**: Jump directly to previous/next slide without stepping through fragments
  - Press `Shift+←` or `Shift+Backspace` to go directly to previous slide
  - Press `Shift+→` or `Shift+Space` to go directly to next slide
  - Regular arrow keys still navigate fragment-by-fragment

## [0.1.10] - 2026-01-20

### Added

- **Fragment Animations**: Reveal content step-by-step like PowerPoint
  - Use `<!-- .fragment -->` syntax after any element
  - Animation types: fade, slide-up, slide-left, zoom, highlight
  - Arrow keys reveal/hide fragments before advancing slides
  - Going back shows all fragments visible on previous slide
  - Reveal.js compatible syntax for easy migration

- **Theme Support**: Light and dark theme options
  - Set `theme: light` or `theme: dark` in frontmatter
  - Proper styling for all elements in both themes

- **Font Size Options**: Configurable presentation font size
  - Set `fontSize: small`, `medium`, or `large` in frontmatter

## [0.1.9] - 2026-01-20

### Added

- **Floating Toolbar**: Quick-access toolbar in presentation view
  - Toggle Sidebar visibility
  - Toggle Panel visibility
  - Toggle Terminal
  - Toggle Activity Bar
  - Toggle Zen Mode
  - Appears on hover, positioned bottom-right

## [0.1.7] - 2026-01-20

### Added

- **Dynamic Content Rendering**: Embed live content in slides
  - `render:file` - Embed file contents with optional line ranges
  - `render:command` - Execute commands and display output (streaming)
  - `render:diff` - Show git diffs with syntax highlighting

- **VS Code Command Action**: Execute any VS Code command
  - `action:vscode.command?id=workbench.action.openSettings`
  - Supports optional JSON arguments
  - Requires Workspace Trust for security

### Fixed

- Fixed `&` character encoding issue in render directive URLs

## [0.1.0] - 2025-01-15

### Added

- **Slide Navigation**: Full-screen presentation mode with keyboard navigation
  - Arrow keys, Space/Backspace for next/previous
  - Home/End for first/last slide
  - Escape to exit presentation

- **Action System**: Execute IDE actions from presentation links
  - `file.open` - Open files in the editor
  - `editor.highlight` - Highlight specific code lines with decorations
  - `terminal.run` - Run terminal commands (requires Workspace Trust)
  - `debug.start` - Start debug sessions (requires Workspace Trust)
  - `sequence` - Execute multiple actions in order

- **State Management**: Undo/redo IDE state during presentations
  - Tracks open editors, terminals, and decorations
  - `Cmd+Z` / `Ctrl+Z` to undo
  - `Cmd+Shift+Z` / `Ctrl+Y` to redo
  - 50-snapshot history limit

- **Zen Mode Integration**: Automatic distraction-free presentation mode
  - Auto-enters Zen Mode when presentation starts
  - Restores previous layout on exit
  - Respects user's existing Zen Mode state

- **Presenter View**: Secondary panel with speaker notes
  - Real-time clock display
  - Current slide preview
  - Next slide preview
  - Speaker notes from YAML frontmatter
  - Synced with main presentation

- **Security**: Workspace Trust integration
  - First-use confirmation for executable actions
  - Graceful handling of untrusted workspaces
  - Clear indication of blocked actions

- **File Format**: `.deck.md` Markdown presentation files
  - YAML frontmatter for metadata
  - `---` delimiter between slides
  - Markdown content with action links
  - Speaker notes via `notes` field

### Commands

- `Executable Talk: Start Presentation` - Open `.deck.md` as presentation
- `Executable Talk: Stop Presentation` - Close and restore IDE state
- `Executable Talk: Reset Presentation` - Reset to first slide
- `Executable Talk: Next Slide` - Navigate forward
- `Executable Talk: Previous Slide` - Navigate backward
- `Executable Talk: Open Presenter View` - Show speaker notes panel

### Technical

- Three-layer architecture: Webview → Conductor → VS Code API
- PostMessage protocol for webview communication
- ActionRegistry for extensible action execution
- SnapshotFactory for IDE state capture/restore

## [Unreleased]

### Planned

- Keyboard shortcut customization
- Custom themes for presentation view
- Export to standalone HTML
- Animation and transition effects
- Code execution output display
- Remote presentation sharing
