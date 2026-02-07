# Preflight Validation Contract

**Feature**: 003-authoring-reliability  
**Date**: 2026-02-07  
**Version**: 1.0.0

## Overview

This document defines the contract for the `Executable Talk: Validate Deck` command, which performs preflight checks on all actions and render directives in a deck before presentation.

---

## Command Registration

```typescript
/**
 * Command ID: executableTalk.validateDeck
 * Title: "Executable Talk: Validate Deck"
 * Activation: Registered on extension activation
 * Precondition: A .deck.md file is open in the active editor
 */
```

---

## Validator Interface

```typescript
/**
 * Severity levels for validation issues
 */
type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * A single validation issue
 */
interface ValidationIssue {
  severity: ValidationSeverity;
  slideIndex: number;          // 0-based
  source: string;              // e.g., "file.open", "render:command"
  target?: string;             // e.g., file path, command, config name
  message: string;             // human-readable description
  line?: number;               // 1-based line in .deck.md file
  range?: { start: number; end: number };  // character range for diagnostics
}

/**
 * Complete validation result
 */
interface ValidationReport {
  deckFilePath: string;
  timestamp: number;
  durationMs: number;
  issues: ValidationIssue[];
  checksPerformed: number;
  slideCount: number;
  actionCount: number;
  renderDirectiveCount: number;
  passed: boolean;             // true if no errors (warnings allowed)
}

/**
 * Individual check interface
 */
interface ValidationCheck {
  /** Human-readable description (for progress display) */
  description: string;
  /** Execute the check, returning zero or more issues */
  run(context: ValidationContext): Promise<ValidationIssue[]>;
}

/**
 * Context provided to all validation checks
 */
interface ValidationContext {
  /** Parsed deck */
  deck: Deck;
  /** Workspace root path */
  workspaceRoot: string;
  /** Whether workspace is trusted */
  isTrusted: boolean;
  /** Cancellation token */
  cancellationToken: CancellationToken;
}
```

---

## Validation Checks

### FilePathCheck

**Applies to**: `file.open`, `editor.highlight`, `render:file`, `render:diff`

| Input | Check | Issue |
|-------|-------|-------|
| `params.path` | `vscode.workspace.fs.stat(uri)` | Error: "File '{path}' not found in workspace" |

**Behavior**: Resolves path relative to `workspaceRoot`. Parallel execution for all paths.

---

### LineRangeCheck

**Applies to**: `editor.highlight`, `render:file` (with `lines` parameter)

| Input | Check | Issue |
|-------|-------|-------|
| `params.lines` (e.g., "10-20") | Parse range, read file line count | Error: "Line range {start}-{end} exceeds file length ({actualLines} lines) for '{path}'" |

**Behavior**: Only runs after `FilePathCheck` confirms the file exists. Uses `vscode.workspace.fs.readFile()` to count lines.

---

### DebugConfigCheck

**Applies to**: `debug.start`

| Input | Check | Issue |
|-------|-------|-------|
| `params.configName` | `vscode.workspace.getConfiguration('launch').get('configurations')` | Error: "Debug configuration '{configName}' not found. Available: {names}" |

**Behavior**: Reads launch configurations from VS Code settings API. Lists available configuration names in the error message for discoverability.

---

### CommandAvailabilityCheck

**Applies to**: `render:command`, `terminal.run`

| Input | Check | Issue |
|-------|-------|-------|
| `params.cmd` or `params.command` | Extract binary (first token), `execFile('which'/'where.exe', [binary])` | Warning: "Command '{binary}' not found on system PATH" |

**Behavior**: 2-second timeout per check. Shell builtins may not be found — issue severity is `warning`, not `error`. Platform-aware: `which` on Unix, `where.exe` on Windows.

---

### TrustCheck

**Applies to**: `terminal.run`, `debug.start`

| Input | Check | Issue |
|-------|-------|-------|
| Action type | `context.isTrusted` | Warning: "Action '{type}' requires Workspace Trust (workspace is untrusted)" |

**Behavior**: Only emits issues when workspace is untrusted. Severity is `warning` (not error) per FR-013.

---

## Execution Flow

```
executableTalk.validateDeck command
  │
  ├── 1. Get active .deck.md file from editor
  ├── 2. Parse deck (using existing parseDeck)
  ├── 3. Collect all checks from all slides
  │      ├── FilePathCheck (for each file-referencing action/directive)
  │      ├── LineRangeCheck (for each line-range action/directive)
  │      ├── DebugConfigCheck (for each debug.start action)
  │      ├── CommandAvailabilityCheck (for each render:command directive)
  │      └── TrustCheck (for each trust-requiring action)
  │
  ├── 4. Execute checks with progress
  │      vscode.window.withProgress({
  │        location: ProgressLocation.Notification,
  │        title: 'Validating deck...',
  │        cancellable: true
  │      })
  │      Phase 1: File stat checks (parallel)     → 40%
  │      Phase 2: Line range checks (parallel)    → 25%
  │      Phase 3: Command PATH checks (parallel)  → 25%
  │      Phase 4: Config + trust checks (sync)    → 10%
  │
  ├── 5. Build ValidationReport
  │
  └── 6. Report results
         ├── DiagnosticCollection — set diagnostics on .deck.md file URI
         ├── OutputChannel — write detailed log
         └── Notification — summary toast with "Show Problems" action
```

---

## Report Output

### Success Case

```
OutputChannel:
  ═══════════════════════════════════════════
  Executable Talk: Validate Deck
  ═══════════════════════════════════════════
  File: presentation.deck.md
  Time: 2026-02-07 14:30:00 (342ms)
  
  ✅ 15 checks passed
     • 8 file paths verified
     • 3 line ranges validated
     • 2 commands found on PATH
     • 1 debug configuration confirmed
     • 1 trust check passed
  
  Deck is ready to present!

Notification: "✅ Deck validated: 15 checks passed. Ready to present!"
```

### Failure Case

```
OutputChannel:
  ═══════════════════════════════════════════
  Executable Talk: Validate Deck
  ═══════════════════════════════════════════
  File: presentation.deck.md
  Time: 2026-02-07 14:30:00 (567ms)
  
  ❌ Slide 3: file.open — File 'src/old-main.ts' not found in workspace
  ❌ Slide 5: editor.highlight — Line range 80-110 exceeds file length (87 lines) for 'src/utils.ts'
  ⚠️ Slide 7: terminal.run — Action requires Workspace Trust (workspace is untrusted)
  ✅ 12 other checks passed

  Summary: 2 errors, 1 warning in 15 checks

Notification: "⚠️ Deck has 2 errors, 1 warning. See Problems panel."
Diagnostics: 3 inline markers on the .deck.md file
```

---

## Diagnostic Lifecycle

| Event | Action |
|-------|--------|
| `validateDeck` command runs | Set diagnostics on `.deck.md` file URI |
| `.deck.md` file is closed | Clear diagnostics for that URI |
| `.deck.md` file is re-validated | Replace previous diagnostics |
| Extension deactivates | Dispose `DiagnosticCollection` |
