/**
 * Action executor types and interfaces
 * Per contracts/action-executor.md
 */

import * as vscode from 'vscode';
import { Action, ActionType } from '../models/action';

/**
 * Context provided to all action executors
 */
export interface ExecutionContext {
  /** Absolute path to the workspace root */
  workspaceRoot: string;
  /** Absolute path to the .deck.md file */
  deckFilePath: string;
  /** Current slide index (0-based) */
  currentSlideIndex: number;
  /** Whether workspace is trusted */
  isWorkspaceTrusted: boolean;
  /** Cancellation token for aborting long-running actions */
  cancellationToken: vscode.CancellationToken;
  /** Output channel for logging */
  outputChannel: vscode.OutputChannel;
}

/**
 * Result of action execution
 */
export interface ExecutionResult {
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
export interface ActionExecutor<TParams = unknown> {
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
  execute(action: Action, context: ExecutionContext): Promise<ExecutionResult>;
}

/**
 * Base class for action executors with common functionality
 */
export abstract class BaseActionExecutor<TParams = unknown> implements ActionExecutor<TParams> {
  abstract readonly actionType: ActionType;
  abstract readonly description: string;
  abstract readonly requiresTrust: boolean;
  readonly defaultTimeoutMs: number = 30000;

  abstract validate(params: TParams): void;
  abstract execute(action: Action, context: ExecutionContext): Promise<ExecutionResult>;

  /**
   * Create a successful result
   */
  protected success(startTime: number, canUndo: boolean = false, undo?: () => Promise<void>): ExecutionResult {
    return {
      success: true,
      canUndo,
      undo,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Create a failed result
   */
  protected failure(error: string, startTime: number): ExecutionResult {
    return {
      success: false,
      error,
      canUndo: false,
      durationMs: Date.now() - startTime,
    };
  }
}
