/**
 * Command Availability Validator
 * Checks that commands referenced in terminal.run and render:command actions
 * are available on the system PATH.
 * Per contracts/preflight-validation.md and T019.
 */

import { execFile } from 'child_process';
import { ValidationCheck, ValidationContext, ValidationIssue } from './types';

/** Timeout per command check in milliseconds */
const COMMAND_CHECK_TIMEOUT_MS = 2000;

/**
 * Validator that checks command availability on the system PATH.
 * Uses `which` (Unix) or `where.exe` (Windows). Severity is `warning`
 * (not error) because shell builtins may not be found.
 */
export class CommandAvailabilityValidator implements ValidationCheck {
  readonly description = 'Checking command availability on PATH';

  async run(context: ValidationContext): Promise<ValidationIssue[]> {
    const { deck } = context;
    const checks: Array<Promise<ValidationIssue | null>> = [];

    for (const slide of deck.slides) {
      // Check terminal.run actions
      for (const el of slide.interactiveElements) {
        if (el.action.type === 'terminal.run') {
          const command = el.action.params.command as string | undefined;
          if (command) {
            const binary = this.extractBinary(command);
            checks.push(this.checkCommand(binary, slide.index, 'terminal.run'));
          }
        }
      }

      // Check render:command directives
      for (const dir of slide.renderDirectives) {
        if (dir.type === 'command') {
          const cmd = this.extractCmdFromDirective(dir.rawDirective);
          if (cmd) {
            const binary = this.extractBinary(cmd);
            checks.push(this.checkCommand(binary, slide.index, 'render:command'));
          }
        }
      }
    }

    const results = await Promise.all(checks);
    return results.filter((r): r is ValidationIssue => r !== null);
  }

  /**
   * Extract the binary name (first whitespace-delimited token) from a command.
   */
  private extractBinary(command: string): string {
    return command.trim().split(/\s+/)[0];
  }

  /**
   * Extract the command string from a render:command directive's raw text.
   */
  private extractCmdFromDirective(rawDirective: string): string | undefined {
    const queryMatch = rawDirective.match(/\?([^)]+)/);
    if (!queryMatch) {
      return undefined;
    }
    const params = new URLSearchParams(queryMatch[1]);
    return params.get('cmd') ?? params.get('command') ?? undefined;
  }

  /**
   * Check if a binary is available on the PATH.
   * Returns null if found, a ValidationIssue if not found or on timeout.
   */
  private async checkCommand(
    binary: string,
    slideIndex: number,
    source: string
  ): Promise<ValidationIssue | null> {
    const lookupCmd = process.platform === 'win32' ? 'where.exe' : 'which';

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          severity: 'info',
          slideIndex,
          source,
          target: binary,
          message: `Command check timed out for '${binary}'`,
        });
      }, COMMAND_CHECK_TIMEOUT_MS);

      execFile(lookupCmd, [binary], (error) => {
        clearTimeout(timeout);
        if (error) {
          resolve({
            severity: 'warning',
            slideIndex,
            source,
            target: binary,
            message: `Command '${binary}' not found on system PATH`,
          });
        } else {
          resolve(null); // Command found
        }
      });
    });
  }
}
