# Feature 004 — Language Server Protocol Support

| Field          | Value                                          |
| -------------- | ---------------------------------------------- |
| **Branch**     | `004-language-server-protocol`                 |
| **Status**     | Draft                                          |
| **Input**      | Add Language Server Protocol support for autocomplete and inline validation |

---

## User Stories

### US-1 — Real-time action block validation (P1)

> As a **deck author**, I want **inline validation errors to appear as I type inside action blocks**, so that **I can fix mistakes before running the presentation**.

**Independent test:** Open a `.deck.md` file, type an invalid action type inside a ` ```action ` block, and verify a red underline appears within 500 ms with a descriptive message.

**Acceptance scenarios:**

| # | Given                                      | When                                       | Then                                              |
|---|--------------------------------------------|--------------------------------------------|---------------------------------------------------|
| 1 | A `file.open` block missing required `path`| The author saves or pauses typing          | A diagnostic appears: "Missing required parameter: path" at the parameter region |
| 2 | A block with `type: unknown.action`        | The document is open                       | A diagnostic appears: "Unknown action type: unknown.action" on the type line |
| 3 | A `sequence` block with a step missing `type`| The author types inside the steps array  | A diagnostic appears at the step's line: "Each step must have a 'type' field" |
| 4 | A valid `editor.highlight` block           | All required params are present            | No diagnostics are shown for that block            |
| 5 | YAML syntax error in block                 | The author introduces a bad indent         | A diagnostic appears at the exact error line, not the whole block range |

---

### US-2 — Context-aware autocomplete (P1)

> As a **deck author**, I want **intelligent autocomplete suggestions for action types, parameter names, and parameter values**, so that **I can write action blocks quickly without memorizing the schema**.

**Independent test:** Inside a ` ```action ` block, type `type: ` and verify a completion list appears showing all six action types with descriptions, then select `file.open` and type a new line to see `path` offered first (required parameter).

**Acceptance scenarios:**

| # | Given                                        | When                                           | Then                                                |
|---|----------------------------------------------|-------------------------------------------------|-----------------------------------------------------|
| 1 | Cursor on an empty line in an action block   | The author triggers completions                 | All 6 action types are offered with descriptions    |
| 2 | `type: file.open` is set                     | The author starts a new line                    | Required param `path` appears first, optional params follow |
| 3 | `type: file.open` and cursor after `path: `  | The author triggers completions                 | Workspace file paths are offered as completion items |
| 4 | `type: editor.highlight` with `style: `      | The author triggers completions                 | Enum values `subtle` and `prominent` are offered    |
| 5 | `type: debug.start` with `config: `          | The author triggers completions                 | Launch configuration names from `launch.json` are offered |
| 6 | `type: terminal.run` with `cwd: `            | The author triggers completions                 | Workspace directory paths are offered               |
| 7 | Inside a `sequence` step                     | The author triggers completions for `type`      | All action types except `sequence` are offered      |

---

### US-3 — Hover documentation (P2)

> As a **deck author**, I want **hover tooltips on action types, parameter names, and parameter values**, so that **I can understand what each field does without leaving the editor**.

**Independent test:** Hover over `file.open` on a `type:` line and verify a tooltip appears showing the description, trust requirement, and full parameter table.

**Acceptance scenarios:**

| # | Given                                        | When                                     | Then                                                     |
|---|----------------------------------------------|------------------------------------------|----------------------------------------------------------|
| 1 | Cursor hovers over `file.open` value         | Hover tooltip appears                    | Shows description, trust status, and parameter table     |
| 2 | Cursor hovers over parameter name `path`     | Hover tooltip appears                    | Shows type, required status, description, allowed values |
| 3 | Cursor hovers over inline action link `[Open](action:file.open?path=src/main.ts)` | Hover tooltip appears | Shows resolved action details and parameter summary      |
| 4 | Cursor hovers over render directive `[Code](render:file?path=src/app.ts)` | Hover tooltip appears | Shows render type description and parameter values       |

