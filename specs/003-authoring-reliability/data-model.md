# Data Model: Authoring & Reliability — Critical Adoption Blockers

**Feature**: 003-authoring-reliability  
**Date**: 2026-02-07  
**Status**: Draft

## Entity Relationship Diagram

```
                           ┌──────────────┐
                           │     Deck     │
                           └──────┬───────┘
                                  │ 1:N
                                  ▼
                           ┌──────────────┐
                           │    Slide     │
                           └──────┬───────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │ 1:N         │ 1:N         │ 1:N
                    ▼             ▼             ▼
             ┌────────────┐ ┌──────────┐ ┌───────────────┐
             │ActionBlock │ │  Action  │ │RenderDirective│
             │  (NEW)     │ │(existing)│ │   (existing)  │
             └─────┬──────┘ └──────────┘ └───────────────┘
                   │ parses to
                   ▼
             ┌──────────┐
             │  Action  │
             └──────────┘


 ┌──────────────────┐        1:N       ┌───────────────────┐
 │ ValidationReport │──────────────────▶│  ValidationIssue  │
 │     (NEW)        │                   │      (NEW)        │
 └──────────────────┘                   └───────────────────┘


 ┌──────────────────┐
 │   ActionError    │ (extended from existing ExecutionResult)
 │     (NEW)        │
 └──────────────────┘
```

---

## New Entities

### ActionBlock

Represents a fenced code block with language `action` containing a YAML action definition. Parsed into one or more `Action` entities at parse time.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | `string` | ✓ | Unique identifier within slide (generated) |
| `type` | `ActionType` | ✓ | Action type (`file.open`, `editor.highlight`, etc.) |
| `params` | `Record<string, unknown>` | ✓ | Type-specific parameters parsed from YAML |
| `label` | `string` | | Display label (from YAML `label` field or auto-generated from type) |
| `rawYaml` | `string` | ✓ | Original YAML text (for error reporting) |
| `position` | `{ startLine: number; endLine: number }` | ✓ | Line range in the slide content (1-based) |
| `steps` | `ActionBlockStep[]` | | Sequence steps (only when `type: sequence`) |

**ActionBlockStep Structure**:
```
ActionBlockStep {
  type: ActionType
  params: Record<string, unknown>
}
```

**Validation Rules**:
- `type` MUST be a recognized `ActionType` value
- `params` MUST satisfy the parameter requirements for the given `type`
- When `type` is `sequence`, `steps` MUST be a non-empty array
- YAML content MUST parse without syntax errors

**Relationship to existing entities**:
- An `ActionBlock` is converted to an `Action` (same model as inline action links) during parsing
- The resulting `Action` is added to the slide's `interactiveElements` array
- The `ActionBlock` source text is stripped from slide content before Markdown rendering

---

### ValidationReport

Represents the result of a preflight deck validation. Produced by the `Validate Deck` command.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `deckFilePath` | `string` | ✓ | Absolute path to the validated `.deck.md` file |
| `timestamp` | `number` | ✓ | Unix timestamp of validation run |
| `durationMs` | `number` | ✓ | Total validation time in milliseconds |
| `issues` | `ValidationIssue[]` | ✓ | List of detected issues (may be empty) |
| `checksPerformed` | `number` | ✓ | Total number of checks executed |
| `slideCount` | `number` | ✓ | Number of slides in the deck |
| `actionCount` | `number` | ✓ | Number of actions validated |
| `renderDirectiveCount` | `number` | ✓ | Number of render directives validated |
| `passed` | `boolean` | ✓ | `true` if no issues with severity `error` |

**Validation Rules**:
- `issues` defaults to empty array (no issues = successful validation)
- `passed` is `false` if any issue has `severity: 'error'`; warnings alone do not cause failure

---

### ValidationIssue

Represents a single problem found during preflight validation.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `severity` | `'error' \| 'warning' \| 'info'` | ✓ | Issue severity level |
| `slideIndex` | `number` | ✓ | Zero-based slide index where the issue was found |
| `source` | `string` | ✓ | The action or directive that caused the issue (e.g., `"file.open"`, `"render:command"`) |
| `target` | `string` | | The specific target (file path, command, config name) |
| `message` | `string` | ✓ | Human-readable description of the issue |
| `line` | `number` | | Line number in the `.deck.md` file (1-based, for diagnostic mapping) |
| `range` | `{ start: number; end: number }` | | Character range for diagnostic highlighting |

**Severity rules**:

| Condition | Severity |
|-----------|----------|
| File path does not exist | `error` |
| Line range exceeds file length | `error` |
| Debug configuration not found | `error` |
| Command not found on PATH | `warning` (may be a shell builtin) |
| Action requires Workspace Trust in untrusted workspace | `warning` |
| Command check timeout | `info` |

---

### ActionError (extended payload)

Extends the existing `ActionStatusChangedMessage` payload to carry structured error context for webview rendering. Not a new entity — extends the existing message payload.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `actionId` | `string` | ✓ | Existing — identifies the failed action |
| `status` | `ActionStatus` | ✓ | Existing — set to `'failed'` |
| `error` | `string` | | Existing — human-readable error message |
| `actionType` | `ActionType` | | **NEW** — action type for display (e.g., `file.open`) |
| `actionTarget` | `string` | | **NEW** — target for display (e.g., `src/main.ts`, `npm test`) |
| `sequenceDetail` | `SequenceErrorDetail` | | **NEW** — only present for sequence failures |

**SequenceErrorDetail Structure**:

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `totalSteps` | `number` | ✓ | Total number of steps in the sequence |
| `failedStepIndex` | `number` | ✓ | Zero-based index of the step that failed |
| `failedStepType` | `ActionType` | ✓ | Action type of the failed step |
| `stepResults` | `StepResult[]` | ✓ | Ordered results for each step |

**StepResult Structure**:

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `type` | `ActionType` | ✓ | Step's action type |
| `target` | `string` | | Step's target (path, command, etc.) |
| `status` | `'success' \| 'failed' \| 'skipped'` | ✓ | Outcome |
| `error` | `string` | | Error message if status is `failed` |

---

## Modified Entities

### Slide (extended)

No new attributes added to the `Slide` interface. `ActionBlock` instances are parsed into `Action` objects and stored in the existing `interactiveElements` array (same as inline action links). The parser strips action block raw text from `content` before rendering to `html`.

### InteractiveElement (extended)

| Attribute | Type | Change | Description |
|-----------|------|--------|-------------|
| `source` | `'inline' \| 'block'` | **NEW optional** | Indicates whether the element came from an inline link or a fenced block. Defaults to `'inline'` for backward compatibility. |

---

## Entity Schema: ActionSchema (metadata for authoring)

Static metadata used by authoring providers (completion, hover, diagnostics). Not persisted — built at activation time.

| Attribute | Type | Description |
|-----------|------|-------------|
| `type` | `ActionType` | Action type identifier |
| `description` | `string` | Human-readable description for hover docs |
| `requiresTrust` | `boolean` | Whether the action requires Workspace Trust |
| `parameters` | `ActionParameterSchema[]` | Parameter definitions |

**ActionParameterSchema**:

| Attribute | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Parameter name (e.g., `path`, `lines`, `command`) |
| `type` | `'string' \| 'number' \| 'boolean' \| 'array'` | Parameter value type |
| `required` | `boolean` | Whether the parameter is required |
| `description` | `string` | Human-readable description for hover/completion docs |
| `enum` | `string[]` | Allowed values (for enumerated parameters like `style`) |
| `completionKind` | `'file' \| 'launchConfig' \| 'enum' \| 'text'` | Hint for completion provider behavior |
