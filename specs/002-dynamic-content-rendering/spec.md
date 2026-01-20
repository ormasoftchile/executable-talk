# Feature Specification: Dynamic Content Rendering

**Feature Branch**: `002-dynamic-content-rendering`  
**Created**: 2026-01-20  
**Status**: Draft  
**Input**: Extend Executable Talk with live file content and command output embedding in slides

## Overview

Enable slides to dynamically render file contents and command outputs directly in the presentation, eliminating the need for static code blocks that become stale.

---

## User Scenarios & Testing

### User Story 1 - Render File Content in Slides (Priority: P1)

As a technical presenter, I want to embed a range of lines from a source file directly into my slide so that the code shown is always up-to-date with the actual implementation.

**Why this priority**: Static code blocks in presentations quickly become outdated. Dynamic embedding ensures the demo always reflects the real codebase.

**Acceptance Scenarios**:

1. **Given** a slide with `[](render:file?path=src/app.ts&lines=10-20)`, **When** the slide renders, **Then** lines 10-20 of `src/app.ts` appear in a syntax-highlighted code block
2. **Given** a slide with `[](render:file?path=src/app.ts&start=function%20main&end=^})`, **When** the slide renders, **Then** content from "function main" to the next `}` at line start is displayed
3. **Given** a render:file reference to a non-existent file, **When** the slide renders, **Then** an error message is shown inline (not a modal)
4. **Given** a slide with `[](render:file?path=README.md&lines=1-5&format=quote)`, **When** rendered, **Then** the content appears as a blockquote instead of a code block

---

### User Story 2 - Render Command Output in Slides (Priority: P1)

As a technical presenter, I want to execute a command and display its output in my slide so that I can show live results (test output, API responses, build status) without switching context.

**Why this priority**: Showing live command output is a common demo pattern. Embedding it in slides keeps the audience focused.

**Acceptance Scenarios**:

1. **Given** a slide with `[](render:command?cmd=npm%20run%20test%20--%20--coverage)`, **When** the slide renders, **Then** the command executes and output appears in a code block
2. **Given** a render:command with a long-running command, **When** rendering, **Then** a loading spinner shows while waiting, with a timeout (default 30s)
3. **Given** a command that fails (non-zero exit), **When** rendered, **Then** stderr is displayed with an error indicator
4. **Given** `[](render:command?cmd=cat%20package.json&format=json)`, **When** rendered, **Then** output is syntax-highlighted as JSON

---

### User Story 3 - Refresh Rendered Content (Priority: P2)

As a technical presenter, I want to manually refresh dynamic content on a slide so that I can show updated results after making changes during the demo.

**Acceptance Scenarios**:

1. **Given** a slide with rendered content, **When** I click a refresh button on the block, **Then** the file/command is re-read/re-executed and display updates
2. **Given** a slide with `[](render:file?path=src/app.ts&lines=1-10&watch=true)`, **When** the source file changes, **Then** the rendered content auto-updates (debounced 500ms)

---

### User Story 4 - Render Diff View (Priority: P2)

As a technical presenter, I want to show file differences inline in my slides so that I can highlight what changed during refactoring or between versions.

**Acceptance Scenarios**:

1. **Given** a slide with `[](render:diff?path=src/app.ts&before=HEAD~1)`, **When** rendered, **Then** a unified diff is shown comparing the previous commit to current
2. **Given** a slide with `[](render:diff?left=old.ts&right=new.ts)`, **When** rendered, **Then** a side-by-side diff of the two files is displayed
3. **Given** a diff with additions, **When** rendered, **Then** added lines are highlighted green
4. **Given** a diff with deletions, **When** rendered, **Then** removed lines are highlighted red
5. **Given** `[](render:diff?path=src/app.ts&before=HEAD~1&mode=split)`, **When** rendered, **Then** a side-by-side view is shown instead of unified

---

## Data Model

### Render Directive Syntax

```markdown
<!-- Inline link syntax (invisible in presentation) -->
[](render:file?path=<path>&lines=<range>&format=<format>)
[](render:command?cmd=<command>&timeout=<ms>&format=<format>)

<!-- Visible link syntax (shows label, click to expand/refresh) -->
[Show Code](render:file?path=src/app.ts&lines=10-20)
[Run Tests](render:command?cmd=npm%20test)
```

### Parameters

#### render:file

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `path` | Yes | Relative path to file | `src/app.ts` |
| `lines` | No | Line range (1-indexed) | `10-20` or `5` |
| `start` | No | Start pattern (regex or literal) | `function%20main` |
| `end` | No | End pattern (regex or literal) | `^}` |
| `format` | No | Output format: `code` (default), `quote`, `raw` | `quote` |
| `lang` | No | Language for syntax highlighting (auto-detected if omitted) | `typescript` |
| `watch` | No | Auto-refresh on file change | `true` |

