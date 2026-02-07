# Tasks — 004 Language Server Protocol Support

Implementation tasks organized by phase. Every implementation task has a **TDD gate** — the test file must be written before the implementation.

---

## Phase 1 — Server Foundation (DeckDocument Model)

| #  | Task                                                         | TDD Gate                       | FR        | Est  |
|----|--------------------------------------------------------------|--------------------------------|-----------|------|
| 1  | Create `DeckDocument` interface and `create()` factory       | `deckDocument.test.ts`         | FR-006    | 2h   |
| 2  | Implement slide boundary detection (`findSlideBoundaries`)   | `deckDocument.test.ts`         | FR-006    | 2h   |
| 3  | Implement action block parsing with range tracking           | `deckDocument.test.ts`         | FR-006    | 3h   |
| 4  | Implement YAML parameter extraction with range mapping       | `deckDocument.test.ts`         | FR-006,009| 3h   |
| 5  | Implement inline action link parsing with ranges             | `deckDocument.test.ts`         | FR-006    | 2h   |
| 6  | Implement render directive parsing with ranges               | `deckDocument.test.ts`         | FR-006    | 2h   |
| 7  | Implement incremental update (`applyChange`)                 | `deckDocument.test.ts`         | FR-007,008| 4h   |
| 8  | Implement `DeckDocumentManager` (open/update/close/get)      | `deckDocument.test.ts`         | FR-008    | 2h   |
| 9  | Implement debounce utility                                   | `debounce.test.ts`             | FR-018    | 1h   |
| 10 | Implement `yamlParser` wrapper with range-preserving errors  | `yamlParser.test.ts`           | FR-017    | 2h   |

**Phase 1 gate:** All `deckDocument.test.ts` tests pass. DeckDocument correctly parses a multi-slide deck with action blocks, inline links, and render directives, tracking all positions in 0-based LSP coordinates.

---

## Phase 2 — Context Detection

| #  | Task                                                         | TDD Gate                       | FR        | Est  |
|----|--------------------------------------------------------------|--------------------------------|-----------|------|
| 11 | Implement `detectContext` — `unknown` variant                | `contextDetector.test.ts`      | —         | 0.5h |
| 12 | Implement `detectContext` — `type-value` variant             | `contextDetector.test.ts`      | FR-010    | 1h   |
| 13 | Implement `detectContext` — `param-name` variant             | `contextDetector.test.ts`      | FR-011    | 1h   |
| 14 | Implement `detectContext` — `param-value` variant            | `contextDetector.test.ts`      | FR-012    | 1h   |
| 15 | Implement `detectContext` — `step-context` variant           | `contextDetector.test.ts`      | FR-013,020| 2h   |

**Phase 2 gate:** All `contextDetector.test.ts` tests pass. Context detection correctly identifies all 5 variants for cursor positions throughout an action block.

---

## Phase 3 — Core Capabilities (Parity)

| #  | Task                                                         | TDD Gate                       | FR        | Est  |
|----|--------------------------------------------------------------|--------------------------------|-----------|------|
| 16 | Implement `completionHandler` — type completions             | `completionHandler.test.ts`    | FR-010    | 2h   |
| 17 | Implement `completionHandler` — param name completions       | `completionHandler.test.ts`    | FR-011    | 2h   |
| 18 | Implement `completionHandler` — sequence step completions    | `completionHandler.test.ts`    | FR-013    | 1h   |
| 19 | Implement `diagnosticHandler` — YAML parse errors (ET001)    | `diagnosticHandler.test.ts`    | FR-017    | 2h   |
| 20 | Implement `diagnosticHandler` — missing type (ET002)         | `diagnosticHandler.test.ts`    | FR-017    | 1h   |
| 21 | Implement `diagnosticHandler` — unknown type (ET003)         | `diagnosticHandler.test.ts`    | FR-017    | 1h   |
| 22 | Implement `diagnosticHandler` — missing required param (ET004)| `diagnosticHandler.test.ts`   | FR-017    | 1h   |
| 23 | Implement `diagnosticHandler` — unknown param (ET005)        | `diagnosticHandler.test.ts`    | FR-017    | 1h   |
| 24 | Implement `diagnosticHandler` — sequence step validation (ET006–ET009) | `diagnosticHandler.test.ts` | FR-020 | 2h   |
| 25 | Implement `diagnosticHandler` — unclosed block (ET010)       | `diagnosticHandler.test.ts`    | FR-017    | 1h   |
| 26 | Implement `diagnosticHandler` — debounced publishing         | `diagnosticHandler.test.ts`    | FR-018    | 1h   |
| 27 | Implement `hoverHandler` — action type hover                 | `hoverHandler.test.ts`         | FR-023    | 2h   |
| 28 | Implement `hoverHandler` — parameter name hover              | `hoverHandler.test.ts`         | FR-024    | 1h   |

