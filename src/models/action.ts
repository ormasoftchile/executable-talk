/**
 * Action types and interfaces for Executable Talk
 * Per data-model.md and contracts/action-executor.md
 */

/**
 * Registered action types that can be executed
 */
export type ActionType =
  | 'file.open'
  | 'editor.highlight'
  | 'terminal.run'
  | 'debug.start'
  | 'sequence'
  | 'vscode.command';

/**
 * Execution status of an action
 */
export type ActionStatus =
  | 'pending'    // Not yet executed
  | 'running'    // Currently executing
  | 'success'    // Completed successfully
  | 'failed'     // Completed with error
  | 'timeout';   // Exceeded time limit

/**
 * Parameters for file.open action
 */
export interface FileOpenParams {
  /** Path relative to workspace root */
  path: string;
  /** Optional line range (e.g., "10-20") */
  range?: string;
  /** Optional line number (1-based) */
  line?: number;
  /** Optional column number (1-based) */
  column?: number;
  /** View column to open in */
  viewColumn?: number;
  /** Whether to preview or fully open */
  preview?: boolean;
}

/**
 * Parameters for editor.highlight action
 */
export interface EditorHighlightParams {
  /** Path relative to workspace root */
  path: string;
  /** Lines to highlight (e.g., "10-20" or "10") */
  lines: string;
  /** Starting line (1-based, inclusive) - parsed from lines */
  startLine?: number;
  /** Ending line (1-based, inclusive) - parsed from lines */
  endLine?: number;
  /** Optional CSS color */
  color?: string;
  /** Highlight style */
  style?: 'subtle' | 'prominent';
  /** Duration in ms (0 = until slide exit) */
  duration?: number;
}

/**
 * Parameters for terminal.run action
 */
export interface TerminalRunParams {
  /** Command to execute */
  command: string;
  /** Terminal name */
  name?: string;
  /** Whether to run in background */
  background?: boolean;
  /** Timeout in ms (default 30000) */
  timeout?: number;
  /** Whether to clear terminal before execution */
  clear?: boolean;
  /** Whether to show terminal panel */
  reveal?: boolean;
  /** Working directory relative to workspace root */
  cwd?: string;
}

/**
 * Parameters for debug.start action
 */
export interface DebugStartParams {
  /** Name of launch configuration */
  configName: string;
  /** Workspace folder for multi-root */
  workspaceFolder?: string;
  /** Whether to stop at entry point */
  stopOnEntry?: boolean;
}

/**
 * Parameters for sequence action
 */
export interface SequenceParams {
  /** Ordered list of actions to execute */
  steps: ActionDefinition[];
  /** Delay between actions in ms (default 500) */
  delay?: number;
  /** Whether to stop on first failure */
  stopOnError?: boolean;
}

/**
 * Parameters for vscode.command action
 */
export interface VscodeCommandParams {
  /** VS Code command ID (e.g., 'workbench.action.openSettings') */
  id: string;
  /** Optional arguments for the command (JSON string or array) */
  args?: string | unknown[];
}

/**
 * Action parameters union type
 */
export type ActionParams =
  | FileOpenParams
  | EditorHighlightParams
  | TerminalRunParams
  | DebugStartParams
  | SequenceParams
  | VscodeCommandParams;

/**
 * Action definition as it appears in YAML frontmatter
 */
export interface ActionDefinition {
  type: ActionType;
  params: Record<string, unknown>;
}

/**
 * Fully resolved Action with runtime state
 */
export interface Action {
  /** Unique identifier (UUID) */
  id: string;
  /** Action type */
  type: ActionType;
  /** Type-specific parameters */
  params: Record<string, unknown>;
  /** Current execution state */
  status: ActionStatus;
  /** Owning slide index */
  slideIndex: number;
  /** Error message if failed */
  error?: string;
  /** Timestamp when execution began */
  startedAt?: number;
  /** Timestamp when execution finished */
  completedAt?: number;
}

/**
 * Create a new action with pending status
 */
export function createAction(
  type: ActionType,
  params: Record<string, unknown>,
  slideIndex: number
): Action {
  return {
    id: generateActionId(),
    type,
    params,
    status: 'pending',
    slideIndex,
  };
}

/**
 * Generate a unique action ID
 */
function generateActionId(): string {
  return `action-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
