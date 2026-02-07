# Research: Authoring & Reliability — Critical Adoption Blockers

**Feature**: 003-authoring-reliability  
**Date**: 2026-02-07

## R1 — YAML Parsing for Fenced Action Blocks

### Decision: Use `js-yaml` v4 as explicit dependency

**Rationale**: Already present as a transitive dependency of `gray-matter`. YAML 1.2 compliant (matches spec assumption). Throws `YAMLException` with `.mark` property containing line/column positions — ideal for FR-005 error reporting with slide and block location.

**Alternatives considered**:

| Option | Verdict | Reason |
|--------|---------|--------|
| `js-yaml` v4 | ✅ Chosen | Already available, YAML 1.2, excellent error marks |
| gray-matter's built-in engine | ❌ Rejected | Bundles js-yaml v3 (YAML 1.1); `yes`/`no` → boolean quirks; coupled lifecycle |
| `yaml` (eemeli/yaml) | ❌ Rejected | New dependency; larger bundle (~170KB vs ~100KB); overkill features (CST, round-trip) |

**Action**: Add `js-yaml` as explicit production dependency and `@types/js-yaml` as dev dependency.

---

### Decision: Regex pre-pass on raw Markdown content (not markdown-it tokens)

**Rationale**: Consistent with existing parser patterns (`actionLinkParser.ts` uses regex on raw content, `renderDirectiveParser.ts` uses same approach). Runs before `md.render()` so action blocks can be stripped from the Markdown before HTML generation — prevents them appearing as visible code blocks in slides.

**Pattern**:
```
const ACTION_BLOCK_PATTERN = /^```action\s*\n([\s\S]*?)^```\s*$/gm;
```

**Integration point** in `slideParser.ts → parseSlideContent()`:
1. Extract slide frontmatter (gray-matter)
2. **NEW**: `parseActionBlocks(content)` — extract YAML blocks, return actions + cleaned content
3. `md.render(cleanedContent)` — render without action blocks
4. `processFragments(html)`
5. `parseActionLinks(content)` — existing inline links (both formats coexist per FR-004)
6. `parseRenderDirectives(content)`

**Alternatives considered**:

| Option | Verdict | Reason |
|--------|---------|--------|
| Regex pre-pass | ✅ Chosen | Consistent with existing parsers; no pipeline refactoring needed |
| markdown-it token parsing | ❌ Rejected | Would require refactoring to `md.parse()` → filter → re-render; no existing code uses token API |

---

## R2 — VS Code Authoring Providers (Completion, Hover, Diagnostics)

### Decision: Regex-based embedded language detection

Use a shared `findActionBlocks(document)` utility that scans lines for `` ```action `` and closing `` ``` `` fences, returning block boundaries. All three providers call this to determine if the cursor is inside an action block.

**Alternatives considered**: TextMate grammar `embeddedLanguages` (overkill — requires full grammar authoring), stateful token tracking (over-engineered).

---

### Decision: Register providers for `deck-markdown` language ID

The existing `package.json` language contribution maps `.deck.md` → `deck-markdown`. All providers register against `{ language: 'deck-markdown' }`. No interference with regular Markdown files.

---

### Decision: CompletionItemProvider with trigger characters `:` and `/`

- Context-aware: parse YAML-so-far to detect `type` value, then suggest parameters valid for that type
- File path completion: `vscode.workspace.findFiles()` cached with `FileSystemWatcher` invalidation
- Trigger characters: `:` (after key names) and `/` (during path typing)
- Use `SnippetString` for complex parameter insertion (e.g., `steps:` array)

---

### Decision: HoverProvider with static documentation map

- `document.getWordRangeAtPosition(position, /[\w.]+/)` to detect dotted action types
- Static `Map<string, HoverDocumentation>` built once at activation from executor metadata
- `MarkdownString` output showing action description and parameter table
- Context-gated: only inside action blocks

---

### Decision: DiagnosticCollection triggered on document change with 300ms debounce

| Trigger | Behavior |
|---------|----------|
| `onDidChangeTextDocument` | 300ms debounce — real-time feedback per FR-022 |
| `onDidSaveTextDocument` | Immediate re-validation (safety net) |
| `onDidOpenTextDocument` | Immediate validation on open |
| `onDidCloseTextDocument` | Clear diagnostics |

**Validation checks**:

| Check | Severity |
|-------|----------|
| Invalid YAML syntax | Error |
| Unknown action type | Error |
| Missing required parameter | Error |
| Unknown parameter key | Warning |
| File path not found | Warning (async, `vscode.workspace.fs.stat()`) |
| Invalid enum value | Warning |

