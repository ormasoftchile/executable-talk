# Contract: Platform Resolver

**Feature**: 005-nonlinear-nav-scenes  
**Date**: 2026-02-07  
**Version**: 1.0.0

## Overview

Defines the cross-platform command resolution interface for `terminal.run` actions. Resolves platform-specific commands and path placeholders so that a single `.deck.md` works on macOS, Windows, and Linux.

---

## PlatformResolver Interface

```typescript
interface PlatformResolver {
  /**
   * Resolve a command parameter that may be a plain string or a PlatformCommandMap.
   * Returns the resolved command string for the current OS, with placeholders expanded.
   * Returns undefined if no command available for current platform.
   */
  resolve(command: string | PlatformCommandMap): ResolvedCommand;

  /**
   * Get the current platform key.
   */
  getCurrentPlatform(): PlatformKey;

  /**
   * Expand path placeholders in a command string.
   */
  expandPlaceholders(command: string): string;

  /**
   * Validate a PlatformCommandMap for coverage of the current platform.
   * Used by preflight validation.
   */
  validate(command: PlatformCommandMap): PlatformValidationResult;
}
```

---

## Types

```typescript
type PlatformKey = 'macos' | 'windows' | 'linux';

interface PlatformCommandMap {
  macos?: string;
  windows?: string;
  linux?: string;
  default?: string;
}

interface ResolvedCommand {
  /** The resolved command string, or undefined if not available */
  command: string | undefined;
  /** The platform key used for resolution */
  platform: PlatformKey;
  /** Whether the command came from a platform-specific entry or the default */
  source: 'platform-specific' | 'default' | 'none';
  /** Error message if command could not be resolved */
  error?: string;
}

interface PlatformValidationResult {
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
```

---

## Resolution Algorithm

```
Input: command parameter (string | PlatformCommandMap)

1. If command is a string:
   → expandPlaceholders(command)
   → return { command, platform: getCurrentPlatform(), source: 'platform-specific' }

2. If command is a PlatformCommandMap:
   a. key = getCurrentPlatform()  // 'macos' | 'windows' | 'linux'
   b. resolved = commandMap[key]
   c. If resolved exists:
      → expandPlaceholders(resolved)
      → return { command: resolved, platform: key, source: 'platform-specific' }
   d. If commandMap.default exists:
      → expandPlaceholders(commandMap.default)
      → return { command: default, platform: key, source: 'default' }
   e. Else:
      → return { command: undefined, platform: key, source: 'none',
                  error: `Command not available on ${key}. Consider adding a default entry.` }
```

---

## Platform Detection

```typescript
function getCurrentPlatform(): PlatformKey {
  switch (process.platform) {
    case 'darwin': return 'macos';
    case 'win32':  return 'windows';
    case 'linux':  return 'linux';
    default:       return 'linux';  // Best-effort fallback
  }
}
```

---

## Placeholder Expansion

| Placeholder | Resolution | Example (Windows) | Example (macOS) |
|-------------|-----------|-------------------|-----------------|
| `${pathSep}` | `path.sep` | `\` | `/` |
| `${home}` | `os.homedir()` | `C:\Users\john` | `/Users/john` |
| `${shell}` | `vscode.env.shell` | `C:\Windows\System32\cmd.exe` | `/bin/zsh` |
| `${pathDelimiter}` | `path.delimiter` | `;` | `:` |

```typescript
function expandPlaceholders(command: string): string {
  return command
    .replace(/\$\{pathSep\}/g, path.sep)
    .replace(/\$\{home\}/g, os.homedir())
    .replace(/\$\{shell\}/g, vscode.env.shell)
    .replace(/\$\{pathDelimiter\}/g, path.delimiter);
}
```

---

## Integration with terminalRunExecutor

The `PlatformResolver` hooks into `terminalRunExecutor.ts` at the point where the `command` parameter is read:

```
Existing flow:
  params.command (string) → sendText(command)

New flow:
  params.command (string | PlatformCommandMap)
    → PlatformResolver.resolve(command)
    → if resolved.command: sendText(resolved.command)
    → if resolved.error: return ActionError with error message (non-blocking)
```

**Backward Compatibility**: If `params.command` is a plain string, the resolver returns it as-is (with placeholder expansion). No breaking change.

---

## Integration with Preflight Validation

The `preflightValidator.ts` gains a new check for cross-platform command coverage:

```
For each action in deck where type === 'terminal.run':
  If params.command is PlatformCommandMap:
    result = PlatformResolver.validate(command)
    If current platform not covered AND no default:
      → Add warning: "Slide {N}: terminal.run command has no variant for {platform} and no default"
```

**Severity**: Warning (not error) — the deck can still be presented, but the specific command will fail on the current OS.

---

## YAML Syntax Examples

### Simple string (existing — unchanged)
```yaml
onEnter:
  - type: terminal.run
    params:
      command: "npm test"
      name: tests
```

### Platform map (new)
```yaml
onEnter:
  - type: terminal.run
    params:
      command:
        macos: "open ."
        windows: "explorer ."
        linux: "xdg-open ."
      name: file-browser
```

### Platform map with default fallback
```yaml
onEnter:
  - type: terminal.run
    params:
      command:
        windows: "dir /b"
        default: "ls -la"
      name: listing
```

### Using path placeholders
```yaml
onEnter:
  - type: terminal.run
    params:
      command: "cd ${home}${pathSep}projects && npm start"
      name: dev-server
```
