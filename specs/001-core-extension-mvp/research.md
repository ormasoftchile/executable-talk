# Research: Executable Talk Core Extension MVP

**Feature**: 001-core-extension-mvp  
**Date**: 2026-01-19  
**Status**: Complete

## Research Tasks

Based on Technical Context unknowns:
1. VS Code Webview API best practices
2. Terminal API and command completion detection
3. Editor decoration lifecycle management
4. Workspace Trust integration patterns
5. Zen Mode programmatic control
6. Markdown + YAML frontmatter parsing libraries

---

## 1. Webview Panel API

### Decision: Use `createWebviewPanel` with `postMessage` protocol

### Rationale
VS Code's Webview API provides a sandboxed browser context ideal for slide rendering. The `postMessage` pattern cleanly separates concerns between the UI and extension host.

### Key Findings

**Panel Creation**:
```typescript
vscode.window.createWebviewPanel(viewType, title, ViewColumn.One, {
  enableScripts: true,
  localResourceRoots: [extensionUri],
  retainContextWhenHidden: false  // Use getState/setState instead
});
```

**Communication Protocol**:
- Extension → Webview: `panel.webview.postMessage({ type, payload })`
- Webview → Extension: `vscode.postMessage({ type, payload })` (via `acquireVsCodeApi()`)
- Extension listens: `panel.webview.onDidReceiveMessage(handler)`

**Content Security Policy** (required):
```html
<meta http-equiv="Content-Security-Policy" 
      content="default-src 'none'; 
               img-src ${webview.cspSource} https:; 
               script-src ${webview.cspSource}; 
               style-src ${webview.cspSource} 'unsafe-inline';">
```

### Alternatives Considered
- **Custom Editor API**: More suited for document editing, overkill for read-only presentation
- **Output Channel**: No HTML rendering capability

### Gotchas
- `acquireVsCodeApi()` can only be called once per Webview lifecycle
- Cannot send messages to hidden Webviews even with `retainContextWhenHidden`
- Setting `webview.html` causes full reload (use postMessage for updates)

---

## 2. Terminal API

### Decision: Use Shell Integration API with `sendText()` fallback

### Rationale
Shell Integration (VS Code 1.71+) provides reliable command completion detection. However, it requires user shell support, so a fallback is necessary.

### Key Findings

**Terminal Management**:
```typescript
// Find or create terminal
const terminal = vscode.window.terminals.find(t => t.name === name) 
  ?? vscode.window.createTerminal({ name });

// Execute with completion detection (when available)
if (terminal.shellIntegration) {
  const execution = terminal.shellIntegration.executeCommand(command);
  // Listen for completion via onDidEndTerminalShellExecution
} else {
  terminal.sendText(command, true);
  // No completion detection - use timeout-based approach
}
```

**Completion Detection**:
```typescript
vscode.window.onDidEndTerminalShellExecution(event => {
  if (event.terminal === terminal) {
    const exitCode = event.exitCode; // undefined if canceled
  }
});
```

### Alternatives Considered
- **Tasks API**: Better for build workflows, not ad-hoc commands
- **Child Process**: Runs outside VS Code's terminal, poor UX

### Gotchas
- Shell integration requires user to have it enabled (default in recent VS Code)
- `exitCode` can be `undefined` (command canceled, running in subshell)
- Terminal names are not unique - use creation tracking

---

## 3. Editor Decorations

### Decision: Reusable `TextEditorDecorationType` with slide-scoped lifecycle

### Rationale
Decorations should persist for the duration of a slide and be cleanly removed on slide exit. Creating one decoration type per style and reusing it is memory-efficient.

### Key Findings

**Decoration Lifecycle**:
```typescript
// Create once per style
const highlightType = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(255, 255, 0, 0.3)',
  isWholeLine: true
});

// Apply to specific lines
const ranges = lines.map(line => new vscode.Range(line, 0, line, 0));
editor.setDecorations(highlightType, ranges);

// Remove by passing empty array
editor.setDecorations(highlightType, []);

// Full cleanup
highlightType.dispose();
```

**Theme Support**:
```typescript
{
  light: { backgroundColor: 'rgba(255, 255, 0, 0.3)' },
  dark: { backgroundColor: 'rgba(255, 255, 0, 0.2)' }
}
```

