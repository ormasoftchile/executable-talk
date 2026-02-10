/**
 * Action schema definitions for authoring providers and validation
 * Provides static metadata for all 9 action types: required/optional params,
 * types, descriptions, and completionKind hints.
 *
 * Per data-model.md entity schema and spec.md US4.
 */

import { ActionType } from '../models/action';

/**
 * Hint for completion provider behavior
 */
export type CompletionKind = 'file' | 'launchConfig' | 'enum' | 'text';

/**
 * Schema for a single action parameter
 */
export interface ActionParameterSchema {
  /** Parameter name (e.g., 'path', 'lines', 'command') */
  name: string;
  /** Parameter value type */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  /** Whether the parameter is required */
  required: boolean;
  /** Human-readable description for hover/completion docs */
  description: string;
  /** Allowed values (for enumerated parameters like 'style') */
  enum?: string[];
  /** Hint for completion provider behavior */
  completionKind?: CompletionKind;
}

/**
 * Schema for an action type
 */
export interface ActionSchema {
  /** Action type identifier */
  type: ActionType;
  /** Human-readable description for hover docs */
  description: string;
  /** Whether the action requires Workspace Trust */
  requiresTrust: boolean;
  /** Parameter definitions */
  parameters: ActionParameterSchema[];
}

/**
 * Static metadata map for all 9 action types.
 * Built once at module load time; used by completion, hover, diagnostic providers
 * and by the action block parser for type/param validation.
 */
