# Research: Non-Linear Navigation, Scenes & Cross-Platform Commands

**Feature**: 005-nonlinear-nav-scenes  
**Date**: 2026-02-07  
**Status**: Complete

---

## 1. VS Code Terminal API — Restore at Working Directory

**Decision**: Dispose existing terminal and recreate with `createTerminal({ name, cwd })` for scene restore.

**Rationale**: The `TerminalOptions.cwd` property reliably sets the initial working directory across all platforms. There is no API to change a terminal's cwd after creation, so the cleanest restore pattern is dispose + recreate. This aligns with the spec decision that commands are NOT replayed on restore.

**Alternatives Considered**:
- `terminal.sendText("cd /path")` — fragile, shell-dependent, creates scrollback noise
- Reuse existing terminal — no API to change cwd; presenter would see stale state

**Key Findings**:
- `cwd` accepts both `string` and `Uri` — prefer `Uri` for cross-platform safety
- `terminal.shellIntegration?.cwd` (read-only) can query the current working directory of a terminal, but only when shell integration has activated (1–3 second delay after creation)
- Use `vscode.window.onDidChangeTerminalShellIntegration` to detect when shell integration becomes available
- Existing `terminalRunExecutor.ts` already uses `createTerminal({ name, cwd })` — the pattern is established

---

## 2. VS Code Editor State Capture — Cursor & Scroll Position

**Decision**: Extend `EditorState` in `snapshot.ts` with `cursorPosition` and use `editor.selection` (write) + `editor.revealRange()` for restore.

**Rationale**: The existing `EditorState` captures `visibleRange` but not cursor position per editor. Scenes need richer state to feel like "instant recovery."

**Alternatives Considered**:
- Capture only file paths + viewColumn (simpler, but loses cursor context — feels incomplete to presenter)
- Capture full multi-cursor `selections[]` array (over-engineered for presentation use)

**Key Findings**:
- `TextEditor.selection` is **read-write** — can set cursor directly after `showTextDocument()`
- `TextEditor.visibleRanges` is **read-only** — use `editor.revealRange(range, TextEditorRevealType.AtTop)` to restore scroll
- Restore sequence: (1) `showTextDocument(uri, { viewColumn, preview: false })` → (2) `editor.selection = new Selection(...)` → (3) `editor.revealRange(..., AtTop)`
- Existing `snapshotFactory.ts` captures `visibleRange` in the editor loop — adding cursor capture is a one-line addition: `editor.selection.active.line` + `.character`

---

## 3. VS Code Webview Keyboard Events — Shortcut Binding Strategy

**Decision**: Primary: `contributes.keybindings` in `package.json` with `when: "activeWebviewPanelId == 'executableTalkPresentation'"`. Secondary: also handle in Webview JS as fallback.

**Rationale**: VS Code intercepts standard shortcuts like `Ctrl+S` and `Ctrl+G` before they reach the Webview iframe. The only reliable way to override them is through the `contributes.keybindings` system with a `when` clause scoping them to the active presentation panel.

**Alternatives Considered**:
- Webview-only interception — fails because VS Code captures `Ctrl+S/G/R` before the Webview sees them
- Custom context key (`executableTalk.presentationActive`) — works but `activeWebviewPanelId` is a built-in key that already provides this

**Key Findings**:
- The `when` clause `activeWebviewPanelId == 'executableTalkPresentation'` matches the `viewType` string used in `createWebviewPanel()` — already `'executableTalkPresentation'` in the codebase
- Three new commands must be registered: `executableTalk.goToSlide`, `executableTalk.saveScene`, `executableTalk.restoreScene`
- Each command handler sends a `postMessage` to the Webview to trigger the overlay, OR handles the logic on the extension host side and sends results back
- Set custom context `executableTalk.presentationActive` via `panel.onDidChangeViewState` for additional `when` clause flexibility
- No existing keybindings in `package.json` — all current navigation is Webview-internal via `keydown` listeners

---

## 4. Cross-Platform OS Detection

**Decision**: Use `process.platform` with mapping `'darwin'→'macos'`, `'win32'→'windows'`, `'linux'→'linux'`, else→`'default'`.

**Rationale**: `process.platform` is always available in the extension host (Node.js process). The mapping from Node.js identifiers to human-readable keys aligns with the deck frontmatter syntax.

**Alternatives Considered**:
- `os.platform()` — identical result to `process.platform`, extra import for no benefit
- `vscode.env.uiKind` — distinguishes desktop vs web, but doesn't provide OS info
- `when` clause keys (`isWindows`, `isMac`, `isLinux`) — only available in `when` clauses, not in code

**Key Findings**:

| `process.platform` | Deck key | Path separator | Path delimiter |
|---------------------|----------|----------------|----------------|
| `'darwin'` | `macos` | `/` | `:` |
| `'win32'` | `windows` | `\` | `;` |
| `'linux'` | `linux` | `/` | `:` |

**Placeholder resolution** (FR-018):

| Placeholder | Resolution |
|-------------|-----------|
| `${pathSep}` | `path.sep` (`\` or `/`) |
| `${home}` | `os.homedir()` |
| `${shell}` | `vscode.env.shell` |
| `${pathDelimiter}` | `path.delimiter` (`;` or `:`) |

- Existing codebase already uses `process.platform === 'win32'` in `terminalRunExecutor.ts` (for `cls` vs clear) — pattern is established
- `vscode.env.shell` gives the detected default shell string

---

## 5. Webview Overlay/Modal Pattern for Slide Picker

**Decision**: Fixed-position `<div>` overlay with backdrop, styled using VS Code CSS custom properties (`--vscode-*`), matching the Quick Pick visual idiom.

**Rationale**: An in-page overlay maintains the presentation context (current slide visible behind backdrop), supports instant show/hide without re-render, and matches the VS Code UX pattern presenters already know.

**Alternatives Considered**:
- VS Code Quick Pick dialog (`showQuickPick()`) — leaves the Webview, breaks immersion, presenter sees the standard VS Code UI instead of the presentation
- Full page replacement (slide picker replaces the current slide) — loses context of where the presenter is, requires re-rendering the slide on dismiss
- Separate Webview panel — over-engineered, focus management complexity

**Key Findings**:
- Use CSS `position: fixed`, `z-index: 1000`, `background: var(--vscode-widget-shadow)` for the backdrop
- Use `var(--vscode-quickInput-background)` and `var(--vscode-quickInput-foreground)` for the picker panel to match VS Code's Quick Pick styling
- Focus trapping: when overlay opens, `.focus()` the search input; on Escape, hide overlay and return focus to presentation
- Keyboard handling: prevent `ArrowUp/Down` and `Escape` from propagating to slide navigation while overlay is open
- Reuse the overlay component for both slide picker (Ctrl+G) and scene picker (Ctrl+R) with different content modes
- Avoid `backdrop-filter: blur()` — can cause jank on low-end machines during live presentations. A simple semi-transparent background is safer.
