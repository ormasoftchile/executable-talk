/**
 * EnvDeclarationParser — parses env: block from deck frontmatter.
 * Per env-resolver contract parse rules.
 */

import { EnvDeclaration } from '../models/env';

/** Valid env variable name pattern */
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Recognized validation rule prefixes */
const VALID_RULES = ['directory', 'file', 'command', 'url', 'port'];

/**
 * Check if a validate rule string is recognized.
 */
function isValidateRuleRecognized(rule: string): boolean {
  if (VALID_RULES.includes(rule)) {
    return true;
  }
  if (rule.startsWith('regex:')) {
    // Check that the pattern compiles
    const pattern = rule.slice('regex:'.length);
    try {
      new RegExp(pattern);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Parses env: block from deck frontmatter (YAML already parsed by gray-matter).
 */
export class EnvDeclarationParser {
  /**
   * Parse env declarations from frontmatter data.
   * @param frontmatter - Parsed YAML frontmatter object from gray-matter
   * @returns Array of validated EnvDeclaration objects
   * @throws Error if env block is malformed (DeckParseError semantics)
   */
  parseEnvDeclarations(frontmatter: Record<string, unknown>): EnvDeclaration[] {
    const raw = frontmatter.env;

    // env absent or undefined → no declarations
    if (raw === undefined || raw === null) {
      return [];
    }

    // env must be an array
    if (!Array.isArray(raw)) {
      throw new Error('env must be an array of variable declarations');
    }

    const declarations: EnvDeclaration[] = [];
    const namesSeen = new Set<string>();

    for (let i = 0; i < raw.length; i++) {
      const entry = raw[i] as Record<string, unknown> | undefined;

      if (!entry || typeof entry !== 'object') {
        throw new Error(`env[${i}]: each entry must be an object with at least a 'name' property`);
      }

      // Validate name
      const name = entry.name;
      if (!name || typeof name !== 'string') {
        throw new Error(`env[${i}]: 'name' is required and must be a string`);
      }

      if (!NAME_PATTERN.test(name)) {
        throw new Error(`env[${i}]: invalid name '${name}' — must match [A-Za-z_][A-Za-z0-9_]*`);
      }

      // Check duplicates
      if (namesSeen.has(name)) {
        throw new Error(`env[${i}]: duplicate environment variable name '${name}'`);
      }
      namesSeen.add(name);

      // Coerce required/secret to booleans
      const required = !!entry.required;
      const secret = !!entry.secret;

      // Description defaults to ''
      const description = typeof entry.description === 'string' ? entry.description : '';

      // Validate rule (if present)
      let validate: string | undefined;
      if (entry.validate !== undefined && entry.validate !== null) {
        const rule = String(entry.validate);
        if (!isValidateRuleRecognized(rule)) {
          throw new Error(
            `env[${i}]: unrecognized validate rule '${rule}'. ` +
            `Supported: directory, file, command, url, port, regex:<pattern>`
          );
        }
        validate = rule;
      }

      // Default value
      const defaultValue = entry.default !== undefined ? String(entry.default) : undefined;

      declarations.push({
        name,
        description,
        required,
        secret,
        validate,
        default: defaultValue,
      });
    }

    return declarations;
  }
}
