/**
 * Validate Command Executor - runs a command and validates exit code / output
 * Per contracts/action-executor.md
 */

import * as cp from 'child_process';
import { Action } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult, BaseActionExecutor } from './types';
import { ValidationError } from './errors';
import { PlatformResolver, isPlatformCommandMap, PlatformCommandMap } from './platformResolver';

/**
 * Shared PlatformResolver instance
 */
const platformResolver = new PlatformResolver();

/**
 * Executor for validate.command action type
 */
export class ValidateCommandExecutor extends BaseActionExecutor implements ActionExecutor {
  readonly actionType = 'validate.command' as const;
  readonly description = 'Run a command and validate its exit code and optional output';
  readonly requiresTrust = true;
  override readonly defaultTimeoutMs = 30000;

  validate(params: Record<string, unknown>): void {
    if (!params.command) {
      throw new ValidationError('validate.command', 'command', 'command is required');
    }

    if (typeof params.command !== 'string' && !isPlatformCommandMap(params.command)) {
      throw new ValidationError('validate.command', 'command', 'command must be a string or a platform command map');
    }

    if (params.expectOutput !== undefined && typeof params.expectOutput !== 'string') {
      throw new ValidationError('validate.command', 'expectOutput', 'expectOutput must be a string');
    }

    if (params.timeout !== undefined && (typeof params.timeout !== 'number' || params.timeout < 0)) {
      throw new ValidationError('validate.command', 'timeout', 'timeout must be a non-negative number');
    }
  }

  async execute(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const params = action.params;

    try {
      this.validate(params);

      // Check workspace trust
      if (!context.isWorkspaceTrusted) {
        return this.failure('validate.command requires workspace trust', startTime);
      }

      // Resolve cross-platform command
      const resolved = platformResolver.resolve(params.command as string | PlatformCommandMap);
      if (resolved.command === undefined) {
        return this.failure(
          resolved.error || `Command not available on ${resolved.platform}`,
          startTime
        );
      }

      const resolvedCommand = resolved.command;
      const expectOutput = params.expectOutput as string | undefined;
      const timeout = (params.timeout as number) || this.defaultTimeoutMs;

      return new Promise<ExecutionResult>((resolve) => {
        const child = cp.exec(resolvedCommand, {
          cwd: context.workspaceRoot,
          timeout,
          env: { ...process.env },
        }, (error, stdout, stderr) => {
          const durationMs = Date.now() - startTime;
          const output = stdout.toString().trim();

          // Check exit code
          if (error && (error as NodeJS.ErrnoException).code !== undefined) {
            resolve({
              success: false,
              error: `Command exited with code ${(error as { code?: number }).code}${stderr ? ': ' + stderr.toString().trim() : ''}`,
              canUndo: false,
              durationMs,
              actionType: 'validate.command',
              actionTarget: resolvedCommand,
            });
            return;
          }

          // Check expected output
          if (expectOutput && !output.includes(expectOutput)) {
            resolve({
              success: false,
              error: `Expected output to contain "${expectOutput}" but got: ${output.substring(0, 200)}`,
              canUndo: false,
              durationMs,
              actionType: 'validate.command',
              actionTarget: resolvedCommand,
            });
            return;
          }

          resolve({
            success: true,
            canUndo: false,
            durationMs,
            actionType: 'validate.command',
            actionTarget: resolvedCommand,
          });
        });

        // Handle cancellation
        context.cancellationToken.onCancellationRequested(() => {
          child.kill();
        });
      });
    } catch (error) {
      return this.failure(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      );
    }
  }
}
