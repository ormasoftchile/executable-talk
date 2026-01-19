/**
 * File Open Executor - opens files in the editor
 * Per contracts/action-executor.md
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Action, FileOpenParams } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult, BaseActionExecutor } from './types';
import { ValidationError } from './errors';

/**
 * Executor for file.open action type
 */
export class FileOpenExecutor extends BaseActionExecutor implements ActionExecutor<FileOpenParams> {
  readonly actionType = 'file.open' as const;
  readonly description = 'Opens a file in the editor';
  readonly requiresTrust = false;
  override readonly defaultTimeoutMs = 5000;

  validate(params: FileOpenParams): void {
    if (!params.path || typeof params.path !== 'string') {
      throw new ValidationError('file.open', 'path', 'path is required and must be a string');
    }

    if (params.range !== undefined && typeof params.range !== 'string') {
      throw new ValidationError('file.open', 'range', 'range must be a string (e.g., "10-20")');
    }

    if (params.line !== undefined && (typeof params.line !== 'number' || params.line < 1)) {
      throw new ValidationError('file.open', 'line', 'line must be a positive number');
    }

    if (params.column !== undefined && (typeof params.column !== 'number' || params.column < 1)) {
      throw new ValidationError('file.open', 'column', 'column must be a positive number');
    }

    if (params.viewColumn !== undefined && (typeof params.viewColumn !== 'number' || params.viewColumn < -2)) {
      throw new ValidationError('file.open', 'viewColumn', 'viewColumn must be a valid column number');
    }
  }

  async execute(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const params = action.params as unknown as FileOpenParams;

    try {
      this.validate(params);

      // Resolve file path relative to workspace
      const filePath = path.isAbsolute(params.path)
        ? params.path
        : path.join(context.workspaceRoot, params.path);

      // Check if file exists
      const fileUri = vscode.Uri.file(filePath);
      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch {
        return this.failure(`File not found: ${params.path}`, startTime);
      }

      // Determine view column
      let viewColumn = vscode.ViewColumn.One;
      if (params.viewColumn !== undefined) {
        if (params.viewColumn === -1) {
          viewColumn = vscode.ViewColumn.Beside;
        } else if (params.viewColumn === -2) {
          viewColumn = vscode.ViewColumn.Active;
        } else {
          viewColumn = params.viewColumn;
        }
      }

      // Open the document
      const document = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(document, {
        viewColumn,
        preview: params.preview ?? true,
        preserveFocus: false,
      });

      // Navigate to specific line/range if specified
      if (params.line !== undefined || params.range !== undefined) {
        let line = 1;
        let endLine = 1;

        if (params.range) {
          const [start, end] = params.range.split('-').map(Number);
          line = start || 1;
          endLine = end || line;
        } else if (params.line) {
          line = params.line;
          endLine = params.line;
        }

        const column = params.column ?? 1;

        // Create selection range
        const startPosition = new vscode.Position(line - 1, column - 1);
        const endPosition = new vscode.Position(endLine - 1, 0);
        const selection = new vscode.Selection(startPosition, startPosition);

        editor.selection = selection;
        editor.revealRange(
          new vscode.Range(startPosition, endPosition),
          vscode.TextEditorRevealType.InCenter
        );
      }

      context.outputChannel.appendLine(`[file.open] Opened: ${params.path}`);

      return this.success(startTime, true, async () => {
        // Undo: close the editor
        const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
        const tab = tabs.find(
          (t) => t.input instanceof vscode.TabInputText && t.input.uri.fsPath === filePath
        );
        if (tab) {
          await vscode.window.tabGroups.close(tab);
        }
      });
    } catch (error) {
      return this.failure(
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      );
    }
  }
}