### Alternatives Considered
- **CodeLens**: Wrong semantic (for inline actions, not highlighting)
- **Diagnostics**: Semantic is for errors/warnings

### Gotchas
- Decorations are per-editor instance, not per-document
- Must re-apply on `onDidChangeActiveTextEditor` if document reopened
- `dispose()` removes from ALL editors using that type

---

## 4. Workspace Trust Integration

### Decision: Check `workspace.isTrusted` before action execution; declare `"supported": "limited"`

### Rationale
Terminal execution is dangerous in untrusted workspaces. The Workspace Trust API provides a standard pattern users expect.

### Key Findings

**Trust Check**:
```typescript
if (!vscode.workspace.isTrusted) {
  vscode.window.showWarningMessage(
    'Terminal actions disabled in untrusted workspace'
  );
  return;
}
```

**Manifest Declaration** (package.json):
```json
{
  "capabilities": {
    "untrustedWorkspaces": {
      "supported": "limited",
      "description": "Terminal and debug actions require a trusted workspace"
    }
  }
}
```

**React to Trust Changes**:
```typescript
vscode.workspace.onDidGrantWorkspaceTrust(() => {
  // Re-enable restricted features
});
```

### Alternatives Considered
- **Custom permission system**: Reinvents the wheel, users already understand Workspace Trust

### Gotchas
- Event only fires when trust is **granted**, not on entering untrusted workspace
- Trust is workspace-scoped, not folder-scoped

---

## 5. Zen Mode Control

### Decision: Use `workbench.action.toggleZenMode` command

### Rationale
VS Code exposes Zen Mode as a command, making programmatic control straightforward.

### Key Findings

**Toggle Zen Mode**:
```typescript
await vscode.commands.executeCommand('workbench.action.toggleZenMode');
```

**Zen Mode hides**: Activity Bar, Status Bar, Side Bar, Panel, and enters fullscreen.

**Exit**: User can exit with double `Escape` press.

### Alternatives Considered
- **Manual panel hiding**: More complex, less complete, user expectations differ

### Gotchas
- **No API to detect current Zen Mode state** - track internally with boolean flag
- **No event for Zen Mode changes** - user can exit manually; extension must handle gracefully
- Command is a **toggle** - calling twice exits; track state to avoid double-toggle

---

## 6. Markdown + YAML Frontmatter Parsing

### Decision: Use `gray-matter` for frontmatter + `markdown-it` for Markdown rendering

### Rationale
- `gray-matter`: Purpose-built for frontmatter extraction, clean API
- `markdown-it`: Same library VS Code uses internally, fast, extensible

### Key Findings

**Parsing Pipeline**:
```typescript
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';

function parseDeck(content: string): Deck {
  const slides = content.split(/\n---\n/);
  return slides.map(slideContent => {
    const { data: frontmatter, content: markdown } = matter(slideContent);
    const md = new MarkdownIt();
    return {
      frontmatter,
      html: md.render(markdown)
    };
  });
}
```

**TypeScript Types**:
- `@types/gray-matter` available
- `@types/markdown-it` available

### Alternatives Considered
- **remark/unified**: More powerful but heavier, overkill for simple rendering
- **marked**: Less extensible, frontmatter handling requires manual work

### Gotchas
- Must bundle libraries (not require from VS Code runtime)
- Use esbuild/webpack for smaller extension size
- First slide may have deck-level frontmatter (title, author) vs slide-level

---

## Summary: Technology Decisions

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Slide UI | VS Code Webview + CSP | Sandboxed, HTML/CSS/JS capable |
| Communication | postMessage protocol | Clean async boundary |
| Presentation Mode | Zen Mode toggle | Native, user-familiar |
| Markdown Parsing | gray-matter + markdown-it | Proven, VS Code-compatible |
| Terminal Execution | Shell Integration + sendText fallback | Completion detection when available |
| Decorations | TextEditorDecorationType | Efficient, theme-aware |
| Security | Workspace Trust API | Standard pattern |
| Bundling | esbuild | Fast, tree-shaking |

---

## Open Questions Resolved

All Technical Context items resolved. No NEEDS CLARIFICATION remaining.
