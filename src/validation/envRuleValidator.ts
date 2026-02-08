/**
 * EnvRuleValidator — validates resolved env values against declared rules.
 * Per env-validator contract rule implementations.
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { EnvValidationContext, EnvValidationResult } from '../models/env';

/** Recognized rule names (excluding regex: prefix) */
const KNOWN_RULES = ['directory', 'file', 'command', 'url', 'port'];

/**
 * Validates a single resolved variable value against its declared validation rule.
 */
export class EnvRuleValidator {
  /**
   * Validate a resolved value against its validation rule.
   */
  async validateValue(
    value: string,
    rule: string,
    context: EnvValidationContext,
  ): Promise<EnvValidationResult> {
    if (rule === 'directory') {
      return this.validateDirectory(value, context);
    }
    if (rule === 'file') {
      return this.validateFile(value, context);
    }
    if (rule === 'command') {
      return this.validateCommand(value);
    }
    if (rule === 'url') {
      return this.validateUrl(value);
    }
    if (rule === 'port') {
      return this.validatePort(value);
    }
    if (rule.startsWith('regex:')) {
      const pattern = rule.slice('regex:'.length);
      return this.validateRegex(value, pattern);
    }

    return { rule, passed: false, message: `Unknown validation rule: ${rule}` };
  }

  /**
   * Check if a rule string is a recognized validation rule.
   */
  isValidRule(rule: string): boolean {
    if (KNOWN_RULES.includes(rule)) {
      return true;
    }
    if (rule.startsWith('regex:')) {
      return true;
    }
    return false;
  }

  private async validateDirectory(
    value: string,
    ctx: EnvValidationContext,
  ): Promise<EnvValidationResult> {
    const resolved = path.isAbsolute(value)
      ? value
      : path.resolve(ctx.deckDirectory, value);

    try {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        return { rule: 'directory', passed: true, message: `Directory exists: ${resolved}` };
      }
      return {
        rule: 'directory',
        passed: false,
        message: `Path exists but is not a directory: ${resolved}`,
      };
    } catch {
      return { rule: 'directory', passed: false, message: `Directory not found: ${resolved}` };
    }
  }

  private async validateFile(
    value: string,
    ctx: EnvValidationContext,
  ): Promise<EnvValidationResult> {
    const resolved = path.isAbsolute(value)
      ? value
      : path.resolve(ctx.deckDirectory, value);

    try {
      const stat = fs.statSync(resolved);
      if (stat.isFile()) {
        return { rule: 'file', passed: true, message: `File exists: ${resolved}` };
      }
      return {
        rule: 'file',
        passed: false,
        message: `Path exists but is not a file: ${resolved}`,
      };
    } catch {
      return { rule: 'file', passed: false, message: `File not found: ${resolved}` };
    }
  }

  private async validateCommand(value: string): Promise<EnvValidationResult> {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    return new Promise((resolve) => {
      exec(`${cmd} ${value}`, (error) => {
        if (error) {
          resolve({
            rule: 'command',
            passed: false,
            message: `Command not found in PATH: ${value}`,
          });
        } else {
          resolve({
            rule: 'command',
            passed: true,
            message: `Command found: ${value}`,
          });
        }
      });
    });
  }

  private validateUrl(value: string): EnvValidationResult {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return { rule: 'url', passed: true, message: `Valid URL: ${value}` };
      }
      return {
        rule: 'url',
        passed: false,
        message: `URL must use http: or https: protocol, got: ${url.protocol}`,
      };
    } catch {
      return { rule: 'url', passed: false, message: `Invalid URL format: ${value}` };
    }
  }

  private validatePort(value: string): EnvValidationResult {
    const port = parseInt(value, 10);
    if (isNaN(port) || port < 1 || port > 65535 || port.toString() !== value.trim()) {
      return {
        rule: 'port',
        passed: false,
        message: `Invalid port number: ${value} (must be 1-65535)`,
      };
    }
    return { rule: 'port', passed: true, message: `Valid port: ${port}` };
  }

  private validateRegex(value: string, pattern: string): EnvValidationResult {
    try {
      const regex = new RegExp(pattern);
      if (regex.test(value)) {
        return {
          rule: `regex:${pattern}`,
          passed: true,
          message: `Value matches pattern`,
        };
      }
      return {
        rule: `regex:${pattern}`,
        passed: false,
        message: `Value does not match pattern: /${pattern}/`,
      };
    } catch {
      return {
        rule: `regex:${pattern}`,
        passed: false,
        message: `Invalid regex pattern: ${pattern}`,
      };
    }
  }
}
