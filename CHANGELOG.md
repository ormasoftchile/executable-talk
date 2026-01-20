# Changelog

All notable changes to the Executable Talk extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
