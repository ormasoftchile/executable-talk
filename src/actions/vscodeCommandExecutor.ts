/**
 * VS Code Command Executor - executes arbitrary VS Code commands
 */

import * as vscode from 'vscode';
import { Action, VscodeCommandParams } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult, BaseActionExecutor } from './types';
import { ValidationError } from './errors';

/**
 * Executor for vscode.command action type
 * 
 * Allows executing any VS Code command by ID with optional arguments.
 * Requires Workspace Trust for security since commands can have side effects.
 */
export class VscodeCommandExecutor extends BaseActionExecutor implements ActionExecutor<VscodeCommandParams> {
  readonly actionType = 'vscode.command' as const;
  readonly description = 'Executes a VS Code command';
  readonly requiresTrust = true; // Commands can have side effects
  override readonly defaultTimeoutMs = 10000;

  validate(params: VscodeCommandParams): void {
    if (!params.id || typeof params.id !== 'string') {
      throw new ValidationError('vscode.command', 'id', 'id is required and must be a string');
    }

    // Validate id looks like a command (contains a dot or is a known command)
    if (!params.id.includes('.') && !params.id.startsWith('workbench')) {
      console.warn(`[VscodeCommandExecutor] Command ID "${params.id}" may not be valid (missing namespace)`);
    }
  }

  async execute(action: Action, _context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const params = action.params as unknown as VscodeCommandParams;

    try {
      this.validate(params);

      // Parse args if provided as JSON string
      let args: unknown[] = [];
      if (params.args) {
        if (typeof params.args === 'string') {
          try {
            const parsed = JSON.parse(decodeURIComponent(params.args));
            args = Array.isArray(parsed) ? parsed : [parsed];
          } catch {
            // If not valid JSON, use as single string argument
            args = [decodeURIComponent(params.args)];
          }
        } else if (Array.isArray(params.args)) {
          args = params.args;
        } else {
          args = [params.args];
        }
      }

      // Execute the command
      await vscode.commands.executeCommand(params.id, ...args);

      return this.success(startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.failure(`Failed to execute command "${params.id}": ${message}`, startTime);
    }
  }
}
