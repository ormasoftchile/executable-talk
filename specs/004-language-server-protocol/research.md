# Research — 004 Language Server Protocol Support

---

## R1 — Server Architecture: In-Process IPC vs. Separate Process

### Context

An LSP server can run as a separate Node.js process (`TransportKind.stdio` or `TransportKind.socket`) or in the same process as the extension host (`TransportKind.ipc`). The choice affects latency, crash isolation, and memory usage.

### Options

| Option              | Latency     | Crash Isolation | Memory  | Complexity |
|---------------------|-------------|-----------------|---------|------------|
| Separate process    | ~5–10 ms    | Full            | Higher  | Medium     |
| In-process IPC      | < 1 ms      | None            | Lower   | Low        |
| Web Worker          | ~2–5 ms     | Partial         | Medium  | High       |

### Decision

**In-process IPC** (`TransportKind.ipc`).

### Rationale

1. `.deck.md` files are authored by a single user in a single VS Code window — no multi-client scenarios.
2. The existing providers already run in the extension host process with acceptable performance.
3. Sub-millisecond latency ensures completion and hover feel instant.
4. Lower complexity: no need to bundle a separate server binary or manage child process lifecycle.
5. Crash isolation is acceptable because the LSP server's work (parsing, validation) is pure computation with no side effects. A try/catch at the handler boundary prevents server crashes from propagating.

### Tradeoff

If the LSP server blocks the extension host event loop (e.g., parsing a massive file), all extension features stall. Mitigated by keeping all operations O(n) where n = document lines, and avoiding synchronous file I/O.

---

## R2 — Document Model: DeckDocument Structure

### Context

The current parser produces `Deck` objects for presentation playback (with HTML rendering, fragment counts, etc.). An LSP server needs a different model focused on **source positions** — mapping every syntactic element back to its line/character range in the original document.

### Decision

Introduce a **`DeckDocument`** class that is separate from the presentation `Deck` model.

### Structure

```
DeckDocument
├── uri: string
├── version: number
├── content: string
├── slides: SlideRange[]
│   ├── range: Range (start line of slide to start line of next slide - 1)
│   ├── title: string | undefined
│   ├── frontmatterRange: Range | undefined
│   ├── actionBlocks: ActionBlockRange[]
│   │   ├── range: Range (fence to fence, inclusive)
│   │   ├── contentRange: Range (inside fences)
│   │   ├── yamlContent: string
│   │   ├── parsedYaml: Record<string, unknown> | undefined
│   │   ├── parseError: { message: string; range: Range } | undefined
│   │   └── parameters: ParameterRange[]
│   │       ├── keyRange: Range
│   │       ├── valueRange: Range
│   │       ├── key: string
│   │       └── value: unknown
│   ├── actionLinks: ActionLinkRange[]
│   │   ├── range: Range (full `[label](action:...)`)
│   │   ├── typeRange: Range
│   │   ├── type: string
│   │   └── params: Map<string, { value: string; range: Range }>
│   └── renderDirectives: RenderDirectiveRange[]
│       ├── range: Range
│       ├── typeRange: Range
│       ├── type: string
│       └── params: Map<string, { value: string; range: Range }>
└── diagnostics: Diagnostic[] (cached, recomputed on change)
```

### Rationale

1. **Separation of concerns**: The presentation model (`Deck`) is optimized for playback; the document model (`DeckDocument`) is optimized for editing.
2. **Position precision**: Every element stores its `Range` in 0-based LSP coordinates — no conversion needed at the handler level.
3. **Incremental update**: Slide-level granularity means only changed slides need re-parsing.
4. **Single source of position truth**: Eliminates the current position inconsistency (0-based vs. 1-based vs. character offsets).

---

## R3 — Context Detection: ActionContext Union

### Context

The autocomplete handler must determine what the cursor is pointing at to offer appropriate suggestions. The current `ActionCompletionProvider` uses ad-hoc line scanning (find `type:`, check indentation for step context). This needs to be formalized into a discriminated union.

### Decision

Define a 5-variant `ActionContext` discriminated union:

