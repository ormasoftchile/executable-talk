/**
 * Environment variable types for deck env system
 * Per data-model.md entity tables and contracts.
 */

// ============================================================================
// Env Declaration (from frontmatter)
// ============================================================================

/**
 * A single environment variable requirement declared in the deck's
 * YAML frontmatter `env:` block.
 */
export interface EnvDeclaration {
  /** Variable name (valid identifier: [A-Za-z_][A-Za-z0-9_]*) */
  name: string;
  /** Human-readable description for guided setup and hover docs */
  description: string;
  /** Whether the variable must be present in .deck.env */
  required: boolean;
  /** Whether the value should be masked in the webview */
  secret: boolean;
  /** Validation rule: directory, file, command, url, port, regex:<pattern> */
  validate?: string;
  /** Fallback value used when .deck.env does not provide the variable */
  default?: string;
}

// ============================================================================
// Env File (.deck.env parsed)
// ============================================================================

/**
 * A parse error from a malformed line in .deck.env
 */
export interface EnvFileError {
  /** 1-based line number in .deck.env file */
  line: number;
  /** Human-readable error description */
  message: string;
  /** The original malformed line text */
  rawText: string;
}

/**
 * Parsed .deck.env sidecar file
 */
export interface EnvFile {
  /** Absolute path to the .deck.env file */
  filePath: string;
  /** Parsed key-value pairs */
  values: Map<string, string>;
  /** Parse errors (malformed lines) with line numbers */
  errors: EnvFileError[];
  /** Whether the file was found on disk */
  exists: boolean;
}

// ============================================================================
// Resolution
// ============================================================================

/**
 * Resolution status for a single environment variable.
 * 4 possible states — 'default' is NOT a status; use source='default' to distinguish.
 */
export type ResolvedVarStatus =
  | 'resolved'
  | 'resolved-invalid'
  | 'missing-optional'
  | 'missing-required';

/**
 * Result of running a validation rule against a variable value.
 */
export interface EnvValidationResult {
  /** The validation rule that was applied */
  rule: string;
  /** Whether validation passed */
  passed: boolean;
  /** Human-readable validation result */
  message: string;
}

/**
 * Workspace context for env validation rules (file/directory resolution).
 */
export interface EnvValidationContext {
  /** Workspace root for resolving relative paths */
  workspaceRoot: string;
  /** Deck file directory for resolving relative paths */
  deckDirectory: string;
}

/**
 * A single resolved environment variable with display and execution values.
 */
export interface ResolvedVar {
  /** Variable name (matches EnvDeclaration.name) */
  name: string;
  /** Back-reference to the declaration */
  declaration: EnvDeclaration;
  /** Resolution status */
  status: ResolvedVarStatus;
  /** The actual value (from .deck.env or default). Absent if unresolved. */
  resolvedValue?: string;
  /** What to show in UI: the real value, '•••••' (for secrets), or '<missing>' */
  displayValue: string;
  /** Where the value came from */
  source: 'env-file' | 'default' | 'unresolved';
  /** Result of running the validate rule (if any) */
  validationResult?: EnvValidationResult;
}

/**
 * Runtime collection of resolved environment variables.
 */
export interface ResolvedEnv {
  /** All declared variables with resolution status */
  variables: Map<string, ResolvedVar>;
  /** true if all required variables are satisfied */
  isComplete: boolean;
  /** List of variable names marked secret: true */
  secrets: string[];
  /** Sorted (longest first) resolved values of secret variables (for scrubbing) */
  secretValues: string[];
}

// ============================================================================
// Env Status (sent to webview — no secret values)
// ============================================================================

/**
 * Per-variable summary entry for webview display.
 */
export interface EnvStatusEntry {
  /** Variable name */
  name: string;
  /** Resolution status */
  status: ResolvedVarStatus;
  /** Displayed value (real for non-secret, '•••••' for secret) */
  displayValue: string;
}

/**
 * Status summary sent to the webview for display.
 * Respects FR-010 — no secret values cross the boundary.
 */
export interface EnvStatus {
  /** Total declared variables */
  total: number;
  /** Variables with status === 'resolved' */
  resolved: number;
  /** Names of required variables that are missing */
  missing: string[];
  /** Names of variables that failed validation */
  invalid: string[];
  /** Whether any variable is marked secret: true */
  hasSecrets: boolean;
  /** All required variables satisfied and valid */
  isComplete: boolean;
  /** Per-variable summary (values masked for secrets) */
  variables: EnvStatusEntry[];
}