Diagnostic source set to `'Executable Talk'`. Line mapping: `contentStartLine + yamlErrorLine`.

**Alternatives considered**: Validate on save only (rejected — FR-022 requires real-time), full LSP (rejected — spec assumption says extension APIs first; 6 types × ~5 params is too small for LSP overhead).

---

## R3 — Preflight Deck Validation

### Decision: Check debug configs via `vscode.workspace.getConfiguration('launch')` API

Reads launch configurations through VS Code's settings API. Handles merging workspace-level and folder-level `launch.json`, multi-root workspaces. Match `configName` against configuration `name` fields.

**Alternatives considered**: Manual `launch.json` file parse (misses workspace settings, compound configs, multi-root).

---

### Decision: Check command PATH via `child_process.execFile('which'/'where.exe')`

Platform-aware: `which` on Unix, `where.exe` on Windows. Extract binary name (first whitespace-delimited token) from command string. 2-second timeout per check. Shell builtins (`cd`, `echo`) won't be found — emit Info-level note.

---

### Decision: Layered validation report UX

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| Primary | `DiagnosticCollection` on the `.deck.md` file | Inline squiggles, Problems panel integration |
| Secondary | `OutputChannel('Executable Talk Validation')` | Detailed timestamped log |
| Tertiary | Notification toast | Summary (e.g., "12 checks passed, 2 warnings, 1 error") |

---

### Decision: Async validation with `withProgress` at `ProgressLocation.Notification`

Phases run in parallel within each category:
1. File stat checks (parallel) → 40% progress
2. Line range checks (parallel) → 25% progress
3. Command PATH checks (parallel) → 25% progress
4. Debug config + trust checks (sync) → 10% progress

Supports cancellation via `CancellationToken`.

---

## R4 — Webview Error Notifications

### Decision: Fixed-position toast stack in bottom-right of presentation

- `position: fixed`, `bottom: 5rem`, `right: 1rem` (clears nav bar and toolbar)
- `flex-direction: column-reverse` — newest at bottom
- Max 5 visible toasts; oldest auto-dismissed when exceeded
- `z-index: 80` (above content, below action overlay at 100)
- Slide-in animation (300ms), fade-out on dismiss (200ms)

---

### Decision: Hybrid auto-dismiss behavior

| Error type | Behavior |
|------------|----------|
| Simple action failures | Auto-dismiss after 8 seconds (paused on hover) |
| Trust-blocked actions | Auto-dismiss after 8 seconds |
| Sequence partial failures | Stay until manually dismissed |
| Timeout errors | Stay until manually dismissed |

---

### Decision: Extend `ActionStatusChangedMessage` payload (no new message type)

Add optional fields to existing payload:

| New Field | Type | Purpose |
|-----------|------|---------|
| `actionType` | `ActionType` | Display icon and action name in toast |
| `actionTarget` | `string` | File path, command, etc. |
| `sequenceDetail` | `{ totalSteps, failedStepIndex, failedStepType, stepResults[] }` | Sequence step breakdown |

`ErrorMessage` stays for system-level errors. `ActionStatusChangedMessage` handles action-lifecycle failures. Webview renders all toast HTML from structured data (three-layer compliance).

---

## Summary: All Unknowns Resolved

| # | Unknown | Resolution |
|---|---------|-----------|
| R1 | YAML parsing library | `js-yaml` v4 (explicit dep) |
| R1 | Parse strategy for fenced blocks | Regex pre-pass (consistent with existing parsers) |
| R2 | Embedded language detection | Regex-based `findActionBlocks()` utility |
| R2 | Provider registration | `{ language: 'deck-markdown' }` |
| R2 | Completion triggers | `:` and `/` characters |
| R2 | Diagnostic triggers | 300ms debounce on change + on save + on open |
| R3 | Debug config check | `vscode.workspace.getConfiguration('launch')` API |
| R3 | Command PATH check | `which`/`where.exe` via `child_process.execFile` |
| R3 | Validation report UX | DiagnosticCollection + OutputChannel + notification |
| R3 | Async progress | `withProgress` at Notification location |
| R4 | Toast notification pattern | Fixed bottom-right stack, max 5, z-index 80 |
| R4 | Auto-dismiss behavior | Hybrid: 8s for simple, persist for sequences/timeouts |
| R4 | Protocol changes | Extend `ActionStatusChangedMessage` payload |
