# Contract — LSP Capabilities

Defines the behavioral contracts for each LSP capability handler registered by the server.

---

## Server Initialization

### initialize

```typescript
onInitialize(params: InitializeParams): InitializeResult
```

**Postconditions:**
- Returns `capabilities` object declaring:
  - `completionProvider: { triggerCharacters: [':', '/', ' ', '?'], resolveProvider: false }`
  - `hoverProvider: true`
  - `diagnosticProvider: undefined` (push model via `textDocument/publishDiagnostics`)
  - `documentSymbolProvider: true`
  - `codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix] }`
  - `definitionProvider: true`
  - `foldingRangeProvider: true`
  - `textDocumentSync: TextDocumentSyncKind.Incremental`
- `DeckDocumentManager` is initialized.
- `WorkspaceFileCache` begins initial population (async, non-blocking).

### initialized

```typescript
onInitialized(): void
```

**Postconditions:**
- File watcher registration sent for `**/*.deck.md`, `**/.vscode/launch.json`.
- Workspace file cache population completes.

---

## textDocument/completion

### Handler

```typescript
onCompletion(params: CompletionParams): CompletionItem[] | null
```

**Preconditions:**
- Document with `params.textDocument.uri` is open in the manager.

**Postconditions by context:**

| ActionContext     | Result                                                                     |
|-------------------|---------------------------------------------------------------------------|
| `type-value`      | All 6 action types with `detail` (description) and `textEdit` (replace range). Filtered by `partialValue`. |
| `param-name`      | Parameter names for the resolved type. Required params have `sortText` prefix `0_`, optional `1_`. Already-present params excluded. Each item includes `textEdit` inserting `name: `. |
| `param-value`     | Depends on parameter: file paths for `path`/`cwd`, enum values for constrained params, launch config names for `config`. Returns `null` if no value completions available. |
| `step-context`    | Recursed: type completions exclude `sequence`. Param completions use step's resolved type. |
| `unknown`         | Returns `null`.                                                           |

**Invariants:**
- Every `CompletionItem` includes a `textEdit` with a `Range` that is within the document bounds.
- `insertTextFormat` is `PlainText` for all items (no snippet syntax).
- Response time < 100 ms for documents up to 500 slides.

---

## textDocument/publishDiagnostics

### Trigger

Diagnostics are published after a 300 ms debounce following the last `textDocument/didChange` event.

### Diagnostic Rules

| Code     | Severity | Condition                                          | Range                          |
|----------|----------|----------------------------------------------------|--------------------------------|
| `ET001`  | Error    | YAML parse error in action block                   | Exact error position from js-yaml mark |
| `ET002`  | Error    | Missing `type` field in action block               | First line of block content    |
| `ET003`  | Error    | Unknown action type                                | `typeRange` of the block       |
| `ET004`  | Error    | Missing required parameter                         | Last line of block content (insertion point) |
| `ET005`  | Warning  | Unknown parameter name                             | `keyRange` of the parameter    |
| `ET006`  | Error    | Sequence step missing `type`                       | Step's first line              |
| `ET007`  | Error    | Sequence step unknown type                         | Step's `typeRange`             |
| `ET008`  | Error    | Sequence step missing required param               | Step's last line               |
| `ET009`  | Warning  | Sequence step unknown param                        | Step's `keyRange`              |
| `ET010`  | Warning  | Unclosed action block (no closing fence)           | Opening fence line             |
| `ET011`  | Error    | Inline action link unknown type                    | `typeRange` of the link        |
| `ET012`  | Warning  | Inline action link unknown parameter               | Param range in the link        |
| `ET013`  | Error    | Render directive unknown type                      | `typeRange` of the directive   |
| `ET014`  | Warning  | Render directive unknown parameter                 | Param range in the directive   |
| `ET015`  | Hint     | Empty action block                                 | Full block range               |

**Invariants:**
- Every diagnostic has a `code` (string from table above).
- Every diagnostic has a `source` of `"Executable Talk"`.
- Diagnostic ranges are precise — they underline the specific token, not the entire line.
- Diagnostics are cleared when the document is closed.

---

## textDocument/hover

### Handler

```typescript
onHover(params: HoverParams): Hover | null
```

**Postconditions by cursor position:**

| Cursor Position                  | Hover Content                                                |
|----------------------------------|--------------------------------------------------------------|
| On action type value             | Markdown: description, trust requirement (⚠️ if trusted), full parameter table |
| On parameter name                | Markdown: type, required status, description, allowed values |
| On inline action link type       | Markdown: action description and parameter summary           |
| On render directive type         | Markdown: render type description and parameter list         |
| Elsewhere                        | Returns `null`                                               |

