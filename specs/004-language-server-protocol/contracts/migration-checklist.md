# Contract — Migration Checklist

Step-by-step migration from direct VS Code providers to LSP server.

---

## Pre-Migration Checklist

| # | Task                                                                  | Status |
|---|-----------------------------------------------------------------------|--------|
| 1 | Add `vscode-languageserver` 9.x and `vscode-languageclient` 9.x to `devDependencies` | ☐ |
| 2 | Add `vscode-languageserver-textdocument` 1.x to `dependencies`       | ☐      |
| 3 | Add `executableTalk.useLsp` boolean setting to `package.json` `contributes.configuration` | ☐ |
| 4 | Create `src/server/` directory structure per plan.md                  | ☐      |
| 5 | Verify `deck-markdown` language ID is registered in `package.json`    | ☐      |
| 6 | Verify activation event `onLanguage:deck-markdown` exists (add if missing) | ☐ |

---

## Server Implementation Checklist

| # | Task                                                                  | TDD Gate | Status |
|---|-----------------------------------------------------------------------|----------|--------|
| 7 | Implement `DeckDocument.create()` with slide boundary detection        | `deckDocument.test.ts` | ☐ |
| 8 | Implement `DeckDocument.applyChange()` for incremental updates         | `deckDocument.test.ts` | ☐ |
| 9 | Implement `DeckDocument.parseActionBlocks()` with range tracking       | `deckDocument.test.ts` | ☐ |
| 10 | Implement `DeckDocument.extractParameters()` with YAML range mapping  | `deckDocument.test.ts` | ☐ |
| 11 | Implement `DeckDocumentManager` (open/update/close/get)               | `deckDocument.test.ts` | ☐ |
| 12 | Implement `detectContext()` — all 5 variants                          | `contextDetector.test.ts` | ☐ |
| 13 | Implement `completionHandler` — type, param-name, param-value         | `completionHandler.test.ts` | ☐ |
| 14 | Implement `diagnosticHandler` — all 15 diagnostic codes               | `diagnosticHandler.test.ts` | ☐ |
| 15 | Implement `hoverHandler` — type, param, inline link, render directive | `hoverHandler.test.ts` | ☐ |
| 16 | Implement `documentSymbolHandler` — slides, blocks, directives        | `documentSymbolHandler.test.ts` | ☐ |
| 17 | Implement `codeActionHandler` — typos, missing params                 | `codeActionHandler.test.ts` | ☐ |
| 18 | Implement `definitionHandler` — path, cwd, config                     | `definitionHandler.test.ts` | ☐ |
| 19 | Implement `foldingRangeHandler` — slides, blocks, frontmatter         | `foldingRangeHandler.test.ts` | ☐ |
| 20 | Implement `WorkspaceFileCache` — init, refresh, filter                | `workspaceFileCache.test.ts` | ☐ |
| 21 | Implement `server.ts` — connection, capability registration           | `serverLifecycle.test.ts` | ☐ |
| 22 | Implement debounce utility                                            | `debounce.test.ts` | ☐ |

---

## Client Integration Checklist

| # | Task                                                                  | Status |
|---|-----------------------------------------------------------------------|--------|
| 23 | Add `LanguageClient` initialization to `extension.ts`                | ☐      |
| 24 | Implement feature-flag reading (`executableTalk.useLsp`)             | ☐      |
| 25 | Implement conditional provider registration (LSP vs legacy)          | ☐      |
| 26 | Implement hot-swap on configuration change                           | ☐      |
| 27 | Add LSP client to extension disposables                              | ☐      |
| 28 | Add `onLanguage:deck-markdown` to activation events if missing       | ☐      |

---

## Parity Verification Checklist

| # | Verification                                                          | Status |
|---|-----------------------------------------------------------------------|--------|
| 29 | Action type completions match `ActionCompletionProvider` output       | ☐      |
| 30 | Parameter name completions match (required-first sorting)             | ☐      |
| 31 | Sequence step completions work (no `sequence` in step types)          | ☐      |
| 32 | Hover on action type matches `ActionHoverProvider` output             | ☐      |
| 33 | Hover on parameter name matches `ActionHoverProvider` output          | ☐      |
| 34 | All 10 diagnostic types from `ActionDiagnosticProvider` are covered   | ☐      |
| 35 | Diagnostic ranges are equal or more precise than legacy               | ☐      |
| 36 | Legacy providers still work when `executableTalk.useLsp` is `false`  | ☐      |

---

## Post-Migration Checklist

| # | Task                                                                  | Status |
|---|-----------------------------------------------------------------------|--------|
| 37 | Performance benchmark: completion < 100 ms on 500-slide doc           | ☐      |
| 38 | Performance benchmark: diagnostics < 200 ms on 500-slide doc          | ☐      |
| 39 | Integration test: server lifecycle (init → change → close)            | ☐      |
| 40 | Integration test: feature flag toggle                                 | ☐      |
| 41 | Manual QA: open demo.deck.md with LSP enabled                        | ☐      |
| 42 | Manual QA: toggle feature flag and verify fallback                    | ☐      |
| 43 | Update README with LSP feature documentation                          | ☐      |
| 44 | Update CHANGELOG with 004 entry                                       | ☐      |

---

## Cleanup (Post-Release)

| # | Task                                                                  | Status |
|---|-----------------------------------------------------------------------|--------|
| 45 | Remove `executableTalk.useLsp` setting (always LSP)                  | ☐      |
| 46 | Remove `src/providers/actionCompletionProvider.ts`                    | ☐      |
| 47 | Remove `src/providers/actionHoverProvider.ts`                         | ☐      |
| 48 | Remove `src/providers/actionDiagnosticProvider.ts`                    | ☐      |
| 49 | Remove adapter code from `extension.ts`                               | ☐      |
| 50 | Update `package.json` activation events (remove unnecessary ones)     | ☐      |

---

## Risk Register

| Risk                                          | Impact | Mitigation                                      |
|-----------------------------------------------|--------|--------------------------------------------------|
| LSP server blocks extension host event loop   | High   | All parsing is O(n); no sync file I/O; try/catch at handler boundary |
| Position convention mismatch between layers   | Medium | Standardize on 0-based LSP coordinates in `DeckDocument`; converter utilities for legacy data |
| YAML range extraction loses precision         | Medium | Use js-yaml `mark` for errors; line-by-line scanning for parameters |
| Feature flag hot-swap causes state leaks      | Low    | Explicit dispose of LSP client / legacy provider disposables |
| Workspace file cache grows unbounded          | Low    | Hard limit of 10,000 entries; `.gitignore` filtering |
