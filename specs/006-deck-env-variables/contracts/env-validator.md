# Contract: Environment Validator

**Feature**: 006-deck-env-variables
**Date**: 2026-02-08
**Status**: Draft
**Covers**: FR-005, FR-007, FR-008, FR-015, FR-016

## Overview

The Environment Validator extends the existing preflight validation system to verify environment variable values against their declared validation rules, check `.deck.env` presence, and warn about `.gitignore` coverage.

---

## Interface: EnvRuleValidator

Validates a single resolved variable value against its declared `validate` rule.

```typescript
interface EnvRuleValidator {
  /**
   * Validate a resolved value against its validation rule.
   * @param value - The resolved value to validate
   * @param rule - The validation rule from the declaration
   * @param context - Workspace context for file/directory resolution
   * @returns Validation result
   */
  validateValue(
    value: string,
    rule: string,
    context: EnvValidationContext
  ): Promise<EnvValidationResult>;

  /**
   * Check if a rule string is a recognized validation rule.
   * @param rule - Rule string to check
   * @returns True if recognized
   */
  isValidRule(rule: string): boolean;
}

interface EnvValidationContext {
  /** Workspace root for resolving relative paths */
  workspaceRoot: string;
  /** Deck file directory for resolving relative paths */
  deckDirectory: string;
}
```

### Built-in Validation Rules

| Rule | Validation Logic | Success | Failure |
|------|-----------------|---------|---------|
| `directory` | `fs.stat(path).isDirectory()` with workspace-relative resolution | Path exists and is a directory | Path missing or not a directory |
| `file` | `fs.stat(path).isFile()` with workspace-relative resolution | Path exists and is a file | Path missing or not a file |
| `command` | Check if command exists via `which`/`where` | Command found in PATH | Command not found |
| `url` | `new URL(value)` succeeds and has `http:` or `https:` protocol | Valid HTTP/HTTPS URL | Parse failure or wrong protocol |
| `port` | Parse as integer, check range `1-65535` | Valid port number | Not a number or out of range |
| `regex:<pattern>` | `new RegExp(pattern).test(value)` | Value matches pattern | No match or invalid regex |

### Rule Validation Details

#### `directory` Rule

```typescript
async validateDirectory(value: string, ctx: EnvValidationContext): Promise<EnvValidationResult> {
  // Resolve relative to deck directory first, then workspace root
  const resolved = path.isAbsolute(value)
    ? value
    : path.resolve(ctx.deckDirectory, value);

  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      return { rule: 'directory', passed: true, message: `Directory exists: ${resolved}` };
    }
    return { rule: 'directory', passed: false, message: `Path exists but is not a directory: ${resolved}` };
  } catch {
    return { rule: 'directory', passed: false, message: `Directory not found: ${resolved}` };
  }
}
```

#### `file` Rule

Same pattern as `directory` but checks `stat.isFile()`.

#### `command` Rule

```typescript
async validateCommand(value: string, ctx: EnvValidationContext): Promise<EnvValidationResult> {
  // Use 'where' on Windows, 'which' on Unix
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  try {
    await execAsync(`${cmd} ${value}`);
    return { rule: 'command', passed: true, message: `Command found: ${value}` };
  } catch {
    return { rule: 'command', passed: false, message: `Command not found in PATH: ${value}` };
  }
}
```

#### `url` Rule

```typescript
validateUrl(value: string): EnvValidationResult {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { rule: 'url', passed: true, message: `Valid URL: ${value}` };
    }
    return { rule: 'url', passed: false, message: `URL must use http: or https: protocol, got: ${url.protocol}` };
  } catch {
    return { rule: 'url', passed: false, message: `Invalid URL format: ${value}` };
  }
}
```

#### `port` Rule

```typescript
validatePort(value: string): EnvValidationResult {
  const port = parseInt(value, 10);
  if (isNaN(port) || port < 1 || port > 65535 || port.toString() !== value.trim()) {
    return { rule: 'port', passed: false, message: `Invalid port number: ${value} (must be 1-65535)` };
  }
  return { rule: 'port', passed: true, message: `Valid port: ${port}` };
}
```

#### `regex:<pattern>` Rule

```typescript
validateRegex(value: string, pattern: string): EnvValidationResult {
  try {
    const regex = new RegExp(pattern);
    if (regex.test(value)) {
      return { rule: `regex:${pattern}`, passed: true, message: `Value matches pattern` };
    }
    return { rule: `regex:${pattern}`, passed: false, message: `Value does not match pattern: /${pattern}/` };
  } catch (e) {
    return { rule: `regex:${pattern}`, passed: false, message: `Invalid regex pattern: ${pattern}` };
  }
}
```

---

## Integration: PreflightValidator Extension

The existing `PreflightValidator.validate()` runs phases 1-5. Environment validation adds **Phase 6**.

