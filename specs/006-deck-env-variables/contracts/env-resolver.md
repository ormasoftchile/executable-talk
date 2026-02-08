# Contract: Environment Resolver

**Feature**: 006-deck-env-variables
**Date**: 2026-02-08
**Status**: Draft
**Covers**: FR-001, FR-002, FR-003, FR-005, FR-006, FR-009, FR-010

## Overview

The Environment Resolver is responsible for loading `.deck.env` files, merging values with frontmatter declarations, producing `ResolvedEnv`, and interpolating `{{VAR}}` placeholders into action parameters with separate display/execution paths.

---

## Interface: EnvFileLoader

Loads and parses `.deck.env` sidecar files.

```typescript
interface EnvFileLoader {
  /**
   * Load and parse a .deck.env file from disk.
   * @param deckFilePath - Absolute path to the .deck.md file
   * @returns EnvFile with parsed values and any parse errors
   */
  loadEnvFile(deckFilePath: string): Promise<EnvFile>;

  /**
   * Generate a .deck.env.example template from declarations.
   * Used by the guided setup flow (FR-012).
   * @param declarations - Env declarations from deck frontmatter
   * @returns File content string for .deck.env.example
   */
  generateTemplate(declarations: EnvDeclaration[]): string;
}
```

### loadEnvFile Behavior

| Condition | Result |
|-----------|--------|
| `.deck.env` exists, valid | `EnvFile { exists: true, values: Map, errors: [] }` |
| `.deck.env` exists, has malformed lines | `EnvFile { exists: true, values: Map (valid lines), errors: [...] }` |
| `.deck.env` not found | `EnvFile { exists: false, values: empty Map, errors: [] }` |
| `.deck.env` unreadable (permissions) | `EnvFile { exists: true, values: empty Map, errors: [permission error] }` |

### Parse Rules

```
# Comment line (skipped)
BLANK_LINE (skipped)
KEY=VALUE       → values.set("KEY", "VALUE")
KEY="VALUE"     → values.set("KEY", "VALUE")   (quotes stripped)
KEY='VALUE'     → values.set("KEY", "VALUE")   (quotes stripped)
KEY=            → values.set("KEY", "")
KEY             → errors.push(malformed)
=VALUE          → errors.push(malformed)
KEY=VAL=UE     → values.set("KEY", "VAL=UE")  (first = splits)
```

### generateTemplate Behavior

Produces a `.deck.env.example` file with commented descriptions and placeholder values:

```
# Environment variables for {deckFileName}
# Copy this file to .deck.env and fill in your values

# {declaration.description}
# Required: {yes|no} | Secret: {yes|no} | Validate: {rule|none}
{NAME}=
```

---

## Interface: EnvDeclarationParser

Parses `env:` block from deck frontmatter (YAML already parsed by gray-matter).

```typescript
interface EnvDeclarationParser {
  /**
   * Parse env declarations from frontmatter data.
   * @param frontmatter - Parsed YAML frontmatter object from gray-matter
   * @returns Array of validated EnvDeclaration objects
   * @throws DeckParseError if env block is malformed
   */
  parseEnvDeclarations(frontmatter: Record<string, unknown>): EnvDeclaration[];
}
```

### Parse Rules

Input shape (from YAML):
```yaml
env:
  - name: REPO_PATH
    description: "Path to the repository"
    required: true
    validate: directory
  - name: API_TOKEN
    description: "GitHub personal access token"
    secret: true
    default: ""
```

| Field | Parsing Rule |
|-------|-------------|
| `env` absent | Return `[]` — no declarations |
| `env` not array | Throw `DeckParseError` with line hint |
| Entry missing `name` | Throw `DeckParseError` — name is required |
| `name` invalid identifier | Throw `DeckParseError` with invalid name |
| Duplicate `name` | Throw `DeckParseError` listing the duplicate |
| Unknown fields | Silently ignored (forward compatibility) |
| `required` not boolean | Coerce to boolean |
| `secret` not boolean | Coerce to boolean |
| `validate` unrecognized rule | Throw `DeckParseError` with supported rules list |

---

## Interface: EnvResolver

Merges declarations with file values to produce `ResolvedEnv`.

```typescript
interface EnvResolver {
  /**
   * Resolve environment variables by merging declarations with .deck.env values.
   * @param declarations - Parsed env declarations from frontmatter
   * @param envFile - Parsed .deck.env file
   * @returns Complete resolution state
   */
  resolveDeclarations(
    declarations: EnvDeclaration[],
    envFile: EnvFile
  ): ResolvedEnv;

  /**
   * Interpolate {{VAR}} placeholders in action params for display in webview.
   * Secret variables remain as {{VAR}} placeholder text.
   * Non-secret variables are replaced with their resolved values.
   * @param params - Action parameters (Record<string, unknown>)
   * @param resolvedEnv - Current resolved environment
   * @returns New params object with display-safe values
   */
  interpolateForDisplay(
    params: Record<string, unknown>,
    resolvedEnv: ResolvedEnv
  ): Record<string, unknown>;

  /**
   * Interpolate {{VAR}} placeholders in action params for execution.
   * ALL variables (including secrets) are replaced with resolved values.
   * CRITICAL: Output must NEVER cross the postMessage boundary.
   * @param params - Action parameters (Record<string, unknown>)
   * @param resolvedEnv - Current resolved environment
   * @returns New params object with real values
   */
  interpolateForExecution(
    params: Record<string, unknown>,
    resolvedEnv: ResolvedEnv
  ): Record<string, unknown>;
}
```

