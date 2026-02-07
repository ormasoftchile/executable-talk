/**
 * Line Range Validator
 * Checks that line ranges don't exceed actual file length.
 * Per contracts/preflight-validation.md and T017.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ValidationCheck, ValidationContext, ValidationIssue } from './types';

/**
 * Action types that can specify line ranges
 */
const LINE_RANGE_ACTION_TYPES = new Set(['editor.highlight']);

/**
 * Validator that checks line range parameters against actual file length.
 * Only runs for actions that have a `lines` parameter and a valid `path`.
 */
export class LineRangeValidator implements ValidationCheck {
  readonly description = 'Checking line ranges are within file bounds';

  async run(context: ValidationContext): Promise<ValidationIssue[]> {
    const { deck, workspaceRoot } = context;
    const checks: Array<Promise<ValidationIssue | null>> = [];

    for (const slide of deck.slides) {
      for (const el of slide.interactiveElements) {
        if (!LINE_RANGE_ACTION_TYPES.has(el.action.type)) {
          continue;
        }
        const linesParam = el.action.params.lines as string | undefined;
        const filePath = el.action.params.path as string | undefined;
        if (!linesParam || !filePath) {
          continue;
        }

        checks.push(
          this.checkRange(filePath, linesParam, workspaceRoot, slide.index, el.action.type)
        );
      }

      // Also check render:file directives with lines param
      for (const dir of slide.renderDirectives) {
        if (dir.type === 'file') {
          const queryMatch = dir.rawDirective.match(/\?([^)]+)/);
          if (queryMatch) {
            const params = new URLSearchParams(queryMatch[1]);
            const filePath = params.get('path');
            const lines = params.get('lines');
            if (filePath && lines) {
              checks.push(
                this.checkRange(filePath, lines, workspaceRoot, slide.index, 'render:file')
              );
            }
          }
        }
      }
    }

    const results = await Promise.all(checks);
    return results.filter((r): r is ValidationIssue => r !== null);
  }

  private async checkRange(
    filePath: string,
    linesParam: string,
    workspaceRoot: string,
    slideIndex: number,
    source: string
  ): Promise<ValidationIssue | null> {
    const absolute = path.resolve(workspaceRoot, filePath);

    // Check file exists first — skip if missing (FilePathValidator handles that)
    try {
      await fs.promises.stat(absolute);
    } catch {
      return null; // File doesn't exist — not our concern
    }

    // Read file and count lines
    try {
      const content = await fs.promises.readFile(absolute, 'utf-8');
      const actualLines = content.split('\n').length;

      // Parse range: "10-20" or "10"
      const { start, end } = this.parseRange(linesParam);

      if (end > actualLines) {
        return {
          severity: 'error',
          slideIndex,
          source,
          target: filePath,
          message: `Line range ${start}-${end} exceeds file length (${actualLines} lines) for '${filePath}'`,
        };
      }

      return null;
    } catch {
      return null; // Can't read file — skip
    }
  }

  private parseRange(linesStr: string): { start: number; end: number } {
    if (linesStr.includes('-')) {
      const [startStr, endStr] = linesStr.split('-');
      return {
        start: parseInt(startStr, 10) || 1,
        end: parseInt(endStr, 10) || 1,
      };
    }
    const line = parseInt(linesStr, 10) || 1;
    return { start: line, end: line };
  }
}
