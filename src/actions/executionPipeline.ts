/**
 * Execution Pipeline - trust gate, validation, timeout wrapper
 * Per contracts/action-executor.md
 */

import * as vscode from 'vscode';
import { Action, ActionType } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult } from './types';
import { getActionRegistry } from './registry';

/**
 * Action types that require workspace trust
 */
const TRUSTED_ACTION_TYPES: ActionType[] = ['terminal.run', 'debug.start'];

/**
 * Check if an action requires trust
 */
export function actionRequiresTrust(actionType: ActionType): boolean {
  return TRUSTED_ACTION_TYPES.includes(actionType);
}

/**
 * Execute an action through the full pipeline:
 * 1. Trust gate - block untrusted actions
 * 2. Validation - validate parameters
 * 3. Timeout wrapper - enforce time limits
 * 4. Execute - run the action
 */
export async function executeWithPipeline(
  action: Action,
  context: ExecutionContext,
  options: {
    timeoutMs?: number;
    skipTrustCheck?: boolean;
    skipValidation?: boolean;
  } = {}
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const registry = getActionRegistry();

  // Get executor
  const executor = registry.get(action.type);
  if (!executor) {
    return {
      success: false,
      error: `Unknown action type: ${action.type}`,
      canUndo: false,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 1: Trust gate
  if (!options.skipTrustCheck && executor.requiresTrust && !context.isWorkspaceTrusted) {
    return {
      success: false,
      error: `Action "${action.type}" requires workspace trust`,
      canUndo: false,
      durationMs: Date.now() - startTime,
    };
  }

  // Step 2: Validation
  if (!options.skipValidation) {
    try {
      executor.validate(action.params);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Validation failed',
        canUndo: false,
        durationMs: Date.now() - startTime,
      };
    }
  }

  // Step 3: Execute with timeout
  const timeoutMs = options.timeoutMs ?? executor.defaultTimeoutMs ?? 30000;

  return executeWithTimeout(executor, action, context, timeoutMs);
}

/**
 * Execute an action with a timeout
 */
async function executeWithTimeout(
  executor: ActionExecutor,
  action: Action,
  context: ExecutionContext,
  timeoutMs: number
): Promise<ExecutionResult> {
  const startTime = Date.now();

  return new Promise<ExecutionResult>((resolve) => {
    // Set up timeout
    const timeoutId = setTimeout(() => {
      resolve({
        success: false,
        error: `Action timed out after ${timeoutMs}ms`,
        canUndo: false,
        durationMs: Date.now() - startTime,
      });
    }, timeoutMs);

    // Execute action
    executor
      .execute(action, context)
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Execution failed',
          canUndo: false,
          durationMs: Date.now() - startTime,
        });
      });
  });
}

/**
 * Create execution context from conductor state
 */
export function createExecutionContext(
  workspaceRoot: string,
  deckFilePath: string,
  slideIndex: number,
  isWorkspaceTrusted: boolean,
  outputChannel: vscode.OutputChannel,
  cancellationToken?: vscode.CancellationToken
): ExecutionContext {
  return {
    workspaceRoot,
    deckFilePath,
    currentSlideIndex: slideIndex,
    isWorkspaceTrusted,
    outputChannel,
    cancellationToken: cancellationToken ?? new vscode.CancellationTokenSource().token,
  };
}