| Variant          | When                                      | Completions Offered                    |
|------------------|-------------------------------------------|----------------------------------------|
| `type-value`     | Cursor after `type: ` on a type line      | Action type names                      |
| `param-name`     | Cursor on a new line inside a block       | Parameter names for current type       |
| `param-value`    | Cursor after `paramName: `                | Values (paths, enums, configs)         |
| `step-context`   | Cursor inside `steps:` array entry        | Recurse: type-value / param-name / param-value |
| `unknown`        | Cursor outside action blocks              | No action completions                  |

### Detection Algorithm

1. Find the `ActionBlockRange` containing the cursor position (binary search on ranges).
2. If not inside a block → `unknown`.
3. Parse the cursor line to determine context:
   - Line matches `/^\s*type:\s*/` → `type-value`
   - Line matches `/^\s*(\w+):\s*$/` and key is a known parameter → `param-value` (empty, trigger completion)
   - Line matches `/^\s*(\w+):\s+(.+)$/` and cursor is in the value region → `param-value`
   - Inside `steps:` array (indentation ≥ 4 or after `- type:`) → `step-context` (recurse)
   - Otherwise → `param-name`

### Rationale

A discriminated union ensures exhaustive handling in TypeScript `switch` statements. Each handler function receives a strongly-typed context object with the relevant data (block, type, parameter name, cursor position).

---

## R4 — File Path Completions

### Context

The `path` parameter on `file.open`, `editor.highlight`, and render directives should offer workspace file paths. The current providers do not implement this (the schema declares `description: "Relative path..."` but no completion logic exists).

### Decision

Implement a **`WorkspaceFileCache`** that:

1. On server initialization, lists all workspace files via `workspace/workspaceFolders` + `fs.readdir` (recursive, filtered by `.gitignore` patterns).
2. Stores paths relative to workspace root.
3. Refreshes on `workspace/didChangeWatchedFiles` notifications.
4. Limits cache size to 10,000 entries (configurable).
5. Supports prefix filtering for completion (e.g., `src/` shows only files under `src/`).

### Completion Behavior

- Trigger: cursor after `path: ` in an action block with `type: file.open`, `editor.highlight`, or a `render:file` directive.
- Display: relative path from workspace root.
- Insert: the relative path string.
- Sorting: directories grouped before files, then alphabetical.
- Filter: respects partial input (`src/m` → `src/main.ts`, `src/models/`).

### Performance Target

- Initial cache build: < 500 ms for 10,000 files.
- Completion filtering: < 10 ms (in-memory string prefix match).
- Cache refresh: incremental (add/remove changed files only).

---

## R5 — Launch Configuration Completions

### Context

The `debug.start` action's `config` parameter should offer names from `.vscode/launch.json`. This is a common authoring need — deck authors reference debug configurations by name.

### Decision

1. Read `.vscode/launch.json` from the workspace root.
2. Parse the `configurations` array.
3. Extract `name` fields.
4. Offer as completion items when cursor is after `config: ` in a `debug.start` block.
5. Cache the parsed names; invalidate when `launch.json` changes (via file watcher).

### Edge Cases

- No `launch.json` → no completions (empty list).
- Malformed `launch.json` → no completions (empty list), no error.
- Multiple workspace folders → merge configurations from all roots.

---

## R6 — Diagnostic Debouncing

### Context

The current diagnostic provider fires on every `onDidChangeTextDocument` event with no debounce. For an LSP server receiving incremental changes, this means diagnostics could be recomputed dozens of times per second during rapid typing.

### Decision

Implement a **300 ms debounce** per document URI:

1. On `textDocument/didChange`, schedule a diagnostic computation after 300 ms.
2. If another change arrives within the 300 ms window, reset the timer.
3. After the timer fires, compute diagnostics and publish via `textDocument/publishDiagnostics`.
4. On `textDocument/didClose`, cancel any pending timer and clear diagnostics.

### Rationale

- 300 ms balances responsiveness (user sees errors quickly) with efficiency (avoids mid-keystroke recomputation).
- Per-document timers prevent one document's edits from delaying another's diagnostics.
- The 300 ms value is consistent with ESLint, TypeScript, and other popular LSP servers.

---

## R7 — Code Actions: Typo Correction and Missing Parameters

### Context

Quick fixes are one of the highest-value LSP features for authoring productivity. Two categories offer the best ROI:

1. **Typo correction**: `type: file.opn` → "Did you mean 'file.open'?"
2. **Missing required parameter**: `file.open` block without `path` → "Add required parameter 'path'"

### Decision

**Typo correction:**
- Compute Levenshtein distance between the unknown type value and all valid types.
- Offer corrections for types within distance ≤ 2.
- Produce a `WorkspaceEdit` that replaces the type value range.

**Missing parameter insertion:**
- For each required parameter missing from the block, offer a code action.
- The action inserts `paramName: ` (with cursor placeholder) at the end of the block content.
- Use `isPreferred: true` for the first required parameter.

### Implementation Notes

- Code actions are associated with specific diagnostics via `diagnostic` field.
- Use `CodeActionKind.QuickFix` for both categories.
- Levenshtein distance computation is O(m×n) but with m,n ≤ 20 (action type names), this is negligible.

---

## R8 — Document Symbols Hierarchy

### Context

The `textDocument/documentSymbol` response can be flat or hierarchical. For deck files, a hierarchical structure maps naturally:

```
Slide 1: "Introduction"
├── file.open (action block)
├── render:file (render directive)
Slide 2: "Demo"
├── terminal.run (action block)
├── sequence (action block)
```

### Decision

- **Slides**: `SymbolKind.Module` — name from frontmatter `title` or `"Slide N"`.
- **Action blocks**: `SymbolKind.Function` — name from `type` value (e.g., `"file.open"`).
- **Render directives**: `SymbolKind.Object` — name from label or `"render:type"`.
- **Inline action links**: Not included (too noisy; users can see them in the document).

### Rationale

The Outline panel in VS Code displays `DocumentSymbol[]` as a tree. This hierarchy gives deck authors a table-of-contents view with one click navigation to any slide or action.

---

## R9 — Go-to-Definition for File References

### Context

`path` parameters in `file.open`, `editor.highlight`, render directives, and `cwd` in `terminal.run` reference workspace files. Go-to-definition should resolve these to the actual file.

### Decision

1. On `textDocument/definition`, detect if the cursor is on a path-like parameter value.
2. Resolve the value relative to the workspace root.
3. If the file exists, return `Location { uri, range: { start: 0:0, end: 0:0 } }`.
4. If the file doesn't exist, return `null` (no error, no notification).
5. For `config` parameters, resolve to `.vscode/launch.json` and attempt to find the line of the matching configuration name.

### Edge Cases

- Absolute paths → resolve as-is.
- Paths with `~` → expand to home directory.
- Paths with `${workspaceFolder}` → resolve variable.
- Multiple workspace folders → try each root in order.

---

## R10 — Migration Strategy: Feature Flag and Provider Coexistence

### Context

The LSP server replaces functionality currently provided by three direct providers (`ActionCompletionProvider`, `ActionHoverProvider`, `ActionDiagnosticProvider`). A clean migration requires that both implementations can coexist.

### Decision

1. Add a configuration setting: `executableTalk.useLsp` (boolean, default `true`).
2. In `extension.ts`, read the setting at activation:
   - If `true`: start LSP client, skip provider registration.
   - If `false`: register legacy providers, skip LSP client.
3. On configuration change (`workspace/didChangeConfiguration`):
   - Stop/start LSP client or dispose/register legacy providers accordingly.
   - **No restart required** — hot-swap at runtime.
4. The legacy provider source files are preserved (not deleted) throughout the migration period.
5. After one release cycle with LSP as default, the legacy providers can be removed in a cleanup PR.

### Rationale

- Default `true` means new users immediately get the LSP experience.
- Power users or those hitting issues can disable it without downgrading the extension.
- Hot-swap avoids the poor UX of requiring an extension restart.
- Preserving legacy code ensures a fast rollback path.

### Migration Phases

| Phase | What                                      | Duration  |
|-------|-------------------------------------------|-----------|
| 1     | LSP server with completion + diagnostics + hover (parity) | 2 weeks |
| 2     | Add document symbols + folding ranges     | 1 week    |
| 3     | Add code actions + go-to-definition       | 1 week    |
| 4     | Value completions (paths, configs, enums) | 1 week    |
| 5     | Remove legacy providers (separate PR)     | Post-release |