export const ACTION_SCHEMAS: ReadonlyMap<ActionType, ActionSchema> = new Map<ActionType, ActionSchema>([
  [
    'file.open',
    {
      type: 'file.open',
      description: 'Opens a file in the VS Code editor at an optional line and column.',
      requiresTrust: false,
      parameters: [
        {
          name: 'path',
          type: 'string',
          required: true,
          description: 'Workspace-relative file path to open.',
          completionKind: 'file',
        },
        {
          name: 'line',
          type: 'number',
          required: false,
          description: '1-based line number to reveal after opening.',
        },
        {
          name: 'column',
          type: 'number',
          required: false,
          description: '1-based column number to position the cursor.',
        },
        {
          name: 'range',
          type: 'string',
          required: false,
          description: 'Line range to select (e.g., "10-20").',
        },
        {
          name: 'viewColumn',
          type: 'number',
          required: false,
          description: 'Editor view column to open in (1 = first, 2 = second, etc.).',
        },
        {
          name: 'preview',
          type: 'boolean',
          required: false,
          description: 'Whether to open as a preview tab (default: false).',
        },
      ],
    },
  ],
  [
    'editor.highlight',
    {
      type: 'editor.highlight',
      description: 'Highlights a range of lines in an already-open file with a configurable style.',
      requiresTrust: false,
      parameters: [
        {
          name: 'path',
          type: 'string',
          required: true,
          description: 'Workspace-relative file path.',
          completionKind: 'file',
        },
        {
          name: 'lines',
          type: 'string',
          required: true,
          description: 'Line range to highlight (e.g., "10-20" or "10").',
        },
        {
          name: 'color',
          type: 'string',
          required: false,
          description: 'CSS color for the highlight decoration.',
        },
        {
          name: 'style',
          type: 'string',
          required: false,
          description: 'Highlight style.',
          enum: ['subtle', 'prominent'],
          completionKind: 'enum',
        },
        {
          name: 'duration',
          type: 'number',
          required: false,
          description: 'Duration in ms (0 = until slide exit).',
        },
      ],
    },
  ],
  [
    'terminal.run',
    {
      type: 'terminal.run',
      description: 'Runs a shell command in the integrated terminal.',
      requiresTrust: true,
      parameters: [
        {
          name: 'command',
          type: 'string',
          required: true,
          description: 'Command to execute in the terminal. Can be a plain string or a platform command map object with keys: macos, windows, linux, default. Example: { macos: "open .", windows: "explorer .", default: "xdg-open ." }. Supports placeholders: ${pathSep}, ${home}, ${shell}, ${pathDelimiter}. String params support `{{ENV_VAR}}` interpolation from env declarations.',
        },
        {
          name: 'name',
          type: 'string',
          required: false,
          description: 'Name for the terminal instance.',
        },
        {
          name: 'background',
          type: 'boolean',
          required: false,
          description: 'Run in background without waiting for completion.',
        },
        {
          name: 'timeout',
          type: 'number',
          required: false,
          description: 'Timeout in ms (default: 30000).',
        },
        {
          name: 'clear',
          type: 'boolean',
          required: false,
          description: 'Clear terminal before execution.',
        },
        {
          name: 'reveal',
          type: 'boolean',
          required: false,
          description: 'Show the terminal panel.',
        },
        {
          name: 'cwd',
          type: 'string',
          required: false,
          description: 'Working directory (workspace-relative). Supports `{{ENV_VAR}}` interpolation.',
          completionKind: 'file',
        },
      ],
    },
  ],
  [
    'debug.start',
    {
      type: 'debug.start',
      description: 'Starts a debug session using a named launch configuration.',
      requiresTrust: true,
      parameters: [
        {
          name: 'configName',
          type: 'string',
          required: true,
          description: 'Name of the launch configuration.',
          completionKind: 'launchConfig',
        },
        {
          name: 'workspaceFolder',
          type: 'string',
          required: false,
          description: 'Workspace folder for multi-root workspaces.',
        },
        {
          name: 'stopOnEntry',
          type: 'boolean',
          required: false,
          description: 'Stop at the entry point after launch.',
        },
      ],
    },
  ],
  [
    'sequence',
    {
      type: 'sequence',
      description: 'Executes multiple actions in order with configurable delay between steps.',
      requiresTrust: false,
      parameters: [
        {
          name: 'steps',
          type: 'array',
          required: true,
          description: 'Non-empty array of action definitions to execute in order.',
        },
        {
          name: 'delay',
          type: 'number',
          required: false,
          description: 'Delay in ms between steps (default: 500).',
        },
        {
          name: 'stopOnError',
          type: 'boolean',
          required: false,
          description: 'Stop on first failure (default: true).',
        },
      ],
    },
  ],
  [
    'vscode.command',
    {
      type: 'vscode.command',
      description: 'Executes an arbitrary VS Code command by ID.',
      requiresTrust: false,
      parameters: [
        {
          name: 'id',
          type: 'string',
          required: true,
          description: 'VS Code command ID (e.g., "workbench.action.openSettings").',
        },
        {
          name: 'args',
          type: 'array',
          required: false,
          description: 'Arguments to pass to the command.',
        },
      ],
    },
  ],
  [
    'validate.command',
    {
      type: 'validate.command',
      description: 'Runs a command and validates its exit code and optional output.',
      requiresTrust: true,
      parameters: [
        {
          name: 'command',
          type: 'string',
          required: true,
          description: 'Command to execute. Can be a plain string or a platform command map object.',
        },
        {
          name: 'expectOutput',
          type: 'string',
          required: false,
          description: 'Expected substring in command output.',
        },
        {
          name: 'timeout',
          type: 'number',
          required: false,
          description: 'Timeout in ms (default: 30000).',
        },
      ],
    },
  ],
  [
    'validate.fileExists',
    {
      type: 'validate.fileExists',
      description: 'Validates that a file exists (or is absent).',
      requiresTrust: false,
      parameters: [
        {
          name: 'path',
          type: 'string',
          required: true,
          description: 'Workspace-relative file path to check.',
          completionKind: 'file',
        },
        {
          name: 'expectMissing',
          type: 'boolean',
          required: false,
          description: 'When true, expects the file to be absent.',
        },
      ],
    },
  ],
  [
    'validate.port',
    {
      type: 'validate.port',
      description: 'Validates that a TCP port is open.',
      requiresTrust: false,
      parameters: [
        {
          name: 'port',
          type: 'number',
          required: true,
          description: 'TCP port number to check (1–65535).',
        },
        {
          name: 'host',
          type: 'string',
          required: false,
          description: 'Host to connect to (default: localhost).',
        },
        {
          name: 'timeout',
          type: 'number',
          required: false,
          description: 'Connection timeout in ms (default: 5000).',
        },
      ],
    },
  ],
]);

/**
 * Get the schema for a given action type.
 * Returns undefined for unrecognized types.
 */
export function getActionSchema(type: ActionType): ActionSchema | undefined {
  return ACTION_SCHEMAS.get(type);
}

/**
 * Get all known action type strings.
 */
export function getKnownActionTypes(): ActionType[] {
  return Array.from(ACTION_SCHEMAS.keys());
}

/**
 * Check if a string is a valid action type.
 */
export function isKnownActionType(type: string): type is ActionType {
  return ACTION_SCHEMAS.has(type as ActionType);
}

/**
 * Get required parameter names for an action type.
 */
export function getRequiredParams(type: ActionType): string[] {
  const schema = ACTION_SCHEMAS.get(type);
  if (!schema) {
    return [];
  }
  return schema.parameters.filter((p) => p.required).map((p) => p.name);
}

