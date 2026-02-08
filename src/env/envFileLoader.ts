/**
 * EnvFileLoader — loads and parses .deck.env sidecar files.
 * Per env-resolver contract and env-file-format contract.
 */

import * as fs from 'fs';
import { EnvDeclaration, EnvFile, EnvFileError } from '../models/env';

/** Regex for a valid env key */
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Loads and parses .deck.env files.
 */
export class EnvFileLoader {
  /**
   * Load and parse a .deck.env file from disk.
   * @param deckFilePath - Absolute path to the .deck.md file
   * @returns EnvFile with parsed values and any parse errors
   */
  async loadEnvFile(deckFilePath: string): Promise<EnvFile> {
    const envFilePath = deckFilePath.replace(/\.deck\.md$/, '.deck.env');

    // Check if file exists
    if (!fs.existsSync(envFilePath)) {
      return {
        filePath: envFilePath,
        values: new Map(),
        errors: [],
        exists: false,
      };
    }

    try {
      let content = fs.readFileSync(envFilePath, 'utf-8');

      // Strip BOM
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }

      return this.parseContent(content, envFilePath);
    } catch {
      return {
        filePath: envFilePath,
        values: new Map(),
        errors: [{ line: 0, message: 'Unable to read .deck.env file', rawText: '' }],
        exists: true,
      };
    }
  }

  /**
   * Parse .deck.env file content line by line.
   */
  private parseContent(content: string, filePath: string): EnvFile {
    const values = new Map<string, string>();
    const errors: EnvFileError[] = [];
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1; // 1-based
      const raw = lines[i];
      const trimmed = raw.trim();

      // Skip empty lines and comments
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }

      // Try to match KEY=VALUE
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) {
        // No = sign → malformed
        errors.push({
          line: lineNum,
          message: `Malformed line: missing '=' separator`,
          rawText: trimmed,
        });
        continue;
      }

      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1);

      // Validate key
      if (key === '') {
        errors.push({
          line: lineNum,
          message: `Malformed line: empty key before '='`,
          rawText: trimmed,
        });
        continue;
      }

      if (!KEY_PATTERN.test(key)) {
        errors.push({
          line: lineNum,
          message: `Invalid key '${key}': must match [A-Za-z_][A-Za-z0-9_]*`,
          rawText: trimmed,
        });
        continue;
      }

      // Trim leading whitespace from value
      value = value.trimStart();

      // Strip matching quotes
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
      ) {
        value = value.slice(1, -1);
      }

      // Last wins for duplicates
      values.set(key, value);
    }

    return {
      filePath,
      values,
      errors,
      exists: true,
    };
  }

  /**
   * Generate a .deck.env.example template from declarations.
   * @param declarations - Env declarations from deck frontmatter
   * @param deckFileName - Name of the .deck.md file (for header comment)
   * @returns File content string for .deck.env.example
   */
  generateTemplate(declarations: EnvDeclaration[], deckFileName: string): string {
    const lines: string[] = [
      `# Environment variables for ${deckFileName}`,
      `# Copy this file to .deck.env and fill in your values`,
      '',
    ];

    for (const decl of declarations) {
      if (decl.description) {
        lines.push(`# ${decl.description}`);
      }

      const meta: string[] = [];
      meta.push(`Required: ${decl.required ? 'yes' : 'no'}`);
      meta.push(`Secret: ${decl.secret ? 'yes' : 'no'}`);
      meta.push(`Validate: ${decl.validate ?? 'none'}`);
      lines.push(`# ${meta.join(' | ')}`);

      if (decl.default !== undefined) {
        lines.push(`# Default: ${decl.default}`);
      }

      lines.push(`${decl.name}=`);
      lines.push('');
    }

    return lines.join('\n');
  }
}
