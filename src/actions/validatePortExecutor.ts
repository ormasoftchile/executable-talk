/**
 * Validate Port Executor - validates that a TCP port is open
 * Per contracts/action-executor.md
 */

import * as net from 'net';
import { Action } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult, BaseActionExecutor } from './types';
import { ValidationError } from './errors';

/**
 * Executor for validate.port action type
 */
export class ValidatePortExecutor extends BaseActionExecutor implements ActionExecutor {
  readonly actionType = 'validate.port' as const;
  readonly description = 'Validate that a TCP port is open';
  readonly requiresTrust = false;
  override readonly defaultTimeoutMs = 5000;

  validate(params: Record<string, unknown>): void {
    if (params.port === undefined || params.port === null) {
      throw new ValidationError('validate.port', 'port', 'port is required');
    }
    const port = Number(params.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new ValidationError('validate.port', 'port', 'port must be an integer between 1 and 65535');
    }

    if (params.host !== undefined && typeof params.host !== 'string') {
      throw new ValidationError('validate.port', 'host', 'host must be a string');
    }

    if (params.timeout !== undefined && (typeof params.timeout !== 'number' || params.timeout < 0)) {
      throw new ValidationError('validate.port', 'timeout', 'timeout must be a non-negative number');
    }
  }

  async execute(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const params = action.params;

    try {
      this.validate(params);

      const port = Number(params.port);
      const host = (params.host as string) || 'localhost';
      const timeout = (params.timeout as number) || this.defaultTimeoutMs;

      return new Promise<ExecutionResult>((resolve) => {
        const socket = new net.Socket();

        socket.setTimeout(timeout);

        socket.on('connect', () => {
          socket.destroy();
          resolve({
            success: true,
            canUndo: false,
            durationMs: Date.now() - startTime,
            actionType: 'validate.port',
            actionTarget: `${host}:${port}`,
          });
        });

        socket.on('timeout', () => {
          socket.destroy();
          resolve({
            success: false,
            error: `Connection to ${host}:${port} timed out`,
            canUndo: false,
            durationMs: Date.now() - startTime,
            actionType: 'validate.port',
            actionTarget: `${host}:${port}`,
          });
        });

        socket.on('error', (err) => {
          socket.destroy();
          resolve({
            success: false,
            error: `Port ${port} on ${host} is not open: ${err.message}`,
            canUndo: false,
            durationMs: Date.now() - startTime,
            actionType: 'validate.port',
            actionTarget: `${host}:${port}`,
          });
        });

        context.cancellationToken.onCancellationRequested(() => {
          socket.destroy();
        });

        socket.connect(port, host);
      });
    } catch (error) {
      return this.failure(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      );
    }
  }
}
