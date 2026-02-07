# Requirements Checklist — 004 Language Server Protocol Support

Traceability matrix mapping each functional requirement to its spec section, implementation task, and test.

---

## Functional Requirements

| FR     | Description                                              | Spec Section         | Task(s) | Test File                    | Status |
|--------|----------------------------------------------------------|----------------------|---------|------------------------------|--------|
| FR-001 | LSP server using vscode-languageserver 9.x               | Server Architecture  | 54      | `serverLifecycle.test.ts`    | ☐      |
| FR-002 | In-process IPC transport                                 | Server Architecture  | 54      | `serverLifecycle.test.ts`    | ☐      |
| FR-003 | Incremental document sync                                | Server Architecture  | 7       | `deckDocument.test.ts`       | ☐      |
| FR-004 | Register for `deck-markdown` language                    | Server Architecture  | 54      | `serverLifecycle.test.ts`    | ☐      |
| FR-005 | Client initialized in extension.ts                       | Server Architecture  | 54, 55  | `serverLifecycle.test.ts`    | ☐      |
| FR-006 | DeckDocument model with position tracking                | Document Model       | 1–6     | `deckDocument.test.ts`       | ☐      |
| FR-007 | Incremental re-parsing on change                         | Document Model       | 7       | `deckDocument.test.ts`       | ☐      |
| FR-008 | Cached DeckDocument with partial invalidation            | Document Model       | 7, 8    | `deckDocument.test.ts`       | ☐      |
| FR-009 | 0-based LSP position coordinates                         | Document Model       | 4       | `deckDocument.test.ts`       | ☐      |
| FR-010 | Completions for action type values                       | Completion           | 12, 16  | `completionHandler.test.ts`  | ☐      |
| FR-011 | Completions for parameter names (required-first)         | Completion           | 13, 17  | `completionHandler.test.ts`  | ☐      |
| FR-012 | Completions for parameter values (paths, enums, configs) | Completion           | 14, 44–47 | `completionHandler.test.ts` | ☐     |
| FR-013 | Exclude `sequence` from step type completions            | Completion           | 15, 18  | `completionHandler.test.ts`  | ☐      |
| FR-014 | Completions for inline action link types                 | Completion           | 52      | `completionHandler.test.ts`  | ☐      |
| FR-015 | Completions for render directive types                   | Completion           | 53      | `completionHandler.test.ts`  | ☐      |
| FR-016 | textEdit fields with precise replace ranges              | Completion           | 16–18   | `completionHandler.test.ts`  | ☐      |
| FR-017 | Diagnostics for YAML errors, missing params, etc.        | Diagnostics          | 10, 19–25 | `diagnosticHandler.test.ts` | ☐     |
| FR-018 | 300 ms debounced diagnostics                             | Diagnostics          | 9, 26   | `diagnosticHandler.test.ts`  | ☐      |
| FR-019 | Precise diagnostic ranges (token-level)                  | Diagnostics          | 19–25   | `diagnosticHandler.test.ts`  | ☐      |
| FR-020 | Recursive sequence step validation                       | Diagnostics          | 15, 24  | `diagnosticHandler.test.ts`  | ☐      |
| FR-021 | Inline action link validation                            | Diagnostics          | 48      | `diagnosticHandler.test.ts`  | ☐      |
| FR-022 | Render directive validation                              | Diagnostics          | 49      | `diagnosticHandler.test.ts`  | ☐      |
| FR-023 | Hover for action type values                             | Hover                | 27      | `hoverHandler.test.ts`       | ☐      |
| FR-024 | Hover for parameter names                                | Hover                | 28      | `hoverHandler.test.ts`       | ☐      |
| FR-025 | Hover for inline action links                            | Hover                | 50      | `hoverHandler.test.ts`       | ☐      |
| FR-026 | Hover for render directives                              | Hover                | 51      | `hoverHandler.test.ts`       | ☐      |
| FR-027 | Hierarchical document symbols                            | Document Symbols     | 29, 31  | `documentSymbolHandler.test.ts` | ☐   |
| FR-028 | Slide symbols use frontmatter title                      | Document Symbols     | 29      | `documentSymbolHandler.test.ts` | ☐   |
| FR-029 | Action block symbols show action type                    | Document Symbols     | 30      | `documentSymbolHandler.test.ts` | ☐   |
| FR-030 | "Did you mean?" typo quick fixes                         | Code Actions         | 35, 36  | `codeActionHandler.test.ts`  | ☐      |
| FR-031 | "Add required parameter" quick fixes                     | Code Actions         | 37      | `codeActionHandler.test.ts`  | ☐      |
| FR-032 | WorkspaceEdit with TextEdit arrays                       | Code Actions         | 38      | `codeActionHandler.test.ts`  | ☐      |
| FR-033 | Go-to-definition for `path` parameters                   | Go-to-Definition     | 39      | `definitionHandler.test.ts`  | ☐      |
| FR-034 | Go-to-definition for `config` parameters                 | Go-to-Definition     | 40      | `definitionHandler.test.ts`  | ☐      |
| FR-035 | Empty result for non-existent targets                    | Go-to-Definition     | 41      | `definitionHandler.test.ts`  | ☐      |
| FR-036 | Folding ranges for slide boundaries                      | Folding Ranges       | 32      | `foldingRangeHandler.test.ts`| ☐      |
| FR-037 | Folding ranges for action blocks                         | Folding Ranges       | 33      | `foldingRangeHandler.test.ts`| ☐      |
| FR-038 | Folding ranges for frontmatter                           | Folding Ranges       | 34      | `foldingRangeHandler.test.ts`| ☐      |
| FR-039 | `executableTalk.useLsp` feature flag (default true)      | Migration            | 56, 58, 59 | Manual QA               | ☐      |
| FR-040 | Legacy providers when flag is false                      | Migration            | 57      | Manual QA                    | ☐      |
| FR-041 | Preserve existing provider classes                       | Migration            | 57      | —                            | ☐      |
| FR-042 | No simultaneous LSP + legacy for same document           | Migration            | 57      | Manual QA                    | ☐      |
| FR-043 | Completion < 100 ms for 500 slides                       | Performance          | 61      | `performance.test.ts`        | ☐      |
| FR-044 | Diagnostics < 200 ms for 500 slides                      | Performance          | 61      | `performance.test.ts`        | ☐      |
| FR-045 | Workspace file cache with file watcher                   | Performance          | 42, 43  | `workspaceFileCache.test.ts` | ☐      |
| FR-046 | Support documents up to 10,000 lines                     | Performance          | 61      | `performance.test.ts`        | ☐      |

---

## Success Criteria

| SC     | Criterion                                                | Verification Method              | Status |
|--------|----------------------------------------------------------|----------------------------------|--------|
| SC-001 | Diagnostic coverage ≥ 100% of current provider           | Provider parity test suite       | ☐      |
| SC-002 | ≥ 7 completion context categories                        | Completion test count            | ☐      |
| SC-003 | ≥ 4 hover target types                                   | Hover test count                 | ☐      |
| SC-004 | Outline panel for 10-slide deck                          | Document symbol integration test | ☐      |
| SC-005 | ≥ 3 code action types                                    | Code action test count           | ☐      |
| SC-006 | Completion < 100 ms, diagnostics < 200 ms                | Performance benchmark            | ☐      |
| SC-007 | Feature flag toggle without restart                      | Feature flag integration test    | ☐      |
| SC-008 | Existing provider tests pass against LSP                 | Provider parity test suite       | ☐      |
| SC-009 | ≥ 3 definition resolution tests                          | Definition handler test count    | ☐      |
| SC-010 | Folding ranges for mixed content                         | Folding range test               | ☐      |