/**
 * Get all valid parameter names for an action type.
 */
export function getValidParamNames(type: ActionType): string[] {
  const schema = ACTION_SCHEMAS.get(type);
  if (!schema) {
    return [];
  }
  return schema.parameters.map((p) => p.name);
}

/**
 * Scan a TextDocument for fenced ``` action ``` blocks, returning their boundaries.
 * This operates on a VS Code TextDocument (for use by providers).
 * The parser module has its own regex-based variant for raw strings.
 */
export interface ActionBlockRange {
  /** Document line where ```action opens (0-based) */
  startLine: number;
  /** Document line where closing ``` is (0-based) */
  endLine: number;
  /** Raw YAML content between fences */
  content: string;
}

/**
 * Find all fenced action blocks in a TextDocument.
 * Used by completion, hover, and diagnostic providers.
 */
export function findActionBlocks(document: { lineCount: number; lineAt(line: number): { text: string } }): ActionBlockRange[] {
  const blocks: ActionBlockRange[] = [];
  let insideBlock = false;
  let blockStart = -1;
  let contentLines: string[] = [];

  for (let i = 0; i < document.lineCount; i++) {
    const lineText = document.lineAt(i).text;

    if (!insideBlock) {
      // Check for opening fence: ```action (with optional trailing whitespace)
      if (/^```action\s*$/.test(lineText)) {
        insideBlock = true;
        blockStart = i;
        contentLines = [];
      }
    } else {
      // Check for closing fence: ``` (alone on a line with optional whitespace)
      if (/^```\s*$/.test(lineText)) {
        blocks.push({
          startLine: blockStart,
          endLine: i,
          content: contentLines.join('\n'),
        });
        insideBlock = false;
        blockStart = -1;
        contentLines = [];
      } else {
        contentLines.push(lineText);
      }
    }
  }

  return blocks;
}

// ─────────────────────────────────────────────────
// Env Declaration Schema (Feature 006 — T043)
// ─────────────────────────────────────────────────

/**
 * Schema for an env declaration property (used by completion/hover providers).
 */
export interface EnvPropertySchema {
  /** Property name (e.g., 'name', 'required') */
  name: string;
  /** Value type */
  type: 'string' | 'boolean';
  /** Whether the property is required */
  required: boolean;
  /** Description for hover docs */
  description: string;
  /** Allowed values for enum-like properties */
  enum?: string[];
}

/**
 * Validation rules with descriptions for authoring assistance.
 */
export const VALIDATION_RULES: ReadonlyArray<{ name: string; description: string }> = [
  { name: 'directory', description: 'Verifies path exists and is a directory' },
  { name: 'file', description: 'Verifies path exists and is a file' },
  { name: 'command', description: 'Verifies command is available on PATH' },
  { name: 'url', description: 'Verifies value is a valid http/https URL' },
  { name: 'port', description: 'Verifies value is a valid port number (1–65535)' },
  { name: 'regex:', description: 'Verifies value matches the given regular expression (e.g., regex:^v\\d+)' },
];

/**
 * Static schema for env declaration properties in frontmatter.
 * Used by completion and hover providers.
 * Per data-model.md EnvDeclarationSchema.
 */
export const ENV_DECLARATION_SCHEMA: ReadonlyArray<EnvPropertySchema> = [
  {
    name: 'name',
    type: 'string',
    required: true,
    description: 'Unique variable name, referenced as `{{name}}` in action parameters.',
  },
  {
    name: 'description',
    type: 'string',
    required: false,
    description: 'Human-readable description shown during guided setup and in `.deck.env.example`.',
  },
  {
    name: 'required',
    type: 'boolean',
    required: false,
    description: 'Whether the variable must be present in `.deck.env`. Default: `false`. When `true`, preflight validation reports an error if the value is missing.',
  },
  {
    name: 'secret',
    type: 'boolean',
    required: false,
    description: 'When `true`, the value is masked in the webview (displayed as `•••••`) and scrubbed from error messages and streaming output. Default: `false`.',
  },
  {
    name: 'validate',
    type: 'string',
    required: false,
    description: 'Validation rule applied to the resolved value. Supported rules: `directory`, `file`, `command`, `url`, `port`, `regex:<pattern>`.',
    enum: ['directory', 'file', 'command', 'url', 'port', 'regex:'],
  },
  {
    name: 'default',
    type: 'string',
    required: false,
    description: 'Fallback value used when `.deck.env` does not provide a value for this variable.',
  },
];
