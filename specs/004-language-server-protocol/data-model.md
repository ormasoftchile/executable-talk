# Data Model — 004 Language Server Protocol Support

This document defines the structural types for the LSP server's document model. All position data uses **0-based line, 0-based character** (LSP standard, UTF-16 code units).

---

## Core Types

### Range

```typescript
/**
 * LSP-standard range. Both line and character are 0-based.
 * Reuses the Range type from vscode-languageserver-types.
 */
interface Range {
  start: Position;
  end: Position;
}

interface Position {
  line: number;      // 0-based
  character: number; // 0-based, UTF-16 code units
}
```

---

## DeckDocument

The top-level document model maintained by the LSP server. One instance per open `.deck.md` file.

```typescript
interface DeckDocument {
  /** Document URI (e.g., file:///path/to/deck.deck.md) */
  uri: string;

  /** Monotonically increasing version from LSP sync */
  version: number;

  /** Full document text (updated incrementally) */
  content: string;

  /** Parsed slide ranges, ordered by position */
  slides: SlideRange[];

  /** Cached diagnostics (recomputed on change after debounce) */
  diagnostics: Diagnostic[];

  /** Frontmatter range (first `---` to second `---`), if present */
  frontmatterRange: Range | undefined;

  /** Parsed frontmatter metadata */
  metadata: DeckMetadataRange | undefined;
}
```

---

## SlideRange

Represents a single slide's boundaries and parsed content within the document.

```typescript
interface SlideRange {
  /** 0-based slide index */
  index: number;

  /** Range from slide start to slide end (exclusive of next delimiter) */
  range: Range;

  /** Frontmatter title, if declared in slide-level frontmatter */
  title: string | undefined;

  /** Slide-level frontmatter range (for slides with their own frontmatter) */
  frontmatterRange: Range | undefined;

  /** Fenced action blocks within this slide */
  actionBlocks: ActionBlockRange[];

  /** Inline action links `[label](action:type?params)` */
  actionLinks: ActionLinkRange[];

  /** Render directives `[label](render:type?params)` */
  renderDirectives: RenderDirectiveRange[];
}
```

---

## ActionBlockRange

Represents a fenced ` ```action ` block with its parsed YAML content.

```typescript
interface ActionBlockRange {
  /** Full range including fence lines */
  range: Range;

  /** Range of content lines (between fences, exclusive of fence lines) */
  contentRange: Range;

  /** Raw YAML text between fences */
  yamlContent: string;

  /** Parsed YAML result (undefined if parse failed) */
  parsedYaml: Record<string, unknown> | undefined;

  /** YAML parse error with precise range, if parsing failed */
  parseError: YamlParseError | undefined;

  /** Resolved action type (from `type:` field), undefined if missing/invalid */
  actionType: string | undefined;

  /** Range of the `type:` value (for hover, go-to-definition) */
  typeRange: Range | undefined;

  /** Individual parameter ranges for key-value pairs */
  parameters: ParameterRange[];

  /** Steps array for sequence types */
  steps: StepRange[];
}
```

---

## ParameterRange

Maps a single YAML key-value pair to its document positions.

```typescript
interface ParameterRange {
  /** The parameter key name (e.g., "path", "lines") */
  key: string;

  /** The parameter value (parsed from YAML) */
  value: unknown;

  /** Range of the key text */
  keyRange: Range;

  /** Range of the value text */
  valueRange: Range;

  /** Full line range (key + colon + value) */
  lineRange: Range;
}
```

---

## StepRange

Represents a single step within a `sequence` action's `steps` array.

```typescript
interface StepRange {
  /** 0-based step index within the steps array */
  index: number;

  /** Full range of this step entry (from `- ` to next step or block end) */
  range: Range;

  /** Resolved step action type */
  actionType: string | undefined;

  /** Range of the step's `type:` value */
  typeRange: Range | undefined;

  /** Parameters within this step */
  parameters: ParameterRange[];
}
```

---

## ActionLinkRange

Represents an inline action link `[Label](action:type?params)`.

```typescript
interface ActionLinkRange {
  /** Full range of the link syntax `[...](action:...)` */
  range: Range;

  /** The link label text */
  label: string;

  /** Range of the action type within the URI */
  typeRange: Range;

  /** Resolved action type string */
  type: string;

  /** Parsed query parameters with their ranges */
  params: Map<string, ParamValueRange>;
}

