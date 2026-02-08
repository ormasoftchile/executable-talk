# Research: Deck Environment Variables

**Feature**: 006-deck-env-variables
**Date**: 2026-02-08

## R1 — Dotenv File Parsing

### Decision: Line-by-line parser with regex per line, no new dependency

**Rationale**: The project has only 3 runtime dependencies (gray-matter, markdown-it, VS Code API). The spec explicitly limits `.deck.env` to single-line `KEY=VALUE` — no multiline values, no variable expansion, no `export` prefix. This is a small enough grammar to parse in ~40 lines without a library.

**Parse rules**:
1. Trim each line. Skip if empty or starts with `#`.
2. Find the **first** `=` — everything before is the key, everything after is the value. This handles values containing `=` (e.g., `CONNECTION=host=localhost;port=5432`).
3. Trim the key; reject if empty or contains whitespace.
4. Handle quoted values: if value starts and ends with matching `"` or `'`, strip the quotes.
5. Trailing inline comments: do **not** strip (consistent with most real dotenv parsers for unquoted values). Document this.

**Regex**: `/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/`

**Edge cases**:

| Edge Case | Behavior |
|-----------|----------|
| `KEY=value with spaces` | Value is `value with spaces` |
| `KEY="quoted value"` | Value is `quoted value` (quotes stripped) |
| `KEY=val=ue` | Value is `val=ue` (first `=` splits) |
| `KEY=` | Value is empty string |
| `KEY` (no `=`) | Malformed line → diagnostic warning, skip |
| BOM at file start | Strip BOM before parsing |
| `KEY="value # not comment"` | Value is `value # not comment` (inside quotes) |

**Alternatives considered**:

| Option | Verdict | Reason |
|--------|---------|--------|
| Custom line-by-line | ✅ Chosen | ~40 lines, per-line diagnostics, no dependency |
| `dotenv` npm package | ❌ Rejected | Adds runtime dependency; mutates `process.env` by default |
| Single regex for whole file | ❌ Rejected | Harder to produce per-line error diagnostics |

---

## R2 — Gitignore Detection

### Decision: `git check-ignore` via child_process, with string search fallback

**Rationale**: No VS Code API exists for checking gitignore coverage. `git check-ignore` is authoritative — it respects nested `.gitignore` files, global gitignore config, and `.git/info/exclude`.

**Implementation**:
1. **Primary**: Run `git check-ignore -q <path>` using `child_process.execFile`. Exit code 0 = ignored (good), exit code 1 = not ignored (emit warning).
2. **Fallback**: If git is unavailable (not installed, not a git repo), do a best-effort string search in the nearest `.gitignore` for patterns matching `.deck.env` (literal `.deck.env`, `*.deck.env`).
3. **Timing**: Run during preflight validation and on deck open. Non-blocking, informational only.

**Alternatives considered**:

| Option | Verdict | Reason |
|--------|---------|--------|
| `git check-ignore` | ✅ Chosen | Authoritative, handles all gitignore complexity |
| `ignore` npm package | ❌ Rejected | New dependency; must manually find all applicable gitignore files |
| Simple `.gitignore` string search | ❌ Rejected as primary | Misses nested gitignores, global config, negation rules |

---

## R3 — Terminal Output Interception for Secret Scrubbing

### Decision: Terminal output does NOT currently flow to the webview; scrubbing needed only for display-path interpolation and renderBlockUpdate streaming

**Rationale**: The `TerminalRunExecutor` calls `terminal.sendText()` — fire-and-forget. It does not read or relay terminal output. The `ExecutionResult` returned contains only `success` and `error` — no output data. The webview never receives terminal output from `terminal.run` actions.

**Scrubbing surfaces**:

| Data Flow | Secret Leakage Risk | Scrubbing Approach |
|-----------|--------------------|--------------------|
| Slide HTML (`slideChanged.slideHtml`) | **Yes** — if `{{SECRET}}` interpolated into display | Use display-path interpolation (preserve `{{VAR}}` placeholder) |
| `terminal.run` → VS Code terminal panel | **No** — output stays in native terminal UI | Not needed |
| `renderBlockUpdate` streaming chunks | **Yes** — if `` ```command `` uses env vars | Scrub in `resolveCommandWithStreaming()` before postMessage |
| `actionStatusChanged` error messages | **Possible** — error text might echo the command | Scrub error strings before postMessage |

**Future consideration**: If terminal output capture is added later (e.g., via VS Code's Shell Integration API `TerminalShellExecution.read()`), the `SecretScrubber` module can be inserted between the read stream and any postMessage call.

**Alternatives considered**:

| Option | Verdict | Reason |
|--------|---------|--------|
| Display-path + error scrubbing only | ✅ Chosen | Matches current architecture; no terminal output reaches webview |
| `window.onDidWriteTerminalData` | ❌ Rejected | Proposed API, never finalized, superseded by Shell Integration |
| Pseudoterminal wrapper | ❌ Rejected | Extremely complex, breaks user expectations, replicates shell behavior |

---

## R4 — `{{VAR}}` Interpolation Strategy

### Decision: Regex replacement with recursive object walker, dual display/execution paths

**Rationale**: `{{VAR}}` is a simple literal substitution — no conditionals, loops, or expressions. A regex with recursive walk is the right tool.

**Regex pattern**: `/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g`

Matches `{{VAR_NAME}}` — alphanumeric + underscore, must start with letter or underscore. Intentionally does not conflict with existing `${home}` (different delimiters).

**Interpolation function**:
```
interpolate(template: string, vars: ResolvedEnvMap, forDisplay: boolean): string
```
- `forDisplay === true` and variable is secret → preserve `{{VAR_NAME}}`
- `forDisplay === false` → substitute real value
- Unknown `{{VAR}}` → leave as literal (preflight warns about undeclared placeholders)

**Recursive walk strategy** for action params (`Record<string, unknown>`):
1. Walk object recursively, producing a **new object** (immutable).
2. **String** values → apply regex replacement.
3. **Arrays** → recurse into each element.
4. **Objects** → recurse into each value.
5. **Non-string primitives** (numbers, booleans) → pass through.

This produces two action param trees: display (secrets masked) and execution (secrets resolved).

**Order of operations**:
1. Parse deck → raw action params with `{{VAR}}` and `${home}` literals
2. **Env interpolation** (`{{VAR}}` → value) at deck load time
3. **Platform placeholder expansion** (`${home}` → actual path) at execution time in `PlatformResolver`

Env vars resolve first (load time, user-provided). Platform placeholders resolve second (execution time, system-derived). They don't interact — a `{{VAR}}` value shouldn't contain `${home}` that needs further expansion.

**Alternatives considered**:

| Option | Verdict | Reason |
|--------|---------|--------|
| Regex + recursive walk | ✅ Chosen | Simple, no dependency, handles nested params, dual-path |
| Template engine (Handlebars) | ❌ Rejected | Massive overkill; adds dependency for literal substitution |
| Single-pass combined interpolation | ❌ Rejected | Couples env system to platform resolver |
| Lazy per-action interpolation | ❌ Rejected | Spec requires resolved values visible on slide before clicking run |

---

## R5 — FileSystemWatcher for `.deck.env` Re-validation

### Decision: `RelativePattern` watcher scoped to deck directory, 500ms debounce

**Rationale**: VS Code's `workspace.createFileSystemWatcher` with a `RelativePattern` provides precise, non-recursive watching for a single file — negligible performance overhead.

**Watcher setup**:
```typescript
const deckDir = path.dirname(deckFilePath);
const watcher = vscode.workspace.createFileSystemWatcher(
  new vscode.RelativePattern(vscode.Uri.file(deckDir), '.deck.env')
);
watcher.onDidChange(uri => debouncedRevalidate(uri));
watcher.onDidCreate(uri => debouncedRevalidate(uri));
watcher.onDidDelete(uri => handleEnvFileDeleted(uri));
```

**Debouncing**: Simple `setTimeout`/`clearTimeout` at 500ms — fast enough for responsive feel, slow enough to collapse rapid saves (e.g., auto-format-on-save triggers two writes).

**Lifecycle**: Dispose watcher when deck is closed or a different deck is opened. Push into conductor's disposable management.

**Alternatives considered**:

| Option | Verdict | Reason |
|--------|---------|--------|
| `RelativePattern` watcher | ✅ Chosen | Precise, non-recursive, minimal overhead |
| `workspace.onDidSaveTextDocument` | ❌ Rejected | Fires for all saves; needs filename filtering |
| `fs.watchFile` (Node polling) | ❌ Rejected | VS Code API uses efficient OS-level watchers |
| No debouncing | ❌ Rejected | Risk of double-validation on format-on-save |
