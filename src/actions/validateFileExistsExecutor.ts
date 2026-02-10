/**
 * Validate File Exists Executor - validates that a file exists (or is absent)
 * Per contracts/action-executor.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { Action } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult, BaseActionExecutor } from './types';
import { ValidationError } from './errors';

/**
 * Executor for validate.fileExists action type
 */
export class ValidateFileExistsExecutor extends BaseActionExecutor implements ActionExecutor {
  readonly actionType = 'validate.fileExists' as const;
  readonly description = 'Validate that a file exists (or is absent)';
  readonly requiresTrust = false;
  override readonly defaultTimeoutMs = 5000;

  validate(params: Record<string, unknown>): void {
    if (!params.path || typeof params.path !== 'string') {
      throw new ValidationError('validate.fileExists', 'path', 'path is required and must be a string');
    }

    if (params.expectMissing !== undefined && typeof params.expectMissing !== 'boolean') {
      throw new ValidationError('validate.fileExists', 'expectMissing', 'expectMissing must be a boolean');
    }
  }

  async execute(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const params = action.params;

    try {
      this.validate(params);

      const filePath = params.path as string;
      const expectMissing = params.expectMissing === true;

      const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(context.workspaceRoot, filePath);

      const exists = fs.existsSync(resolvedPath);
      const durationMs = Date.now() - startTime;

      if (expectMissing) {
        return {
          success: !exists,
          error: exists ? `File "${filePath}" exists but was expected to be absent` : undefined,
          canUndo: false,
          durationMs,
          actionType: 'validate.fileExists',
          actionTarget: filePath,
        };
      }

      return {
        success: exists,
        error: exists ? undefined : `File "${filePath}" not found`,
        canUndo: false,
        durationMs,
        actionType: 'validate.fileExists',
        actionTarget: filePath,
      };
    } catch (error) {
      return this.failure(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      );
    }
  }
}