#### render:command

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `cmd` | Yes | Command to execute (URL-encoded) | `npm%20test` |
| `timeout` | No | Timeout in ms (default: 30000) | `5000` |
| `format` | No | Output format: `code` (default), `json`, `raw` | `json` |
| `cwd` | No | Working directory | `./packages/core` |
| `shell` | No | Shell to use | `bash` |
| `cached` | No | Cache output (default: true). Set `false` to re-run on each slide visit | `false` |

### Streaming Behavior

Command output streams in real-time as it executes:
- Output appears line-by-line in the rendered block
- Block auto-scrolls to show latest output
- Header shows running indicator (⏳) while executing
- On completion: success (✓) or failure (✗) indicator
- Cached commands show stored output immediately on revisit

#### render:diff

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `path` | No* | File path to compare against git ref | `src/app.ts` |
| `before` | No | Git ref for "before" state (default: `HEAD~1`) | `HEAD~1`, `main`, `abc123` |
| `after` | No | Git ref for "after" state (default: working tree) | `HEAD` |
| `left` | No* | Left file path for file-to-file comparison | `old.ts` |
| `right` | No* | Right file path for file-to-file comparison | `new.ts` |
| `mode` | No | Display mode: `unified` (default) or `split` | `split` |
| `context` | No | Lines of context around changes (default: 3) | `5` |

*Either `path` or both `left`+`right` are required.

---

## Security Considerations

### Trust Model

| Action | Trusted Workspace | Untrusted Workspace |
|--------|-------------------|---------------------|
| `render:file` | ✅ Allowed | ✅ Allowed (read-only) |
| `render:command` | ✅ Allowed (with confirmation) | ❌ Blocked |

- `render:file` is read-only and safe in untrusted workspaces
- `render:command` executes arbitrary commands and **requires workspace trust**
- First `render:command` in a deck shows confirmation dialog (same as `terminal.run`)

---

## Implementation Notes

### Rendering Pipeline

1. **Parse phase**: `slideParser.ts` detects `render:*` directives in markdown
2. **Resolve phase**: Before slide display, conductor resolves each directive:
   - `render:file` → Read file, extract range, apply syntax highlighting
   - `render:command` → Execute command, capture stdout/stderr
3. **Inject phase**: Replace directive with rendered HTML in slide content
4. **Display phase**: Webview receives fully-rendered slide HTML

### File Range Extraction

```typescript
interface FileRange {
  lines?: { start: number; end: number };
  patterns?: { start: string; end: string };
}

function extractRange(content: string, range: FileRange): string {
  // Line-based extraction
  if (range.lines) {
    return content.split('\n').slice(range.lines.start - 1, range.lines.end).join('\n');
  }
  // Pattern-based extraction
  if (range.patterns) {
    const startMatch = content.match(new RegExp(range.patterns.start, 'm'));
    const endMatch = content.match(new RegExp(range.patterns.end, 'm'));
    // ... extract between matches
  }
}
```

### Command Execution

- Reuse `terminalRunExecutor.ts` infrastructure but capture output instead of displaying terminal
- Use `child_process.exec` with timeout
- Sanitize output (strip ANSI codes for display)

---

## UI/UX

### Rendered Block Appearance

```
┌──────────────────────────────────────────────────┐
│ 📄 src/app.ts:10-20                    [↻] [📋] │
├──────────────────────────────────────────────────┤
│ function main() {                                │
│   const app = new Application();                 │
│   app.initialize();                              │
│   return app.run();                              │
│ }                                                │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│ ⚡ npm test                           [↻] [📋]  │
├──────────────────────────────────────────────────┤
│ PASS  src/app.test.ts                            │
│   ✓ should initialize (3ms)                      │
│   ✓ should run (1ms)                             │
│                                                  │
│ Tests: 2 passed, 2 total                         │
└──────────────────────────────────────────────────┘
```

- Header shows source (file path or command)
- `[↻]` button refreshes content
- `[📋]` button copies content to clipboard

---

## Open Questions

None - all resolved.

---

## Dependencies

- Existing: `ActionRegistry`, `Conductor`, `SlideParser`
- New: Syntax highlighting library (Shiki recommended, or reuse VS Code's)

---

## Milestones

1. **M1**: `render:file` with line ranges - basic file embedding
2. **M2**: `render:command` - command output embedding with streaming
3. **M3**: `render:diff` - git and file-to-file diffs
4. **M4**: Pattern-based extraction, watch mode, refresh UI
