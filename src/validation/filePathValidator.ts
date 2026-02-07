/**
 * File Path Validator
 * Checks that file paths referenced in actions exist in the workspace.
 * Per contracts/preflight-validation.md and T016.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ValidationCheck, ValidationContext, ValidationIssue } from './types';

/**
 * Action types whose `path` parameter should be validated
 */
const FILE_ACTION_TYPES = new Set(['file.open', 'editor.highlight']);

/**
 * Render directive types whose path should be validated
 */
const FILE_DIRECTIVE_TYPES = new Set(['file', 'diff']);

/**
 * Validator that checks file paths referenced in actions/directives exist.
 */
export class FilePathValidator implements ValidationCheck {
  readonly description = 'Checking file paths exist in workspace';

  async run(context: ValidationContext): Promise<ValidationIssue[]> {
    const { deck, workspaceRoot } = context;
    const checks: Array<Promise<ValidationIssue | null>> = [];

    for (const slide of deck.slides) {
      // Check interactive elements (actions)
      for (const el of slide.interactiveElements) {
        if (FILE_ACTION_TYPES.has(el.action.type)) {
          const filePath = el.action.params.path as string | undefined;
          if (filePath) {
            checks.push(
              this.checkPath(filePath, workspaceRoot, slide.index, el.action.type)
            );
          }
        }
      }

      // Check render directives
      for (const dir of slide.renderDirectives) {
        if (FILE_DIRECTIVE_TYPES.has(dir.type)) {
          const paths = this.extractPathsFromDirective(dir.rawDirective);
          for (const p of paths) {
            checks.push(
              this.checkPath(p, workspaceRoot, slide.index, `render:${dir.type}`)
            );
          }
        }
      }
    }

    const results = await Promise.all(checks);
    return results.filter((r): r is ValidationIssue => r !== null);
  }

  private async checkPath(
    filePath: string,
    workspaceRoot: string,
    slideIndex: number,
    source: string
  ): Promise<ValidationIssue | null> {
    const absolute = path.resolve(workspaceRoot, filePath);

    try {
      await fs.promises.stat(absolute);
      return null; // File exists
    } catch {
      return {
        severity: 'error',
        slideIndex,
        source,
        target: filePath,
        message: `File '${filePath}' not found in workspace`,
      };
    }
  }

  /**
   * Extract file paths from a render directive's raw string.
   * Handles both `path=` and `left=`/`right=` for diff directives.
   */
  private extractPathsFromDirective(rawDirective: string): string[] {
    const paths: string[] = [];

    // Match query params in (render:type?key=value&...)
    const queryMatch = rawDirective.match(/\?([^)]+)/);
    if (!queryMatch) {
      return paths;
    }

    const params = new URLSearchParams(queryMatch[1]);
    for (const key of ['path', 'left', 'right']) {
      const val = params.get(key);
      if (val) {
        paths.push(val);
      }
    }

    return paths;
  }
}
