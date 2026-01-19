/**
 * Debug Start Executor - starts debug sessions
 * Per contracts/action-executor.md
 */

import * as vscode from 'vscode';
import { Action, DebugStartParams } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult, BaseActionExecutor } from './types';
import { ValidationError } from './errors';

/**
 * Executor for debug.start action type
 */
export class DebugStartExecutor extends BaseActionExecutor implements ActionExecutor<DebugStartParams> {
  readonly actionType = 'debug.start' as const;
  readonly description = 'Starts a debug session';
  readonly requiresTrust = true;
  override readonly defaultTimeoutMs = 30000;

  validate(params: DebugStartParams): void {
    if (!params.configName || typeof params.configName !== 'string') {
      throw new ValidationError('debug.start', 'configName', 'configName is required and must be a string');
    }

    if (params.workspaceFolder !== undefined && typeof params.workspaceFolder !== 'string') {
      throw new ValidationError('debug.start', 'workspaceFolder', 'workspaceFolder must be a string');
    }
  }

  async execute(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const params = action.params as unknown as DebugStartParams;

    try {
      this.validate(params);

      // Check workspace trust
      if (!context.isWorkspaceTrusted) {
        return this.failure('Debug sessions require workspace trust', startTime);
      }

      // Find workspace folder
      let workspaceFolder: vscode.WorkspaceFolder | undefined;
      if (params.workspaceFolder) {
        workspaceFolder = vscode.workspace.workspaceFolders?.find(
          (f) => f.name === params.workspaceFolder || f.uri.fsPath.endsWith(params.workspaceFolder!)
        );
        if (!workspaceFolder) {
          return this.failure(`Workspace folder not found: ${params.workspaceFolder}`, startTime);
        }
      } else {
        workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      }

      if (!workspaceFolder) {
        return this.failure('No workspace folder available', startTime);
      }

      // Get launch configuration
      const launchConfig = vscode.workspace
        .getConfiguration('launch', workspaceFolder.uri)
        .get<Array<{ name: string }>>('configurations');

      const config = launchConfig?.find((c) => c.name === params.configName);
      if (!config) {
        return this.failure(`Launch configuration not found: ${params.configName}`, startTime);
      }

      // Start debug session
      const started = await vscode.debug.startDebugging(workspaceFolder, params.configName, {
        noDebug: false,
        compact: false,
      });

      if (!started) {
        return this.failure('Failed to start debug session', startTime);
      }

      context.outputChannel.appendLine(`[debug.start] Started debug session: ${params.configName}`);

      return this.success(startTime, true, async () => {
        // Undo: stop the debug session
        await vscode.debug.stopDebugging();
      });
    } catch (error) {
      return this.failure(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      );
    }
  }
}