### resolveDeclarations Algorithm

```
For each declaration:
  1. Look up declaration.name in envFile.values
  2. If found:
     a. Set source = 'env-file'
     b. Set resolvedValue = envFile value
     c. Run validation rule if declaration.validate is set
     d. If valid → status = 'resolved'
     e. If invalid → status = 'resolved-invalid'
  3. If not found and declaration.default is defined:
     a. Set source = 'default'
     b. Set resolvedValue = declaration.default
     c. Run validation → status = 'resolved' or 'resolved-invalid'
  4. If not found and no default:
     a. If declaration.required → status = 'missing-required'
     b. If not required → status = 'missing-optional', resolvedValue = ''
  5. Compute displayValue:
     a. If declaration.secret and resolvedValue exists → '•••••'
     b. If status starts with 'missing' → '<missing>'
     c. Else → resolvedValue
```

### Interpolation Algorithm

Regex: `/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g`

```
function interpolate(params, resolvedEnv, mode: 'display' | 'execution'):
  return deepClone(params, visitor(value):
    if typeof value !== 'string': return value
    return value.replace(regex, (match, varName):
      var = resolvedEnv.variables.get(varName)
      if !var: return match  // Unknown var → leave as-is
      if mode === 'display':
        if var.declaration.secret: return '{{' + varName + '}}'  // Keep placeholder
        return var.displayValue
      if mode === 'execution':
        return var.resolvedValue ?? ''
    )
```

### Security Invariant

> **CRITICAL**: `interpolateForExecution` output MUST NEVER be included in any message
> sent via `webviewPanel.webview.postMessage()`. The conductor must use
> `interpolateForDisplay` for any data crossing the postMessage boundary,
> and `interpolateForExecution` only at the moment of executor dispatch.

---

## Interface: SecretScrubber

Scrubs secret values from strings that may be displayed in the webview.

```typescript
interface SecretScrubber {
  /**
   * Replace all occurrences of secret values in a string with a mask.
   * Values are replaced longest-first to avoid partial replacement.
   * @param text - Text that may contain secret values
   * @param resolvedEnv - Current resolved environment with secretValues
   * @param mask - Replacement string (default: '•••••')
   * @returns Scrubbed text
   */
  scrub(text: string, resolvedEnv: ResolvedEnv, mask?: string): string;
}
```

### Scrubbing Scope

Per research (R3), terminal output does NOT flow to the webview (fire-and-forget `sendText()`). Scrubbing applies to:

| Surface | How Secrets Could Appear | Scrubbing Point |
|---------|--------------------------|-----------------|
| Slide HTML content | `{{VAR}}` interpolated for display | Display-path keeps `{{VAR}}` — no scrubbing needed |
| `renderBlockUpdate` streaming | Terminal output streamed to webview | Scrub before `postMessage` |
| Error messages | Action failure includes params | Scrub before `actionStatusChanged` |
| Env status badge | Variable values listed | `displayValue` already masked at resolution |

---

## File Watcher Contract

```typescript
interface EnvFileWatcher {
  /**
   * Start watching the .deck.env file for the currently open deck.
   * On change, re-parse and re-resolve, then notify the webview.
   * Uses 500ms debounce to avoid rapid re-parse.
   * @param deckFilePath - Path to the .deck.md file
   * @param onChanged - Callback when env is re-resolved
   */
  watch(
    deckFilePath: string,
    onChanged: (resolvedEnv: ResolvedEnv) => void
  ): vscode.Disposable;
}
```

---

## Integration Points

### Conductor.openDeck() Flow

```
1. Parse deck (existing)
2. Extract envDeclarations from frontmatter (NEW)
3. Load .deck.env file (NEW)
4. Resolve declarations (NEW)
5. Run env validation rules (NEW)
6. Start file watcher (NEW)
7. Store resolvedEnv in conductor state (NEW)
8. Send deckLoaded with envStatus (MODIFIED)
9. Render first slide (existing)
```

### Conductor.executeAction() Flow

```
1. Capture state snapshot (existing)
2. Get action from slide (existing)
3. interpolateForDisplay(action.params, resolvedEnv) → displayParams (NEW)
4. interpolateForExecution(action.params, resolvedEnv) → execParams (NEW)
5. Send actionStatusChanged with displayParams (MODIFIED)
6. Dispatch executor with execParams (MODIFIED)
7. On error, scrub error message before sending to webview (NEW)
```

### PlatformResolver Coexistence

The `{{VAR}}` interpolation runs BEFORE `platformResolver.expandPlaceholders()`. Order:

```
1. {{VAR}} interpolation (env resolver)    → replaces {{REPO_PATH}} with /home/user/repo
2. ${placeholder} expansion (platform)      → replaces ${pathSep} with /
```

This is safe because `{{...}}` and `${...}` are syntactically distinct.
