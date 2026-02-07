/**
 * Action execution errors
 * Per contracts/action-executor.md
 */

import { ActionType } from '../models/action';

/**
 * Thrown when action parameters fail validation
 */
export class ValidationError extends Error {
  readonly actionType: ActionType;
  readonly field: string;
  readonly reason: string;

  constructor(actionType: ActionType, field: string, reason: string) {
    super(`Invalid ${field}: ${reason}`);
    this.name = 'ValidationError';
    this.actionType = actionType;
    this.field = field;
    this.reason = reason;
  }
}

/**
 * Thrown when action type is not registered
 */
export class UnknownActionError extends Error {
  readonly actionType: string;

  constructor(actionType: string) {
    super(`Unknown action type: ${actionType}`);
    this.name = 'UnknownActionError';
    this.actionType = actionType;
  }
}

/**
 * Thrown when action exceeds timeout
 */
export class TimeoutError extends Error {
  readonly actionType: ActionType;
  readonly timeoutMs: number;

  constructor(actionType: ActionType, timeoutMs: number) {
    super(`Action ${actionType} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.actionType = actionType;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Thrown when action blocked by trust policy
 */
export class TrustError extends Error {
  readonly actionType: ActionType;

  constructor(actionType: ActionType) {
    super(`Action ${actionType} requires workspace trust`);
    this.name = 'TrustError';
    this.actionType = actionType;
  }
}

// ============================================================================
// Structured Error Detail Types (per error-feedback contract, T027)
// ============================================================================

/**
 * Outcome of a single step within a sequence
 */
export interface StepResult {
  /** Step's action type */
  type: ActionType;
  /** Step's target (path, command, etc.) */
  target?: string;
  /** Outcome */
  status: 'success' | 'failed' | 'skipped';
  /** Error message if status is 'failed' */
  error?: string;
}

/**
 * Structured detail for a sequence execution failure.
 * Sent to the webview so the toast can display per-step breakdown.
 */
export interface SequenceErrorDetail {
  /** Total number of steps in the sequence */
  totalSteps: number;
  /** Zero-based index of the step that failed */
  failedStepIndex: number;
  /** Action type of the failed step */
  failedStepType: ActionType;
  /** Ordered results for each step */
  stepResults: StepResult[];
}