**Phase 3 gate:** All completion, diagnostic, and hover tests pass. Provider parity tests confirm LSP output matches legacy provider output for equivalent inputs.

---

## Phase 4 — Enhanced Capabilities

| #  | Task                                                         | TDD Gate                       | FR        | Est  |
|----|--------------------------------------------------------------|--------------------------------|-----------|------|
| 29 | Implement `documentSymbolHandler` — slide symbols            | `documentSymbolHandler.test.ts`| FR-027,028| 2h   |
| 30 | Implement `documentSymbolHandler` — action block children    | `documentSymbolHandler.test.ts`| FR-029    | 1h   |
| 31 | Implement `documentSymbolHandler` — render directive children| `documentSymbolHandler.test.ts`| FR-027    | 1h   |
| 32 | Implement `foldingRangeHandler` — slide folding              | `foldingRangeHandler.test.ts`  | FR-036    | 1h   |
| 33 | Implement `foldingRangeHandler` — action block folding       | `foldingRangeHandler.test.ts`  | FR-037    | 1h   |
| 34 | Implement `foldingRangeHandler` — frontmatter folding        | `foldingRangeHandler.test.ts`  | FR-038    | 0.5h |

**Phase 4 gate:** Document symbols appear in the Outline panel for a multi-slide deck. Folding ranges work for slides, blocks, and frontmatter.

---

## Phase 5 — Code Actions and Definitions

| #  | Task                                                         | TDD Gate                       | FR        | Est  |
|----|--------------------------------------------------------------|--------------------------------|-----------|------|
| 35 | Implement Levenshtein distance utility                       | `codeActionHandler.test.ts`    | FR-030    | 1h   |
| 36 | Implement `codeActionHandler` — typo correction (ET003)      | `codeActionHandler.test.ts`    | FR-030    | 2h   |
| 37 | Implement `codeActionHandler` — missing param insertion (ET004)| `codeActionHandler.test.ts`   | FR-031    | 2h   |
| 38 | Implement `codeActionHandler` — remove unknown param (ET005) | `codeActionHandler.test.ts`    | FR-032    | 1h   |
| 39 | Implement `definitionHandler` — file path resolution         | `definitionHandler.test.ts`    | FR-033    | 2h   |
| 40 | Implement `definitionHandler` — launch config resolution     | `definitionHandler.test.ts`    | FR-034    | 2h   |
| 41 | Implement `definitionHandler` — non-existent target          | `definitionHandler.test.ts`    | FR-035    | 0.5h |

**Phase 5 gate:** Code actions appear for diagnostic-associated errors. Go-to-definition resolves `path` and `config` params.

---

## Phase 6 — Value Completions

| #  | Task                                                         | TDD Gate                       | FR        | Est  |
|----|--------------------------------------------------------------|--------------------------------|-----------|------|
| 42 | Implement `WorkspaceFileCache` — initial population          | `workspaceFileCache.test.ts`   | FR-045    | 2h   |
| 43 | Implement `WorkspaceFileCache` — file watcher refresh        | `workspaceFileCache.test.ts`   | FR-045    | 1h   |
| 44 | Implement `completionHandler` — file path values             | `completionHandler.test.ts`    | FR-012    | 2h   |
| 45 | Implement `completionHandler` — enum values                  | `completionHandler.test.ts`    | FR-012    | 1h   |
| 46 | Implement `completionHandler` — launch config names          | `completionHandler.test.ts`    | FR-012    | 1h   |
| 47 | Implement `completionHandler` — directory paths for `cwd`    | `completionHandler.test.ts`    | FR-012    | 1h   |
| 48 | Implement `diagnosticHandler` — inline link validation (ET011–ET012) | `diagnosticHandler.test.ts` | FR-021  | 2h   |
| 49 | Implement `diagnosticHandler` — render directive validation (ET013–ET014) | `diagnosticHandler.test.ts` | FR-022 | 2h   |
| 50 | Implement `hoverHandler` — inline link hover                 | `hoverHandler.test.ts`         | FR-025    | 1h   |
| 51 | Implement `hoverHandler` — render directive hover            | `hoverHandler.test.ts`         | FR-026    | 1h   |
| 52 | Implement `completionHandler` — inline link type completions | `completionHandler.test.ts`    | FR-014    | 1h   |
| 53 | Implement `completionHandler` — render directive type completions | `completionHandler.test.ts` | FR-015   | 1h   |