interface ParamValueRange {
  /** The raw string value */
  value: string;

  /** Range of this value in the document */
  range: Range;
}
```

---

## RenderDirectiveRange

Represents a render directive `[Label](render:type?params)`.

```typescript
interface RenderDirectiveRange {
  /** Full range of the directive syntax `[...](render:...)` */
  range: Range;

  /** The directive label text */
  label: string;

  /** Range of the render type within the URI */
  typeRange: Range;

  /** Resolved render type string */
  type: string;

  /** Parsed query parameters with their ranges */
  params: Map<string, ParamValueRange>;
}
```

---

## YamlParseError

Structured YAML error with precise position.

```typescript
interface YamlParseError {
  /** Human-readable error message */
  message: string;

  /** Range in the document where the error occurred */
  range: Range;

  /** The js-yaml error mark, if available */
  mark: { line: number; column: number } | undefined;
}
```

---

## DeckMetadataRange

Document-level frontmatter metadata with position tracking.

```typescript
interface DeckMetadataRange {
  /** Full frontmatter range */
  range: Range;

  /** Parsed metadata key-value pairs */
  title: string | undefined;
  author: string | undefined;
  options: Record<string, unknown> | undefined;

  /** Raw parsed frontmatter object */
  raw: Record<string, unknown>;
}
```

---

## ActionContext (Discriminated Union)

Cursor-position context for determining completion and hover behavior.

```typescript
type ActionContext =
  | TypeValueContext
  | ParamNameContext
  | ParamValueContext
  | StepContext
  | UnknownContext;

interface TypeValueContext {
  kind: 'type-value';
  block: ActionBlockRange;
  /** Current partial type value (for filtering) */
  partialValue: string;
  /** Range to replace with the completed type */
  replaceRange: Range;
}

interface ParamNameContext {
  kind: 'param-name';
  block: ActionBlockRange;
  /** Resolved action type for this block */
  actionType: string;
  /** Parameters already present in the block */
  existingParams: string[];
  /** Range to insert the parameter name */
  insertRange: Range;
}

interface ParamValueContext {
  kind: 'param-value';
  block: ActionBlockRange;
  /** Resolved action type for this block */
  actionType: string;
  /** The parameter name whose value is being edited */
  paramName: string;
  /** Current partial value (for filtering) */
  partialValue: string;
  /** Range to replace with the completed value */
  replaceRange: Range;
}

interface StepContext {
  kind: 'step-context';
  block: ActionBlockRange;
  step: StepRange;
  /** Inner context within the step */
  innerContext: TypeValueContext | ParamNameContext | ParamValueContext;
}

interface UnknownContext {
  kind: 'unknown';
}
```

---

## WorkspaceFileCache

Cached workspace file listing for path-based completions.

```typescript
interface WorkspaceFileCache {
  /** Workspace root URIs */
  roots: string[];

  /** Relative file paths from workspace root */
  files: string[];

  /** Timestamp of last full refresh */
  lastRefresh: number;

  /** Maximum number of cached entries */
  maxEntries: number;
}
```

---

## Relationship Diagram

```
DeckDocument
├── frontmatterRange?: Range
├── metadata?: DeckMetadataRange
└── slides: SlideRange[]
    ├── frontmatterRange?: Range
    ├── actionBlocks: ActionBlockRange[]
    │   ├── typeRange?: Range
    │   ├── parseError?: YamlParseError
    │   ├── parameters: ParameterRange[]
    │   └── steps: StepRange[]
    │       ├── typeRange?: Range
    │       └── parameters: ParameterRange[]
    ├── actionLinks: ActionLinkRange[]
    │   └── params: Map<string, ParamValueRange>
    └── renderDirectives: RenderDirectiveRange[]
        └── params: Map<string, ParamValueRange>
```

---

## Position Convention Standard

| Rule | Convention |
|------|-----------|
| Line numbering | 0-based (LSP standard) |
| Character numbering | 0-based, UTF-16 code units (LSP standard) |
| Range.end | Exclusive (points to one past the last character) |
| Slide range | Start of first content line to line before next `---` |
| Action block range | Line of ` ```action ` to line of closing ` ``` ` (inclusive) |
| Parameter value range | First character of value to last character of value (exclusive end) |
| Frontmatter range | First `---` line to second `---` line (inclusive) |