---

### US-4 — Document symbols and navigation (P2)

> As a **deck author**, I want **the Outline panel to show slides, action blocks, and render directives**, so that **I can navigate large decks quickly**.

**Independent test:** Open a deck with 10+ slides in VS Code, open the Outline panel, and verify each slide appears as a symbol with its title (or "Slide N"), and action blocks appear as children.

**Acceptance scenarios:**

| # | Given                                      | When                                     | Then                                              |
|---|--------------------------------------------|--------------------------------------------|---------------------------------------------------|
| 1 | A deck file with 5 slides is open          | The author opens the Outline panel         | 5 slide symbols appear with titles or "Slide N"   |
| 2 | Slide 2 has two action blocks              | The author expands Slide 2 in the Outline  | Two action block children with type labels appear  |
| 3 | The author clicks an action block symbol   | The editor navigates                       | Cursor jumps to the action block's ` ```action ` line |
| 4 | Slide 3 has a render directive             | The author expands Slide 3 in the Outline  | A render directive child appears with its label    |

---

### US-5 — Code actions and quick fixes (P3)

> As a **deck author**, I want **quick-fix suggestions for common errors**, so that **I can resolve issues with a single click**.

**Independent test:** Create an action block with `type: file.opn` (typo), verify a diagnostic appears, then invoke the code action to see "Did you mean 'file.open'?" offered as a quick fix.

**Acceptance scenarios:**

| # | Given                                        | When                                           | Then                                                |
|---|----------------------------------------------|-------------------------------------------------|-----------------------------------------------------|
| 1 | Block has `type: file.opn` (typo)            | The author invokes code actions                 | "Did you mean 'file.open'?" is offered              |
| 2 | Block is missing required `path` param       | The author invokes code actions                 | "Add required parameter 'path'" inserts a template line |
| 3 | Block has `highlight` param (deprecated key) | The author invokes code actions                 | "Replace with 'lines'" is offered as a quick fix    |
| 4 | Author applies the quick fix                 | The fix is applied                              | The document is updated and the diagnostic clears   |

---

### US-6 — Go-to-definition for file references (P3)

> As a **deck author**, I want **Ctrl+Click on file paths in action parameters to open the referenced file**, so that **I can verify file references without manual navigation**.

**Independent test:** In a `file.open` block with `path: src/main.ts`, Ctrl+Click on `src/main.ts` and verify the file opens in a new editor tab.

**Acceptance scenarios:**

