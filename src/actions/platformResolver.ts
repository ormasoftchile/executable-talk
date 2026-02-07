/**
 * Platform Resolver - resolves cross-platform commands for terminal.run actions.
 * Per contracts/platform-resolver.md
 * T035 [US3]
 */

import * as path from 'path';
import * as os from 'os';

/**
 * Platform key type
 */
export type PlatformKey = 'macos' | 'windows' | 'linux';

/**
 * Cross-platform command map for terminal.run params
 */
export interface PlatformCommandMap {
  macos?: string;
  windows?: string;
  linux?: string;
  default?: string;
}

/**
 * Result of resolving a command for the current platform
 */
export interface ResolvedCommand {
  /** The resolved command string, or undefined if not available */
  command: string | undefined;
  /** The platform key used for resolution */
  platform: PlatformKey;
  /** Whether the command came from a platform-specific entry or the default */
  source: 'platform-specific' | 'default' | 'none';
  /** Error message if command could not be resolved */
  error?: string;
}

/**
 * Result of validating a PlatformCommandMap for platform coverage
 */
export interface PlatformValidationResult {
  isValid: boolean;
  /** Platforms that have explicit commands */
  coveredPlatforms: PlatformKey[];
  /** Platforms without explicit commands AND no default */
  missingPlatforms: PlatformKey[];
  /** Whether a default fallback exists */
  hasDefault: boolean;
  /** Warning message for preflight validation */
  warning?: string;
}

const ALL_PLATFORMS: PlatformKey[] = ['macos', 'windows', 'linux'];

/**
 * Resolves cross-platform commands and path placeholders
 * so that a single .deck.md works on macOS, Windows, and Linux.
 */
export class PlatformResolver {
  /**
   * Get the current platform key.
   */
  getCurrentPlatform(): PlatformKey {
    switch (process.platform) {
      case 'darwin':
        return 'macos';
      case 'win32':
        return 'windows';
      case 'linux':
        return 'linux';
      default:
        return 'linux'; // Best-effort fallback
    }
  }

  /**
   * Resolve a command parameter that may be a plain string or a PlatformCommandMap.
   * Returns the resolved command string for the current OS, with placeholders expanded.
   */
  resolve(command: string | PlatformCommandMap): ResolvedCommand {
    const platform = this.getCurrentPlatform();

    // String passthrough — expand placeholders and return
    if (typeof command === 'string') {
      return {
        command: this.expandPlaceholders(command),
        platform,
        source: 'platform-specific',
      };
    }

    // PlatformCommandMap resolution
    const platformSpecific = command[platform];
    if (platformSpecific !== undefined) {
      return {
        command: this.expandPlaceholders(platformSpecific),
        platform,
        source: 'platform-specific',
      };
    }

    if (command.default !== undefined) {
      return {
        command: this.expandPlaceholders(command.default),
        platform,
        source: 'default',
      };
    }

    return {
      command: undefined,
      platform,
      source: 'none',
      error: `Command not available on ${platform}. Consider adding a default entry.`,
    };
  }

  /**
   * Expand path placeholders in a command string.
   */
  expandPlaceholders(command: string): string {
    let result = command;

    result = result.replace(/\$\{pathSep\}/g, path.sep);
    result = result.replace(/\$\{home\}/g, os.homedir());
    result = result.replace(/\$\{pathDelimiter\}/g, path.delimiter);

    // vscode.env.shell may not be available in all contexts (e.g. tests)
    // Gracefully use environment variable or empty string
    let shell: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const vscodeModule = require('vscode') as { env: { shell?: string } };
      shell = vscodeModule.env.shell || process.env.SHELL || process.env.COMSPEC || '';
    } catch {
      shell = process.env.SHELL || process.env.COMSPEC || '';
    }
    result = result.replace(/\$\{shell\}/g, shell);

    return result;
  }

  /**
   * Validate a PlatformCommandMap for coverage of the current platform.
   * Used by preflight validation.
   */
  validate(command: PlatformCommandMap): PlatformValidationResult {
    const hasDefault = command.default !== undefined;

    const coveredPlatforms = ALL_PLATFORMS.filter((p) => command[p] !== undefined);

    // Platforms are "missing" only if they don't have an explicit entry AND there's no default
    const missingPlatforms = hasDefault
      ? []
      : ALL_PLATFORMS.filter((p) => command[p] === undefined);

    const currentPlatform = this.getCurrentPlatform();
    const currentCovered = command[currentPlatform] !== undefined || hasDefault;

    const isValid = currentCovered;

    let warning: string | undefined;
    if (!isValid) {
      warning = `terminal.run command has no variant for '${currentPlatform}' and no default fallback`;
    }

    return {
      isValid,
      coveredPlatforms,
      missingPlatforms,
      hasDefault,
      warning,
    };
  }
}

/**
 * Check if a parsed YAML value is a PlatformCommandMap
 */
export function isPlatformCommandMap(value: unknown): value is PlatformCommandMap {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  const validKeys = new Set(['macos', 'windows', 'linux', 'default']);
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return false;
  }
  return keys.every((k) => validKeys.has(k));
}
