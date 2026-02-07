# Plan — 004 Language Server Protocol Support

| Field      | Value                                          |
| ---------- | ---------------------------------------------- |
| **Branch** | `004-language-server-protocol`                 |
| **Date**   | 2025-01-20                                     |
| **Spec**   | `specs/004-language-server-protocol/spec.md`   |

---

## Summary

Migrate the extension's authoring features (autocomplete, inline validation, hover) from direct VS Code provider APIs to a Language Server Protocol (LSP) implementation. The LSP server runs in-process via IPC, introduces a `DeckDocument` model with source-position tracking, and adds new capabilities: document symbols, code actions, go-to-definition, folding ranges, and value-level completions (file paths, launch configs, enum values). A feature flag enables side-by-side operation with the existing 003 providers during migration.

---

## Technical Context

| Dimension      | Detail                                                                         |
| -------------- | ------------------------------------------------------------------------------ |
| Language        | TypeScript 5.3+ (strict mode)                                                |
| Dependencies    | `vscode-languageserver` 9.x, `vscode-languageclient` 9.x, `vscode-languageserver-textdocument` 1.x, `gray-matter` 4.x, `js-yaml` 4.x, `markdown-it` 14.x |
| Storage         | In-memory `DeckDocument` cache per open file; workspace file cache for path completions |
| Testing         | Mocha + Chai (unit), `vscode-languageserver-protocol` test utilities          |
| Platform        | VS Code Extension API 1.85+ with LSP Client/Server                           |
| Performance     | Completion < 100 ms, diagnostics < 200 ms, debounce 300 ms, up to 10K lines  |
| Constraints     | In-process IPC (no separate server process), feature-flag migration           |
| Scale           | Up to 500 slides per document, 10,000 workspace files in path cache           |

---

## Constitution Check

### I. Three-Layer Architecture

| # | Check                                                                 | Pass |
|---|-----------------------------------------------------------------------|------|
| 1 | LSP server is a new layer below the Conductor — does not bypass it    | ✅   |
| 2 | Webview still communicates only via `postMessage` to Conductor         | ✅   |
| 3 | LSP client in `extension.ts` wraps the server; Conductor is unaffected| ✅   |
| 4 | Action execution remains in the Action Registry — LSP only provides editing features | ✅ |

### II. Stateful Demo Management

| # | Check                                                                 | Pass |
|---|-----------------------------------------------------------------------|------|
| 1 | LSP server manages document state, not demo state — no StateStack interference | ✅ |
| 2 | Presentation navigation and action execution are unchanged             | ✅   |
| 3 | State snapshots (undo/redo) remain in the Conductor layer              | ✅   |

### III. Action Registry Compliance

| # | Check                                                                 | Pass |
|---|-----------------------------------------------------------------------|------|
| 1 | LSP server reads `ACTION_SCHEMAS` for validation — does not execute actions | ✅ |
| 2 | All action execution continues through `ActionRegistry`                | ✅   |
| 3 | No new action types introduced by this feature                         | ✅   |

### IV. Test-First Development

| # | Check                                                                 | Pass |
|---|-----------------------------------------------------------------------|------|
| 1 | Unit tests for `DeckDocument` model before implementation              | ✅   |
| 2 | Unit tests for each LSP capability (completion, diagnostics, hover, symbols, code actions) | ✅ |
| 3 | Provider parity tests ensure LSP matches existing behavior             | ✅   |
| 4 | Performance benchmark tests for large documents                        | ✅   |

### V. Presentation-First UX

| # | Check                                                                 | Pass |
|---|-----------------------------------------------------------------------|------|
| 1 | LSP features operate only in the editor — no modal dialogs             | ✅   |
| 2 | Feature flag allows instant fallback to legacy providers               | ✅   |
| 3 | Server crash does not affect active presentation                       | ✅   |
| 4 | Diagnostics are non-blocking (debounced, published asynchronously)     | ✅   |

---

## Project Structure

### Documentation

```
specs/004-language-server-protocol/
├── spec.md                              # Feature specification
├── plan.md                              # This file
├── research.md                          # Architecture decisions (R1–R10)
├── data-model.md                        # DeckDocument structural model
├── quickstart.md                        # Developer guide
├── tasks.md                             # Implementation tasks with TDD gates
├── checklists/
│   └── requirements.md                  # FR traceability matrix
└── contracts/
    ├── document-model.md                # DeckDocument / SlideRange / ActionBlockRange contracts
    ├── lsp-capabilities.md              # LSP capability registration and handler contracts
    └── migration-checklist.md           # Provider-to-LSP migration steps
```