| # | Given                                        | When                                           | Then                                                |
|---|----------------------------------------------|-------------------------------------------------|-----------------------------------------------------|
| 1 | `path: src/main.ts` in a `file.open` block  | The author Ctrl+Clicks the path value           | `src/main.ts` opens in a new editor tab             |
| 2 | `path: missing.ts` (file doesn't exist)      | The author Ctrl+Clicks the path value           | Nothing happens; no error dialog                    |
| 3 | `config: "My Launch"` in a `debug.start` block | The author Ctrl+Clicks the config value       | `launch.json` opens, scrolled to the matching config |

---

### US-7 — Folding ranges (P4)

> As a **deck author**, I want **collapsible regions for slides, frontmatter blocks, and action blocks**, so that **I can focus on specific sections of a large deck**.

**Independent test:** Open a deck with 10 slides, click the fold icon next to a `---` delimiter, and verify the slide collapses.

**Acceptance scenarios:**

| # | Given                                        | When                                           | Then                                                |
|---|----------------------------------------------|-------------------------------------------------|-----------------------------------------------------|
| 1 | A slide delimited by `---`                   | The author clicks the fold icon                 | The slide content collapses to a single line        |
| 2 | A ` ```action ` block                        | The author clicks the fold icon on the fence    | The action block collapses                          |
| 3 | A YAML frontmatter block (`---` ... `---`)   | The author clicks the fold icon                 | The frontmatter collapses                           |

---

## Edge Cases

| ID    | Scenario                                                    | Expected Behavior                                          |
|-------|-------------------------------------------------------------|------------------------------------------------------------|
| EC-01 | Action block with no closing ` ``` ` fence                  | Diagnostic: "Unclosed action block"; no completions inside |
| EC-02 | Nested ` ``` ` fences inside a Markdown code block          | Not treated as action blocks; ignored by LSP               |
| EC-03 | 500+ slide deck file (>10,000 lines)                        | Incremental parsing; response times < 200 ms               |
| EC-04 | Simultaneous edits in multiple `.deck.md` files             | Independent document state; no cross-document interference  |
| EC-05 | File opened but not saved (untitled `.deck.md`)             | Full LSP features available using in-memory content         |
| EC-06 | Mixed action blocks and render directives on same slide     | Both are independently validated and offered completions    |
| EC-07 | Action block with empty content (just fences)               | Diagnostic: "Empty action block"; type completion offered   |
| EC-08 | `sequence` type with deeply nested steps (3+ levels)        | Validation only at first level; warning for deep nesting   |
| EC-09 | File path parameter pointing outside workspace              | Warning diagnostic; go-to-definition still attempts open   |
| EC-10 | Rapid typing (10+ keystrokes/second)                        | Debounced validation at 300 ms; no UI stutter              |
| EC-11 | Extension host restarts while LSP server is running          | Client reconnects; server re-initializes document state    |
| EC-12 | Untrusted workspace                                         | LSP features work normally; trust warnings on hover only   |
| EC-13 | Inline action link `[Label](action:type?params)` validation | Type and parameter validation applied to inline links too  |
| EC-14 | Render directive `[Label](render:file?path=...)` validation | Path existence check; parameter validation                 |

---

## Functional Requirements

### Server Architecture

| ID     | Requirement                                                                                     |
|--------|-------------------------------------------------------------------------------------------------|
| FR-001 | The system SHALL implement an LSP server using `vscode-languageserver` 9.x and `vscode-languageserver-textdocument` packages. |
| FR-002 | The LSP server SHALL run in the same Node.js process as the extension host, communicating via IPC (`TransportKind.ipc`). |
| FR-003 | The LSP server SHALL support `TextDocumentSyncKind.Incremental` for efficient document synchronization. |
| FR-004 | The LSP server SHALL register for documents matching the `deck-markdown` language identifier.    |
| FR-005 | The LSP client SHALL be initialized in `extension.ts` and started during extension activation.   |

### Document Model

| ID     | Requirement                                                                                     |
|--------|-------------------------------------------------------------------------------------------------|
| FR-006 | The server SHALL maintain a `DeckDocument` model per open file that tracks slide boundaries, action block ranges, and render directive positions using 0-based line/character coordinates. |
| FR-007 | The server SHALL implement incremental re-parsing: on `textDocument/didChange`, only the affected slide(s) SHALL be re-parsed, not the entire document. |
| FR-008 | The server SHALL cache the parsed `DeckDocument` and invalidate only changed regions on incremental updates. |
| FR-009 | All position data in the document model SHALL use LSP-standard 0-based line and 0-based character (UTF-16 code units). |

### Completion (textDocument/completion)

| ID     | Requirement                                                                                     |
|--------|-------------------------------------------------------------------------------------------------|
| FR-010 | The server SHALL provide completions for action type values when the cursor is on or after a `type:` key. |
| FR-011 | The server SHALL provide completions for parameter names based on the resolved action type, with required parameters sorted before optional ones. |
| FR-012 | The server SHALL provide completions for parameter values including: workspace file paths for `path` parameters, launch configuration names for `config` parameters, directory paths for `cwd` parameters, and enum values for constrained parameters. |
| FR-013 | The server SHALL exclude `sequence` from type completions when inside a `sequence.steps` context. |
| FR-014 | The server SHALL provide completions for inline action link types in `[Label](action:▌)` syntax. |
| FR-015 | The server SHALL provide completions for render directive types in `[Label](render:▌)` syntax.  |
| FR-016 | Completion items SHALL include `textEdit` fields with precise replace ranges.                    |

### Diagnostics (textDocument/publishDiagnostics)

| ID     | Requirement                                                                                     |
|--------|-------------------------------------------------------------------------------------------------|
| FR-017 | The server SHALL publish diagnostics for: YAML parse errors (at exact error line), missing required parameters, unknown action types, unknown parameter names, and type mismatches. |
| FR-018 | The server SHALL debounce diagnostic computation with a 300 ms delay after the last document change. |
| FR-019 | Diagnostic ranges SHALL be precise: underlining the specific token, not the entire line.         |
| FR-020 | The server SHALL validate `sequence` steps recursively (one level deep) with per-step diagnostics. |
| FR-021 | The server SHALL validate inline action links for type and parameter correctness.                |
| FR-022 | The server SHALL validate render directives for type and parameter correctness.                  |

### Hover (textDocument/hover)

| ID     | Requirement                                                                                     |
|--------|-------------------------------------------------------------------------------------------------|
| FR-023 | The server SHALL provide hover documentation for action type values showing description, trust requirement, and parameter table. |
| FR-024 | The server SHALL provide hover documentation for parameter names showing type, required status, description, and allowed values. |
| FR-025 | The server SHALL provide hover documentation for inline action links showing resolved action details. |
| FR-026 | The server SHALL provide hover documentation for render directives showing type and parameter details. |

### Document Symbols (textDocument/documentSymbol)

| ID     | Requirement                                                                                     |
|--------|-------------------------------------------------------------------------------------------------|
| FR-027 | The server SHALL provide hierarchical document symbols: slides as top-level (SymbolKind.Module), action blocks and render directives as children (SymbolKind.Function and SymbolKind.Object respectively). |
| FR-028 | Slide symbols SHALL use the frontmatter `title` if available, otherwise "Slide N" (1-based).    |
| FR-029 | Action block symbols SHALL display the action type as their name.                                |

### Code Actions (textDocument/codeAction)

| ID     | Requirement                                                                                     |
|--------|-------------------------------------------------------------------------------------------------|
| FR-030 | The server SHALL provide "Did you mean 'X'?" quick fixes for unknown action types within edit distance 2 of a valid type. |
| FR-031 | The server SHALL provide "Add required parameter 'X'" quick fixes that insert a template line.  |
| FR-032 | Code action edits SHALL use `WorkspaceEdit` with `TextEdit` arrays for precise document modifications. |

### Go-to-Definition (textDocument/definition)

| ID     | Requirement                                                                                     |
|--------|-------------------------------------------------------------------------------------------------|
| FR-033 | The server SHALL resolve `path` parameter values to workspace file URIs for go-to-definition.   |
| FR-034 | The server SHALL resolve `config` parameter values to the matching entry in `.vscode/launch.json`. |
| FR-035 | If the target file does not exist, the server SHALL return an empty result (no error).           |

### Folding Ranges (textDocument/foldingRange)

| ID     | Requirement                                                                                     |
|--------|-------------------------------------------------------------------------------------------------|
| FR-036 | The server SHALL provide folding ranges for slide boundaries (between `---` delimiters).        |
| FR-037 | The server SHALL provide folding ranges for action blocks (` ```action ` to ` ``` `).           |
| FR-038 | The server SHALL provide folding ranges for YAML frontmatter (`---` to `---`).                  |

### Migration & Compatibility

| ID     | Requirement                                                                                     |
|--------|-------------------------------------------------------------------------------------------------|
| FR-039 | The LSP server SHALL be introduced behind a `executableTalk.useLsp` boolean setting (default `true`). |
| FR-040 | When `executableTalk.useLsp` is `false`, the existing provider-based implementation SHALL be used. |
| FR-041 | The existing provider classes (`ActionCompletionProvider`, `ActionHoverProvider`, `ActionDiagnosticProvider`) SHALL be preserved during the migration period. |
| FR-042 | The LSP client and direct providers SHALL NOT be active simultaneously for the same document.    |

### Performance

| ID     | Requirement                                                                                     |
|--------|-------------------------------------------------------------------------------------------------|
| FR-043 | Completion requests SHALL resolve within 100 ms for documents up to 500 slides.                 |
| FR-044 | Diagnostic computation SHALL complete within 200 ms for documents up to 500 slides.             |
| FR-045 | File path completions SHALL use a workspace file cache refreshed on `workspace/didChangeWatchedFiles`. |
| FR-046 | The server SHALL support documents up to 10,000 lines without degradation below the stated thresholds. |

---

## Key Entities

| Entity              | Description                                                                                        |
|---------------------|----------------------------------------------------------------------------------------------------|
| **DeckDocument**    | Server-side document model mapping source positions to slides, action blocks, and render directives |
| **SlideRange**      | A range within the document representing one slide's boundaries (start line to end line)           |
| **ActionBlockRange**| A range within a slide representing a fenced action block with parsed YAML content                 |
| **ActionContext**    | Discriminated union representing cursor position context: `type-value`, `param-name`, `param-value`, `step-context`, `unknown` |
| **ParameterRange**  | A range within an action block mapping a single YAML key or value to its document position         |
| **WorkspaceFileCache** | Cached listing of workspace files for path-based completions, invalidated by file watcher events |

---

## Success Criteria

| ID     | Criterion                                                                                        | Measurement                          |
|--------|--------------------------------------------------------------------------------------------------|--------------------------------------|
| SC-001 | Action block validation covers all error types from `ActionDiagnosticProvider` plus YAML line precision | Parity test suite: ≥100% diagnostic coverage vs. current provider |
| SC-002 | Autocomplete supports action types, parameter names, parameter values (file paths, enum, launch configs) | ≥ 7 completion context categories tested |
| SC-003 | Hover documentation covers action types, parameter names, inline links, and render directives    | ≥ 4 hover target types tested        |
| SC-004 | Document symbols show slides, action blocks, and render directives in the Outline panel          | Outline populated for a 10-slide deck |
| SC-005 | Code actions offer quick fixes for typos and missing required parameters                         | ≥ 3 code action types tested         |
| SC-006 | Completion response time < 100 ms and diagnostic response time < 200 ms for a 500-slide document | Performance benchmark passes         |
| SC-007 | Feature flag (`executableTalk.useLsp`) toggles between LSP and legacy providers without restart  | Toggle test passes both directions   |
| SC-008 | All existing provider tests pass against the LSP server (parity)                                 | Provider parity test suite green      |
| SC-009 | Go-to-definition resolves `path` and `config` parameters to workspace files                      | ≥ 3 definition resolution tests pass |
| SC-010 | Folding ranges cover slides, action blocks, and frontmatter                                      | Folding test with mixed content passes |

---

## Assumptions

1. The `vscode-languageserver` 9.x and `vscode-languageclient` 9.x packages are stable and suitable for in-process IPC communication.
2. An in-process IPC server (same Node.js process as extension host) provides acceptable latency without a separate server process.
3. The existing `ACTION_SCHEMAS` map in `actionSchema.ts` is the single source of truth for action validation and can be shared between the LSP server and legacy providers.
4. The `deck-markdown` language identifier is already registered in `package.json` and will be used as the LSP document selector.
5. Incremental document sync (`TextDocumentSyncKind.Incremental`) is sufficient for typical deck file editing patterns; full sync is not required.
6. Workspace file path completions can be bounded to a reasonable cache size (e.g., 10,000 files) and refreshed via file watcher events.
7. The provider migration can be phased: LSP server launches with core features (completion, diagnostics, hover), and advanced features (code actions, go-to-definition, folding) are added incrementally.
8. The 003-authoring-reliability providers will remain as the fallback behind the feature flag during the migration period.
