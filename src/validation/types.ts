/**
 * Validation types for preflight deck validation
 * Per contracts/preflight-validation.md and T015.
 */

import { Deck } from '../models/deck';

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * A single validation issue
 */
export interface ValidationIssue {
  /** Issue severity level */
  severity: ValidationSeverity;
  /** Zero-based slide index where the issue was found */
  slideIndex: number;
  /** The action or directive source (e.g., "file.open", "render:command") */
  source: string;
  /** The specific target (file path, command, config name) */
  target?: string;
  /** Human-readable description of the issue */
  message: string;
  /** Line number in the .deck.md file (1-based, for diagnostic mapping) */
  line?: number;
  /** Character range for diagnostic highlighting */
  range?: { start: number; end: number };
}

/**
 * Complete validation result
 */
export interface ValidationReport {
  /** Absolute path to the validated .deck.md file */
  deckFilePath: string;
  /** Unix timestamp of validation run */
  timestamp: number;
  /** Total validation time in milliseconds */
  durationMs: number;
  /** List of detected issues (may be empty) */
  issues: ValidationIssue[];
  /** Total number of checks executed */
  checksPerformed: number;
  /** Number of slides in the deck */
  slideCount: number;
  /** Number of actions validated */
  actionCount: number;
  /** Number of render directives validated */
  renderDirectiveCount: number;
  /** true if no issues with severity 'error' */
  passed: boolean;
}

/**
 * Context provided to all validation checks
 */
export interface ValidationContext {
  /** Parsed deck */
  deck: Deck;
  /** Workspace root path */
  workspaceRoot: string;
  /** Whether workspace is trusted */
  isTrusted: boolean;
  /** Cancellation token */
  cancellationToken: { isCancellationRequested: boolean };
}

/**
 * Individual check interface
 */
export interface ValidationCheck {
  /** Human-readable description (for progress display) */
  description: string;
  /** Execute the check, returning zero or more issues */
  run(context: ValidationContext): Promise<ValidationIssue[]>;
}