### Source Code

```
src/
├── extension.ts                         # MODIFIED — add LSP client init, feature-flag toggle
├── server/                              # NEW — LSP server package
│   ├── server.ts                        # NEW — Server entry point (connection, capabilities)
│   ├── deckDocument.ts                  # NEW — DeckDocument model with position tracking
│   ├── deckDocumentManager.ts           # NEW — Multi-document cache manager
│   ├── contextDetector.ts              # NEW — ActionContext union detection from cursor position
│   ├── capabilities/                    # NEW — LSP capability handlers
│   │   ├── completionHandler.ts         # NEW — textDocument/completion
│   │   ├── diagnosticHandler.ts         # NEW — textDocument/publishDiagnostics
│   │   ├── hoverHandler.ts             # NEW — textDocument/hover
│   │   ├── documentSymbolHandler.ts     # NEW — textDocument/documentSymbol
│   │   ├── codeActionHandler.ts         # NEW — textDocument/codeAction
│   │   ├── definitionHandler.ts         # NEW — textDocument/definition
│   │   └── foldingRangeHandler.ts       # NEW — textDocument/foldingRange
│   └── utils/                           # NEW — Server utilities
│       ├── workspaceFileCache.ts        # NEW — Cached workspace file listing
│       ├── yamlParser.ts               # NEW — YAML parser with range-preserving error reporting
│       └── debounce.ts                  # NEW — Debounce utility for diagnostics
├── providers/                           # EXISTING — preserved for feature-flag fallback
│   ├── actionCompletionProvider.ts      # EXISTING — legacy completion provider
│   ├── actionHoverProvider.ts           # EXISTING — legacy hover provider
│   ├── actionDiagnosticProvider.ts      # EXISTING — legacy diagnostic provider
│   └── actionSchema.ts                 # EXISTING — shared by both LSP and legacy providers
├── models/                              # EXISTING
│   ├── action.ts                        # EXISTING
│   ├── deck.ts                          # EXISTING
│   └── slide.ts                         # EXISTING
└── parser/                              # EXISTING
    ├── actionLinkParser.ts              # EXISTING
    ├── deckParser.ts                    # EXISTING
    └── slideParser.ts                   # EXISTING

test/
├── unit/
│   └── server/                          # NEW — LSP server unit tests
│       ├── deckDocument.test.ts         # NEW
│       ├── contextDetector.test.ts      # NEW
│       ├── completionHandler.test.ts    # NEW
│       ├── diagnosticHandler.test.ts    # NEW
│       ├── hoverHandler.test.ts         # NEW
│       ├── documentSymbolHandler.test.ts# NEW
│       ├── codeActionHandler.test.ts    # NEW
│       ├── definitionHandler.test.ts    # NEW
│       ├── foldingRangeHandler.test.ts  # NEW
│       └── workspaceFileCache.test.ts   # NEW
└── integration/
    └── lsp/                             # NEW — LSP integration tests
        ├── serverLifecycle.test.ts      # NEW — init/shutdown/crash recovery
        └── providerParity.test.ts       # NEW — LSP vs legacy provider parity
```

---

## Complexity Tracking

| Area                    | Files | New | Modified | Risk   | Notes                                    |
|-------------------------|-------|-----|----------|--------|------------------------------------------|
| LSP Server Core         | 4     | 4   | 0        | High   | `server.ts`, `deckDocument.ts`, `deckDocumentManager.ts`, `contextDetector.ts` |
| Capability Handlers     | 7     | 7   | 0        | Medium | One handler per LSP capability            |
| Server Utilities        | 3     | 3   | 0        | Low    | `workspaceFileCache.ts`, `yamlParser.ts`, `debounce.ts` |
| Extension Integration   | 1     | 0   | 1        | Medium | `extension.ts` — LSP client + feature flag |
| Unit Tests              | 10    | 10  | 0        | Low    | One test file per server module           |
| Integration Tests       | 2     | 2   | 0        | Medium | Server lifecycle + provider parity        |
| Spec Documentation      | 9     | 9   | 0        | Low    | Spec artifacts                            |
| **Totals**              | **36**| **35** | **1** |        |                                          |