```typescript
// In preflightValidator.ts validate() method:
// Phase 6: Environment variable validation (NEW)
if (context.envDeclarations?.length) {
  issues.push(...await this.validateEnvironment(context));
}
```

### Phase 6: validateEnvironment

```typescript
async validateEnvironment(context: ValidationContext): Promise<ValidationIssue[]> {
  const issues: ValidationIssue[] = [];
  const envFile = await this.envFileLoader.loadEnvFile(context.deckFilePath);

  // 6a: Check .deck.env existence (FR-008)
  if (!envFile.exists && context.envDeclarations.length > 0) {
    issues.push({
      severity: 'warning',
      message: 'No .deck.env file found. Environment variables will use defaults or be unresolved. Create .deck.env file alongside your .deck.md file.',
      source: 'env',
      slideIndex: -1
    });
  }

  // 6b: Check .deck.env parse errors
  for (const error of envFile.errors) {
    issues.push({
      severity: 'warning',
      message: `Malformed line ${error.line} in .deck.env: ${error.rawText}`,
      source: 'env',
      slideIndex: -1
    });
  }

  // 6c: Use pre-resolved env from context (already resolved + validated in Conductor.openDeck)
  const resolved = context.resolvedEnv!;

  for (const [name, variable] of resolved.variables) {
    if (variable.status === 'missing-required') {
      issues.push({
        severity: 'error',
        message: `Required environment variable '${name}' is not set in .deck.env. Add ${name}=<value> to your .deck.env file.`,
        source: 'env',
        slideIndex: -1
      });
    }

    if (variable.status === 'resolved-invalid' && variable.validationResult) {
      issues.push({
        severity: 'warning',
        message: `Environment variable '${name}' failed validation: ${variable.validationResult.message}`,
        source: 'env',
        slideIndex: -1
      });
    }
  }

  // 6d: Check .gitignore coverage (FR-016)
  if (envFile.exists) {
    const gitignored = await this.checkGitignore(context.deckFilePath);
    if (!gitignored) {
      issues.push({
        severity: 'warning',
        message: '.deck.env file is not covered by .gitignore. Secrets may be committed. Add *.deck.env to your .gitignore file.',
        source: 'env',
        slideIndex: -1
      });
    }
  }

  // 6e: Warn about unused variables in .deck.env
  const declaredNames = new Set(context.envDeclarations.map(d => d.name));
  for (const key of envFile.values.keys()) {
    if (!declaredNames.has(key)) {
      issues.push({
        severity: 'info',
        message: `Variable '${key}' in .deck.env is not declared in deck frontmatter`,
        source: 'env',
        slideIndex: -1
      });
    }
  }

  return issues;
}
```

### checkGitignore Implementation

```typescript
async checkGitignore(deckFilePath: string): Promise<boolean> {
  const envFilePath = deckFilePath.replace(/\.deck\.md$/, '.deck.env');

  // Primary: use git check-ignore
  try {
    const { exitCode } = await execAsync(
      `git check-ignore -q "${envFilePath}"`,
      { cwd: path.dirname(deckFilePath) }
    );
    return exitCode === 0; // 0 = ignored, 1 = not ignored
  } catch {
    // Fallback: string search in .gitignore files
    return this.checkGitignoreFallback(deckFilePath);
  }
}

async checkGitignoreFallback(deckFilePath: string): Promise<boolean> {
  const patterns = ['*.deck.env', '.deck.env', '*.env'];
  // Search .gitignore files from deck directory up to workspace root
  // Return true if any pattern matches
}
```

---

## Diagnostic Integration

The existing `ActionDiagnosticProvider` is extended to surface env issues as VS Code diagnostics.

### New Diagnostics

| Code | Severity | Condition | Message |
|------|----------|-----------|---------|
| `env-undeclared-ref` | Warning | `{{VAR}}` used in action but VAR not in `env:` block | `Environment variable '{VAR}' referenced but not declared in frontmatter` |
| `env-duplicate-name` | Error | Two declarations with same `name` | `Duplicate environment variable name: '{name}'` |
| `env-invalid-rule` | Error | Unrecognized `validate` rule | `Unknown validation rule: '{rule}'` |
| `env-invalid-name` | Error | Name doesn't match identifier pattern | `Invalid variable name: '{name}'` |

---

## Guided Setup Flow

When the user clicks "Set Up Now" from the env status badge (FR-012, FR-013):

```
1. Webview sends EnvSetupRequestMessage
2. Conductor receives message
3. Check if .deck.env.example exists
   a. If not → generate from declarations via envFileLoader.generateTemplate()
   b. Write .deck.env.example alongside .deck.md
4. Check if .deck.env exists
   a. If not → copy .deck.env.example to .deck.env
5. Open .deck.env in editor (vscode.window.showTextDocument)
6. Show information message: "Fill in the values for your environment variables"
7. FileSystemWatcher detects .deck.env change → re-resolve → update webview
```
