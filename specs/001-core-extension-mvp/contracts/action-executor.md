# Action Executor Contract

**Feature**: 001-core-extension-mvp  
**Date**: 2026-01-19  
**Version**: 1.0.0

## Overview

This document defines the interface contract for action executors within the Conductor layer. Each action type has a dedicated executor implementing the `ActionExecutor` interface.

---

## Core Interface

```typescript
/**
 * Context provided to all action executors
 */
interface ExecutionContext {
  /** Absolute path to the workspace root */
  workspaceRoot: string;
  
  /** Absolute path to the .deck.md file */
  deckFilePath: string;
  
  /** Current slide index (0-based) */
  currentSlideIndex: number;
  
  /** Whether workspace is trusted */
  isWorkspaceTrusted: boolean;
  
  /** Cancellation token for aborting long-running actions */
  cancellationToken: CancellationToken;
  
  /** Output channel for logging */
  outputChannel: OutputChannel;
}

/**
 * Result of action execution
 */
interface ExecutionResult {
  /** Whether the action completed successfully */
  success: boolean;
  
  /** Error message if failed */
  error?: string;
  
  /** Whether this action can be undone */
  canUndo: boolean;
  
  /** Function to undo this action (if canUndo is true) */
  undo?: () => Promise<void>;
  
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Interface all action executors must implement
 */
interface ActionExecutor<TParams = unknown> {
  /** Unique action type identifier */
  readonly actionType: ActionType;
  
  /** Human-readable description */
  readonly description: string;
  
  /** Whether this action requires workspace trust */
  readonly requiresTrust: boolean;
  
  /** Default timeout in milliseconds */
  readonly defaultTimeoutMs: number;
  
  /**
   * Validate action parameters before execution
   * @throws ValidationError if parameters are invalid
   */
  validate(params: TParams): void;
  
  /**
   * Execute the action
   */
  execute(params: TParams, context: ExecutionContext): Promise<ExecutionResult>;
}
```

---

## Action Type Definitions

### `file.open`

Opens a file in the editor at an optional position.

```typescript
interface FileOpenParams {
  /** Path relative to workspace root */
  path: string;
  
  /** Optional line number (1-based) */
  line?: number;
  
  /** Optional column number (1-based) */
  column?: number;
  
  /** Whether to preview or fully open */
  preview?: boolean;  // default: false
}

// Executor metadata
const FileOpenExecutor: ActionExecutor<FileOpenParams> = {
  actionType: 'file.open',
  description: 'Opens a file in the editor',
  requiresTrust: false,  // Read-only, safe in untrusted
  defaultTimeoutMs: 5000,
  // ...
};
```

**Undo Behavior**: Closes the opened editor tab (if it was not already open).

---

### `editor.highlight`

Highlights lines in an open editor.

```typescript
interface EditorHighlightParams {
  /** Path relative to workspace root */
  path: string;
  
  /** Starting line (1-based, inclusive) */
  startLine: number;
  
  /** Ending line (1-based, inclusive) */
  endLine: number;
  
  /** Optional highlight style */
  style?: 'subtle' | 'prominent';  // default: 'prominent'
  
  /** Duration in milliseconds (0 = until slide exit) */
  duration?: number;  // default: 0
}

// Executor metadata
const EditorHighlightExecutor: ActionExecutor<EditorHighlightParams> = {
  actionType: 'editor.highlight',
  description: 'Highlights lines in the editor',
  requiresTrust: false,
  defaultTimeoutMs: 1000,
  // ...
};
```

**Undo Behavior**: Removes the highlight decoration.

---

### `terminal.run`

Executes a command in the integrated terminal.

```typescript
interface TerminalRunParams {
  /** Command to execute */
  command: string;
  
  /** Optional terminal name (creates new or reuses existing) */
  name?: string;  // default: 'Executable Talk'
  
  /** Whether to clear terminal before execution */
  clear?: boolean;  // default: false
  
  /** Whether to show terminal panel */
  reveal?: boolean;  // default: true
  
  /** Working directory relative to workspace root */
  cwd?: string;  // default: workspace root
}

// Executor metadata
const TerminalRunExecutor: ActionExecutor<TerminalRunParams> = {
  actionType: 'terminal.run',
  description: 'Runs a command in the terminal',
  requiresTrust: true,  // CRITICAL: Requires trust
  defaultTimeoutMs: 30000,  // 30 seconds
  // ...
};
```

