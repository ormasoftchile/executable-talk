# Action Block Syntax Contract

**Feature**: 003-authoring-reliability  
**Date**: 2026-02-07  
**Version**: 1.0.0

## Overview

This document defines the contract for parsing fenced `action` code blocks in `.deck.md` files. Action blocks replace URL-encoded inline action links with human-readable YAML, while the inline link syntax remains supported for backward compatibility.

---

## Syntax

### Single Action

````markdown
```action
type: file.open
path: src/main.ts
line: 10
```
````

### Single Action with Label

````markdown
```action
label: Open Main File
type: file.open
path: src/main.ts
```
````

### Sequence Action

````markdown
```action
label: Run Full Demo
type: sequence
delay: 500
steps:
  - type: file.open
    path: src/main.ts
  - type: editor.highlight
    path: src/main.ts
    lines: 10-20
  - type: terminal.run
    command: npm test
```
````

---

## Parser Interface

```typescript
/**
 * Result of parsing action blocks from slide content
 */
interface ActionBlockParseResult {
  /** Interactive elements created from action blocks */
  elements: InteractiveElement[];
  /** Content with action blocks stripped (for Markdown rendering) */
  cleanedContent: string;
  /** Parse errors encountered */
  errors: ActionBlockParseError[];
}

/**
 * Error from parsing an action block
 */
interface ActionBlockParseError {
  /** Slide index (0-based) */
  slideIndex: number;
  /** Line number within the slide content (1-based) */
  line: number;
  /** Human-readable error message */
  message: string;
  /** The raw YAML that failed to parse */
  rawYaml: string;
}

/**
 * Parse all fenced action blocks from slide content.
 * Returns interactive elements and cleaned content (blocks stripped).
 */
function parseActionBlocks(
  content: string,
  slideIndex: number
): ActionBlockParseResult;
```

---

## YAML Schema Per Action Type

### `file.open`

```yaml
type: file.open
path: string          # REQUIRED — workspace-relative file path
line: number          # optional — 1-based line number
column: number        # optional — 1-based column number
range: string         # optional — line range (e.g., "10-20")
viewColumn: number    # optional — editor view column
preview: boolean      # optional — default false
```

### `editor.highlight`

```yaml
type: editor.highlight
path: string          # REQUIRED — workspace-relative file path
lines: string         # REQUIRED — line range (e.g., "10-20" or "10")
color: string         # optional — CSS color
style: string         # optional — "subtle" | "prominent" (default: "prominent")
duration: number      # optional — ms, 0 = until slide exit
```

### `terminal.run`

```yaml
type: terminal.run
command: string       # REQUIRED — command to execute
name: string          # optional — terminal name
background: boolean   # optional — run in background
timeout: number       # optional — ms, default 30000
clear: boolean        # optional — clear terminal first
reveal: boolean       # optional — show terminal panel
cwd: string           # optional — working directory (workspace-relative)
```

### `debug.start`

```yaml
type: debug.start
configName: string    # REQUIRED — launch configuration name
workspaceFolder: string  # optional — for multi-root
stopOnEntry: boolean     # optional — stop at entry point
```

### `sequence`

```yaml
type: sequence
steps:                # REQUIRED — non-empty array of action definitions
  - type: string
    # ... type-specific params
delay: number         # optional — ms between steps, default 500
stopOnError: boolean  # optional — stop on first failure, default true
```

### `vscode.command`

```yaml
type: vscode.command
id: string            # REQUIRED — VS Code command ID
args: array | string  # optional — command arguments
```

---

## Parse Pipeline Integration

Action block parsing integrates into the existing `slideParser.ts → parseSlideContent()` pipeline:

```
parseSlideContent(index, rawContent)
  ├── 1. Extract slide frontmatter (gray-matter)     [existing]
  ├── 2. parseActionBlocks(content, index)            [NEW — returns elements + cleanedContent]
  ├── 3. md.render(cleanedContent)                    [existing — uses cleaned content]
  ├── 4. processFragments(html)                       [existing]
  ├── 5. parseActionLinks(content, index)             [existing — inline links still parsed]
  └── 6. parseRenderDirectives(content, index)        [existing]
```

**Key behaviors**:
- Step 2 extracts `ActionBlock` YAML, converts to `InteractiveElement` objects, and returns content with action blocks removed
- Step 3 renders the cleaned content (no `action` code blocks in HTML output)
- Step 5 continues to parse inline links from the original content — both formats coexist
- Elements from blocks and inline links are merged into `slide.interactiveElements`

---

## Error Handling

| Condition | Behavior |
|-----------|----------|
| Invalid YAML syntax | `ActionBlockParseError` with js-yaml error message and line number |
| Missing `type` field | `ActionBlockParseError`: "Action block missing required 'type' field" |
| Unrecognized `type` value | `ActionBlockParseError`: "Unknown action type '{value}'" |
| Missing required parameter | `ActionBlockParseError`: "Action '{type}' requires parameter '{param}'" |
| YAML parses but is not an object | `ActionBlockParseError`: "Action block must be a YAML mapping" |

Parse errors do **not** prevent the deck from loading. The slide renders without the invalid action block, and errors are reported via the `ParseResult` error mechanism.

---

## Backward Compatibility

- Inline action links (`[Label](action:type?params)`) continue to work without modification (FR-004)
- A slide may contain both inline links and fenced blocks
- Both produce the same `Action` model and are interchangeable at runtime
- `InteractiveElement.source` field distinguishes origin: `'inline'` or `'block'`