**Phase 6 gate:** File path completions work with workspace file cache. Inline links and render directives get validation, hover, and completions.

---

## Phase 7 — Integration and Migration

| #  | Task                                                         | TDD Gate                       | FR        | Est  |
|----|--------------------------------------------------------------|--------------------------------|-----------|------|
| 54 | Implement `server.ts` — connection and capability registration | `serverLifecycle.test.ts`     | FR-001–005| 3h   |
| 55 | Add `LanguageClient` to `extension.ts`                       | `serverLifecycle.test.ts`      | FR-005    | 2h   |
| 56 | Implement feature flag (`executableTalk.useLsp`)             | Manual QA                      | FR-039,040| 1h   |
| 57 | Implement conditional provider registration                  | Manual QA                      | FR-041,042| 2h   |
| 58 | Implement hot-swap on configuration change                   | Manual QA                      | FR-039    | 2h   |
| 59 | Add `contributes.configuration` to `package.json`            | —                              | FR-039    | 0.5h |
| 60 | Write provider parity integration tests                      | `providerParity.test.ts`       | SC-008    | 3h   |
| 61 | Write performance benchmark tests                            | `performance.test.ts`          | FR-043–046| 2h   |
| 62 | Update README.md with LSP feature documentation              | —                              | —         | 1h   |
| 63 | Update CHANGELOG.md with 004 entry                           | —                              | —         | 0.5h |

**Phase 7 gate:** Full integration test suite passes. Feature flag toggle works without restart. Performance benchmarks pass.

---

## Summary

| Phase | Tasks     | Estimated Hours | Key Deliverable                            |
|-------|-----------|-----------------|--------------------------------------------|
| 1     | 1–10      | 23h             | DeckDocument model with position tracking  |
| 2     | 11–15     | 5.5h            | ActionContext discriminated union           |
| 3     | 16–28     | 18h             | Completion + diagnostics + hover (parity)  |
| 4     | 29–34     | 6.5h            | Document symbols + folding ranges          |
| 5     | 35–41     | 10.5h           | Code actions + go-to-definition            |
| 6     | 42–53     | 16h             | Value completions + inline/render support  |
| 7     | 54–63     | 17h             | Integration, migration, documentation      |
| **Total** | **63** | **96.5h**       |                                            |

---

## FR Traceability

| FR     | Task(s)        | Phase |
|--------|----------------|-------|
| FR-001 | 54             | 7     |
| FR-002 | 54             | 7     |
| FR-003 | 7              | 1     |
| FR-004 | 54             | 7     |
| FR-005 | 54, 55         | 7     |
| FR-006 | 1–6            | 1     |
| FR-007 | 7              | 1     |
| FR-008 | 7, 8           | 1     |
| FR-009 | 4              | 1     |
| FR-010 | 12, 16         | 2, 3  |
| FR-011 | 13, 17         | 2, 3  |
| FR-012 | 14, 44–47      | 2, 6  |
| FR-013 | 15, 18         | 2, 3  |
| FR-014 | 52             | 6     |
| FR-015 | 53             | 6     |
| FR-016 | 16, 17, 18     | 3     |
| FR-017 | 10, 19–23, 25  | 1, 3  |
| FR-018 | 9, 26          | 1, 3  |
| FR-019 | 19–25          | 3     |
| FR-020 | 15, 24         | 2, 3  |
| FR-021 | 48             | 6     |
| FR-022 | 49             | 6     |
| FR-023 | 27             | 3     |
| FR-024 | 28             | 3     |
| FR-025 | 50             | 6     |
| FR-026 | 51             | 6     |
| FR-027 | 29, 31         | 4     |
| FR-028 | 29             | 4     |
| FR-029 | 30             | 4     |
| FR-030 | 35, 36         | 5     |
| FR-031 | 37             | 5     |
| FR-032 | 38             | 5     |
| FR-033 | 39             | 5     |
| FR-034 | 40             | 5     |
| FR-035 | 41             | 5     |
| FR-036 | 32             | 4     |
| FR-037 | 33             | 4     |
| FR-038 | 34             | 4     |
| FR-039 | 56, 58, 59     | 7     |
| FR-040 | 57             | 7     |
| FR-041 | 57             | 7     |
| FR-042 | 57             | 7     |
| FR-043 | 61             | 7     |
| FR-044 | 61             | 7     |
| FR-045 | 42, 43         | 6     |
| FR-046 | 61             | 7     |
