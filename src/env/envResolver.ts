/**
 * EnvResolver — merges declarations with .deck.env values, dual interpolation.
 * Per env-resolver contract.
 *
 * resolveDeclarations() is SYNCHRONOUS — pure data merge, no I/O.
 * validateResolved() is ASYNC — runs validation rules (separate step, T023).
 */

import {
  EnvDeclaration,
  EnvFile,
  EnvValidationContext,
  EnvValidationResult,
  ResolvedEnv,
  ResolvedVar,
} from '../models/env';

/** Regex for {{VAR_NAME}} placeholders */
const VAR_PATTERN = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

/**
 * Interface for the rule validator (injected for T023).
 */
export interface EnvRuleValidatorLike {
  validateValue(
    value: string,
    rule: string,
    context: EnvValidationContext,
  ): Promise<EnvValidationResult>;
}

/**
 * Merges declarations with .deck.env values to produce ResolvedEnv.
 */
export class EnvResolver {
  /**
   * Resolve environment variables by merging declarations with .deck.env values.
   * SYNCHRONOUS — pure data merge, no I/O, no validation rule execution.
   */
  resolveDeclarations(
    declarations: EnvDeclaration[],
    envFile: EnvFile,
  ): ResolvedEnv {
    const variables = new Map<string, ResolvedVar>();
    const secrets: string[] = [];
    const secretValues: string[] = [];

    for (const decl of declarations) {
      const fileValue = envFile.values.get(decl.name);
      let resolvedVar: ResolvedVar;

      if (fileValue !== undefined) {
        // Value found in .deck.env
        resolvedVar = {
          name: decl.name,
          declaration: decl,
          status: 'resolved',
          resolvedValue: fileValue,
          displayValue: decl.secret ? '•••••' : fileValue,
          source: 'env-file',
        };
      } else if (decl.required) {
        // Required but missing — even if default is set, required takes precedence
        resolvedVar = {
          name: decl.name,
          declaration: decl,
          status: 'missing-required',
          displayValue: '<missing>',
          source: 'unresolved',
        };
      } else if (decl.default !== undefined) {
        // Not in file, use default
        resolvedVar = {
          name: decl.name,
          declaration: decl,
          status: 'resolved',
          resolvedValue: decl.default,
          displayValue: decl.secret ? '•••••' : decl.default,
          source: 'default',
        };
      } else {
        // Optional, no default, not in file
        resolvedVar = {
          name: decl.name,
          declaration: decl,
          status: 'missing-optional',
          resolvedValue: '',
          displayValue: '<missing>',
          source: 'unresolved',
        };
      }

      variables.set(decl.name, resolvedVar);

      // Track secrets
      if (decl.secret) {
        secrets.push(decl.name);
        if (resolvedVar.resolvedValue && resolvedVar.resolvedValue.length > 0) {
          secretValues.push(resolvedVar.resolvedValue);
        }
      }
    }

    // Sort secret values longest first (for scrubbing)
    secretValues.sort((a, b) => b.length - a.length);

    // Compute isComplete
    const isComplete = !Array.from(variables.values()).some(
      v => v.status === 'missing-required'
    );

    return { variables, isComplete, secrets, secretValues };
  }

  /**
   * Run validation rules against resolved variables (async I/O).
   * Must be called AFTER resolveDeclarations() as a separate step.
   * T023 — implemented in Phase 4.
   */
  async validateResolved(
    resolved: ResolvedEnv,
    envRuleValidator: EnvRuleValidatorLike,
    context: EnvValidationContext,
  ): Promise<ResolvedEnv> {
    for (const [, variable] of resolved.variables) {
      // Only validate resolved values with a rule
      if (variable.status !== 'resolved') {
        continue;
      }
      if (!variable.declaration.validate) {
        continue;
      }
      if (variable.resolvedValue === undefined) {
        continue;
      }

      const result = await envRuleValidator.validateValue(
        variable.resolvedValue,
        variable.declaration.validate,
        context,
      );

      variable.validationResult = result;
      if (!result.passed) {
        variable.status = 'resolved-invalid';
      }
    }

    // Recompute isComplete
    resolved.isComplete = !Array.from(resolved.variables.values()).some(
      v => v.status === 'missing-required' || (v.declaration.required && v.status === 'resolved-invalid')
    );

    return resolved;
  }

  /**
   * Interpolate {{VAR}} placeholders in action params for display in webview.
   * Secret variables remain as {{VAR}} placeholder text.
   * T013 — implemented in Phase 3.
   */
  interpolateForDisplay(
    params: Record<string, unknown>,
    resolvedEnv: ResolvedEnv,
  ): Record<string, unknown> {
    return this.interpolate(params, resolvedEnv, 'display');
  }

  /**
   * Interpolate {{VAR}} placeholders in action params for execution.
   * ALL variables (including secrets) are replaced with resolved values.
   * CRITICAL: Output must NEVER cross the postMessage boundary.
   * T013 — implemented in Phase 3.
   */
  interpolateForExecution(
    params: Record<string, unknown>,
    resolvedEnv: ResolvedEnv,
  ): Record<string, unknown> {
    return this.interpolate(params, resolvedEnv, 'execution');
  }

  /**
   * Internal interpolation with recursive object walker.
   */
  private interpolate(
    params: Record<string, unknown>,
    resolvedEnv: ResolvedEnv,
    mode: 'display' | 'execution',
  ): Record<string, unknown> {
    return this.deepWalk(params, resolvedEnv, mode) as Record<string, unknown>;
  }

  /**
   * Recursive deep walker — clones the value, interpolating strings.
   */
  private deepWalk(
    value: unknown,
    resolvedEnv: ResolvedEnv,
    mode: 'display' | 'execution',
  ): unknown {
    if (typeof value === 'string') {
      return value.replace(VAR_PATTERN, (match, varName: string) => {
        const v = resolvedEnv.variables.get(varName);
        if (!v) {
          return match; // Unknown var → leave as-is
        }
        if (mode === 'display') {
          if (v.declaration.secret) {
            return `{{${varName}}}`; // Keep placeholder for secrets
          }
          return v.displayValue;
        }
        // execution mode
        return v.resolvedValue ?? '';
      });
    }

    if (Array.isArray(value)) {
      return value.map(item => this.deepWalk(item, resolvedEnv, mode));
    }

    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        result[key] = this.deepWalk(val, resolvedEnv, mode);
      }
      return result;
    }

    // Non-string primitives pass through unchanged
    return value;
  }
}