**Undo Behavior**: Sends Ctrl+C and optionally clears terminal.

**Security**: Requires Workspace Trust. In untrusted workspaces, shows error message instead of executing.

---

### `debug.start`

Launches a debug configuration.

```typescript
interface DebugStartParams {
  /** Name of launch configuration from launch.json */
  configuration: string;
  
  /** Override workspace folder (for multi-root) */
  workspaceFolder?: string;
  
  /** Whether to stop at entry point */
  stopOnEntry?: boolean;  // default: false
}

// Executor metadata
const DebugStartExecutor: ActionExecutor<DebugStartParams> = {
  actionType: 'debug.start',
  description: 'Starts a debug session',
  requiresTrust: true,  // CRITICAL: Requires trust
  defaultTimeoutMs: 60000,  // 60 seconds
  // ...
};
```

**Undo Behavior**: Stops the debug session.

**Security**: Requires Workspace Trust.

---

### `sequence`

Executes multiple actions in order.

```typescript
interface SequenceParams {
  /** Ordered list of actions to execute */
  actions: Array<{
    type: ActionType;
    params: unknown;
  }>;
  
  /** Delay between actions in milliseconds */
  delayMs?: number;  // default: 500
  
  /** Whether to stop on first failure */
  stopOnError?: boolean;  // default: true
}

// Executor metadata
const SequenceExecutor: ActionExecutor<SequenceParams> = {
  actionType: 'sequence',
  description: 'Executes a sequence of actions',
  requiresTrust: true,  // If any child requires trust
  defaultTimeoutMs: 120000,  // 2 minutes
  // ...
};
```

**Undo Behavior**: Undoes all executed actions in reverse order.

---

## Action Registry Contract

```typescript
/**
 * Central registry for action executors
 */
interface ActionRegistry {
  /**
   * Register an executor for an action type
   */
  register<T>(executor: ActionExecutor<T>): void;
  
  /**
   * Get executor for action type
   * @throws UnknownActionError if not registered
   */
  get(actionType: ActionType): ActionExecutor;
  
  /**
   * Check if action type is registered
   */
  has(actionType: ActionType): boolean;
  
  /**
   * List all registered action types
   */
  listActionTypes(): ActionType[];
}
```

---

## Execution Pipeline

```typescript
/**
 * Pipeline for executing actions with cross-cutting concerns
 */
interface ExecutionPipeline {
  /**
   * Execute an action through the pipeline
   * Applies: trust check → validation → timeout → execution → result
   */
  execute(
    action: Action,
    context: ExecutionContext
  ): Promise<ExecutionResult>;
}
```

### Pipeline Stages

1. **Trust Gate**: Check `requiresTrust` against `context.isWorkspaceTrusted`
2. **Validation**: Call `executor.validate(params)`
3. **Timeout Wrapper**: Wrap execution with timeout promise race
4. **Execution**: Call `executor.execute(params, context)`
5. **Result Processing**: Log, update UI, prepare undo function

---

## Error Types

```typescript
/** Thrown when action parameters fail validation */
class ValidationError extends Error {
  constructor(
    public readonly actionType: ActionType,
    public readonly field: string,
    public readonly reason: string
  ) {
    super(`Invalid ${field}: ${reason}`);
  }
}

/** Thrown when action type is not registered */
class UnknownActionError extends Error {
  constructor(public readonly actionType: string) {
    super(`Unknown action type: ${actionType}`);
  }
}

/** Thrown when action exceeds timeout */
class TimeoutError extends Error {
  constructor(
    public readonly actionType: ActionType,
    public readonly timeoutMs: number
  ) {
    super(`Action ${actionType} timed out after ${timeoutMs}ms`);
  }
}

/** Thrown when action blocked by trust policy */
class TrustError extends Error {
  constructor(public readonly actionType: ActionType) {
    super(`Action ${actionType} requires workspace trust`);
  }
}
```
