/**
 * Editor Highlight Executor - highlights lines in the editor
 * Per contracts/action-executor.md
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Action, EditorHighlightParams } from '../models/action';
import { ActionExecutor, ExecutionContext, ExecutionResult, BaseActionExecutor } from './types';
import { ValidationError } from './errors';

/**
 * Track active decorations for cleanup
 */
const activeDecorations = new Map<string, vscode.TextEditorDecorationType>();

/**
 * Executor for editor.highlight action type
 */
export class EditorHighlightExecutor extends BaseActionExecutor implements ActionExecutor<EditorHighlightParams> {
  readonly actionType = 'editor.highlight' as const;
  readonly description = 'Highlights lines in the editor';
  readonly requiresTrust = false;
  override readonly defaultTimeoutMs = 5000;

  validate(params: EditorHighlightParams): void {
    if (!params.path || typeof params.path !== 'string') {
      throw new ValidationError('editor.highlight', 'path', 'path is required and must be a string');
    }

    // Lines can be string or number (number if it's a single line like "20")
    if (params.lines === undefined || params.lines === null || params.lines === '') {
      throw new ValidationError('editor.highlight', 'lines', 'lines is required (e.g., "10-20" or "10")');
    }

    // Convert to string for validation
    const linesStr = String(params.lines);

    // Validate lines format
    const linesMatch = linesStr.match(/^(\d+)(?:-(\d+))?$/);
    if (!linesMatch) {
      throw new ValidationError('editor.highlight', 'lines', 'lines must be in format "N" or "N-M"');
    }

    if (params.style !== undefined && params.style !== 'subtle' && params.style !== 'prominent') {
      throw new ValidationError('editor.highlight', 'style', 'style must be "subtle" or "prominent"');
    }

    if (params.duration !== undefined && (typeof params.duration !== 'number' || params.duration < 0)) {
      throw new ValidationError('editor.highlight', 'duration', 'duration must be a non-negative number');
    }
  }

  async execute(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    const startTime = Date.now();
    const params = action.params as unknown as EditorHighlightParams;

    try {
      this.validate(params);

      // Resolve file path
      const filePath = path.isAbsolute(params.path)
        ? params.path
        : path.join(context.workspaceRoot, params.path);

      // Parse line range (convert to string in case it was parsed as number)
      const linesStr = String(params.lines);
      const linesMatch = linesStr.match(/^(\d+)(?:-(\d+))?$/);
      if (!linesMatch) {
        return this.failure('Invalid lines format', startTime);
      }

      const startLine = parseInt(linesMatch[1], 10);
      const endLine = linesMatch[2] ? parseInt(linesMatch[2], 10) : startLine;

      // Open the file if not already open
      const fileUri = vscode.Uri.file(filePath);
      const document = await vscode.workspace.openTextDocument(fileUri);
      const editor = await vscode.window.showTextDocument(document, {
        preserveFocus: false,
        preview: true,
      });

      // Create decoration type based on style
      const style = params.style ?? 'subtle';
      const color = params.color ?? (style === 'prominent' ? 'rgba(255, 255, 0, 0.3)' : 'rgba(255, 255, 0, 0.15)');

      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: color,
        isWholeLine: true,
        borderWidth: style === 'prominent' ? '0 0 0 3px' : '0',
        borderStyle: 'solid',
        borderColor: 'rgba(255, 200, 0, 0.8)',
      });

      // Create range for highlighted lines
      const range = new vscode.Range(
        new vscode.Position(startLine - 1, 0),
        new vscode.Position(endLine - 1, Number.MAX_SAFE_INTEGER)
      );

      // Apply decoration
      editor.setDecorations(decorationType, [range]);

      // Store for cleanup
      const decorationKey = `${action.id}-${filePath}`;
      activeDecorations.set(decorationKey, decorationType);

      // Reveal the highlighted range
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      context.outputChannel.appendLine(`[editor.highlight] Highlighted lines ${params.lines} in ${params.path}`);

      // Auto-remove after duration if specified
      if (params.duration && params.duration > 0) {
        setTimeout(() => {
          decorationType.dispose();
          activeDecorations.delete(decorationKey);
        }, params.duration);
      }

      return this.success(startTime, true, async () => {
        // Undo: remove the decoration
        decorationType.dispose();
        activeDecorations.delete(decorationKey);
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
 * Clear all active decorations
 */
export function clearAllDecorations(): void {
  for (const decorationType of activeDecorations.values()) {
    decorationType.dispose();
  }
  activeDecorations.clear();
}
