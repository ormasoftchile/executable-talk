/**
 * Debug Config Validator
 * Checks that debug.start actions reference valid launch configurations.
 * Per contracts/preflight-validation.md and T018.
 *
 * Note: In unit tests (outside VS Code), vscode.workspace is unavailable.
 * The validator gracefully handles this by reporting that config was not found.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ValidationCheck, ValidationContext, ValidationIssue } from './types';

/**
 * Validator that checks debug.start configName against launch.json configurations.
 */
export class DebugConfigValidator implements ValidationCheck {
  readonly description = 'Checking debug configurations exist';

  async run(context: ValidationContext): Promise<ValidationIssue[]> {
    const { deck, workspaceRoot } = context;
    const issues: ValidationIssue[] = [];

    // Collect all debug.start actions
    const debugActions: Array<{ configName: string; slideIndex: number }> = [];
    for (const slide of deck.slides) {
      for (const el of slide.interactiveElements) {
        if (el.action.type === 'debug.start') {
          const configName = el.action.params.configName as string | undefined;
          if (configName) {
            debugActions.push({ configName, slideIndex: slide.index });
          }
        }
      }
    }

    if (debugActions.length === 0) {
      return [];
    }

    // Read launch configurations
    const configs = await this.getConfigurations(workspaceRoot);

    for (const { configName, slideIndex } of debugActions) {
      const found = configs.find((c) => c.name === configName);
      if (!found) {
        const availableNames = configs.map((c) => c.name);
        const available = availableNames.length > 0
          ? `Available: ${availableNames.join(', ')}`
          : 'No configurations found';

        issues.push({
          severity: 'error',
          slideIndex,
          source: 'debug.start',
          target: configName,
          message: `Debug configuration '${configName}' not found. ${available}`,
        });
      }
    }

    return issues;
  }

  /**
   * Read launch configurations from .vscode/launch.json.
   * Falls back to empty array if file doesn't exist.
   */
  private async getConfigurations(
    workspaceRoot: string
  ): Promise<Array<{ name: string; type?: string }>> {
    const launchPath = path.join(workspaceRoot, '.vscode', 'launch.json');

    try {
      const content = await fs.promises.readFile(launchPath, 'utf-8');
      // Strip JSON comments (// and /* */)
      const stripped = content
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      const parsed = JSON.parse(stripped) as { configurations?: Array<{ name: string; type?: string }> };
      return parsed.configurations ?? [];
    } catch {
      return [];
    }
  }
}