**Invariants:**
- Hover `range` matches the exact token being hovered.
- Hover content is `MarkupKind.Markdown`.
- Trust warnings use ⚠️ emoji prefix, not blocking UI.

---

## textDocument/documentSymbol

### Handler

```typescript
onDocumentSymbol(params: DocumentSymbolParams): DocumentSymbol[]
```

**Postconditions:**
- Returns a hierarchical `DocumentSymbol[]`:
  - **Slides**: `SymbolKind.Module`, name = frontmatter `title` or `"Slide {N}"` (1-based), range = slide range, selectionRange = first content line.
  - **Action blocks** (children of slide): `SymbolKind.Function`, name = action type (e.g., `"file.open"`) or `"action"` if type unknown, range = block range, selectionRange = type line.
  - **Render directives** (children of slide): `SymbolKind.Object`, name = label or `"render:{type}"`, range = directive range, selectionRange = directive range.
- Empty slides produce a symbol with no children.
- Symbols are ordered by position.

---

## textDocument/codeAction

### Handler

```typescript
onCodeAction(params: CodeActionParams): CodeAction[]
```

**Preconditions:**
- `params.context.diagnostics` contains diagnostics from this server (matching `source: "Executable Talk"`).

**Postconditions by diagnostic code:**

| Diagnostic Code | Code Action                                                              |
|-----------------|--------------------------------------------------------------------------|
| `ET003`         | "Did you mean '{type}'?" for each valid type within Levenshtein distance ≤ 2. `isPreferred: true` for distance 1. Edit replaces `typeRange`. |
| `ET004`         | "Add required parameter '{name}'" for each missing required param. Edit inserts `name: \n` before block end. `isPreferred: true` for first required param. |
| `ET005`         | "Remove unknown parameter '{name}'" — edit deletes the parameter line.   |
| `ET006`         | "Add 'type' field to step" — edit inserts `type: \n` at step start.     |

**Invariants:**
- All code actions have `kind: CodeActionKind.QuickFix`.
- All edits use `WorkspaceEdit` with `TextEdit` arrays.
- Edit ranges are within document bounds.

---

## textDocument/definition

### Handler

```typescript
onDefinition(params: DefinitionParams): Location | Location[] | null
```

**Postconditions by cursor position:**

| Cursor Position                        | Definition Target                                      |
|----------------------------------------|--------------------------------------------------------|
| On `path` parameter value              | File URI resolved relative to workspace root           |
| On `cwd` parameter value               | Directory URI resolved relative to workspace root      |
| On `config` parameter value            | Location in `.vscode/launch.json` at matching config   |
| On file path in inline action link     | File URI resolved relative to workspace root           |
| On file path in render directive       | File URI resolved relative to workspace root           |
| Elsewhere / target doesn't exist       | Returns `null`                                         |

**Invariants:**
- Non-existent targets return `null` (no error, no notification).
- Resolved paths use workspace root as base.
- Multiple workspace folders are tried in order.

---

## textDocument/foldingRange

### Handler

```typescript
onFoldingRange(params: FoldingRangeParams): FoldingRange[]
```

**Postconditions:**
- Returns folding ranges for:
  - **Slides**: from `---` delimiter to next `---` delimiter (or document end). `kind: FoldingRangeKind.Region`.
  - **Action blocks**: from `` ```action `` to closing `` ``` ``. `kind: FoldingRangeKind.Region`.
  - **Frontmatter**: from first `---` to second `---`. `kind: FoldingRangeKind.Comment`.
- Ranges are ordered by start line.
- Nested ranges (action block within slide) are both returned — VS Code handles nesting.

---

## Document Synchronization

### textDocument/didOpen

```typescript
onDidOpenTextDocument(params: DidOpenTextDocumentParams): void
```

**Postconditions:**
- `DeckDocumentManager.open()` called with `uri`, `version`, `text`.
- Initial diagnostics computed and published.

### textDocument/didChange

```typescript
onDidChangeTextDocument(params: DidChangeTextDocumentParams): void
```

**Postconditions:**
- `DeckDocumentManager.update()` called with `uri`, `version`, `contentChanges`.
- Diagnostic recomputation scheduled (300 ms debounce).

### textDocument/didClose

```typescript
onDidCloseTextDocument(params: DidCloseTextDocumentParams): void
```

**Postconditions:**
- `DeckDocumentManager.close()` called with `uri`.
- Diagnostics cleared for the document.
- Any pending debounce timer cancelled.
