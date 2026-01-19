/**
 * Terminal Run Executor - executes commands in the terminal
 * Per contracts/action-executor.md
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Action, TerminalRunParams } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult, BaseActionExecutor } from './types';
import { ValidationError } from './errors';

/**
 * Track terminals created by the presentation
 */
const presentationTerminals = new Map<string, vscode.Terminal>();

/**
 * Executor for terminal.run action type
 */
export class TerminalRunExecutor extends BaseActionExecutor implements ActionExecutor<TerminalRunParams> {
  readonly actionType = 'terminal.run' as const;
  readonly description = 'Runs a command in the terminal';
  readonly requiresTrust = true;
  override readonly defaultTimeoutMs = 30000;

  validate(params: TerminalRunParams): void {
    if (!params.command || typeof params.command !== 'string') {
      throw new ValidationError('terminal.run', 'command', 'command is required and must be a string');
    }

    if (params.name !== undefined && typeof params.name !== 'string') {
      throw new ValidationError('terminal.run', 'name', 'name must be a string');
    }

    if (params.timeout !== undefined && (typeof params.timeout !== 'number' || params.timeout < 0)) {
      throw new ValidationError('terminal.run', 'timeout', 'timeout must be a non-negative number');
    }

    if (params.cwd !== undefined && typeof params.cwd !== 'string') {
      throw new ValidationError('terminal.run', 'cwd', 'cwd must be a string');
    }
  }

  async execute(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const params = action.params as unknown as TerminalRunParams;

    try {
      this.validate(params);

      // Check workspace trust
      if (!context.isWorkspaceTrusted) {
        return this.failure('Terminal commands require workspace trust', startTime);
      }

      // Determine working directory
      const cwd = params.cwd
        ? path.isAbsolute(params.cwd)
          ? params.cwd
          : path.join(context.workspaceRoot, params.cwd)
        : context.workspaceRoot;

      // Create or reuse terminal
      const terminalName = params.name ?? 'Executable Talk';
      let terminal = presentationTerminals.get(terminalName);

      if (!terminal || terminal.exitStatus !== undefined) {
        // Create new terminal
        terminal = vscode.window.createTerminal({
          name: terminalName,
          cwd,
        });
        presentationTerminals.set(terminalName, terminal);
      }

      // Clear terminal if requested
      if (params.clear) {
        // Send clear command based on platform
        terminal.sendText(process.platform === 'win32' ? 'cls' : 'clear');
        // Small delay to let clear complete
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Show terminal unless background
      if (params.reveal !== false && !params.background) {
        terminal.show(!params.background);
      }

      // Send command
      terminal.sendText(params.command);

      context.outputChannel.appendLine(`[terminal.run] Executed: ${params.command}`);

      // If background, return immediately
      if (params.background) {
        return this.success(startTime, true, async () => {
          // Undo: dispose terminal
          terminal?.dispose();
          presentationTerminals.delete(terminalName);
        });
      }

      // For non-background commands, we can't easily wait for completion
      // VS Code terminal API doesn't provide command completion events
      // We just return success after sending the command
      return this.success(startTime, true, async () => {
        // Undo: dispose terminal
        terminal?.dispose();
        presentationTerminals.delete(terminalName);
      });
    } catch (error) {
      return this.failure(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      );
    }
  }
}

/**
 * Dispose all presentation terminals
 */
export function disposeAllTerminals(): void {
  for (const terminal of presentationTerminals.values()) {
    terminal.dispose();
  }
  presentationTerminals.clear();
}
