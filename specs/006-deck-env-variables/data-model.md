# Data Model: Deck Environment Variables

**Feature**: 006-deck-env-variables
**Date**: 2026-02-08
**Status**: Draft

## Entity Relationship Diagram

```
                           ┌──────────────┐
                           │     Deck     │
                           └──────┬───────┘
                                  │
                    ┌─────────────┼─────────────────┐
                    │ 1:N         │ 1:N              │ 0..1
                    ▼             ▼                  ▼
             ┌──────────┐ ┌──────────────┐   ┌───────────┐
             │  Slide   │ │EnvDeclaration│   │  EnvFile  │
             │(existing)│ │   (NEW)      │   │  (NEW)    │
             └──────────┘ └──────┬───────┘   └─────┬─────┘
                                 │                  │
                                 │   merge          │ parse
                                 ▼                  ▼
                          ┌──────────────────────────────┐
                          │        ResolvedEnv           │
                          │          (NEW)               │
                          └──────────┬───────────────────┘
                                     │
                         ┌───────────┼───────────┐
                         │ 1:N       │           │
                         ▼           ▼           ▼
                  ┌────────────┐ ┌────────┐ ┌──────────┐
                  │ResolvedVar │ │Display │ │Execution │
                  │   (NEW)    │ │ Params │ │  Params  │
                  └────────────┘ └────────┘ └──────────┘


                  ┌───────────────────┐
                  │  EnvFileTemplate  │  (.deck.env.example)
                  │      (NEW)        │
                  └───────────────────┘


 ┌──────────────────┐        extends       ┌───────────────────┐
 │ ValidationReport │◁─────────────────────│  EnvValidation    │
 │   (existing)     │                      │  Phase (NEW)      │
 └──────────────────┘                      └───────────────────┘
```

---

## New Entities

### EnvDeclaration

Represents a single environment variable requirement declared in the deck's YAML frontmatter `env:` block.

| Attribute | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | `string` | ✓ | — | Variable name (valid identifier: `[A-Za-z_][A-Za-z0-9_]*`) |
| `description` | `string` | | `''` | Human-readable description for guided setup and hover docs |
| `required` | `boolean` | | `false` | Whether the variable must be present in `.deck.env` |
| `secret` | `boolean` | | `false` | Whether the value should be masked in the webview |
| `validate` | `string` | | — | Validation rule: `directory`, `file`, `command`, `url`, `port`, `regex:<pattern>` |
| `default` | `string` | | — | Fallback value used when `.deck.env` does not provide the variable |

**Validation Rules**:
- `name` MUST match `/^[A-Za-z_][A-Za-z0-9_]*$/` (valid env variable identifier)
- `name` MUST be unique within the deck's env declarations
- `validate` MUST be one of the recognized rule types or a `regex:<pattern>` where `<pattern>` compiles as valid RegExp
- If both `required: true` and `default` are set, `required` takes precedence (default is ignored when the file value is missing and required is true — the variable is still flagged as missing)

**State Transitions**: None — EnvDeclaration is immutable after parsing. Parsed once at deck load time.

---

### EnvFile

Represents a parsed `.deck.env` sidecar file containing `KEY=VALUE` pairs.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `filePath` | `string` | ✓ | Absolute path to the `.deck.env` file |
| `values` | `Map<string, string>` | ✓ | Parsed key-value pairs |
| `errors` | `EnvFileError[]` | ✓ | Parse errors (malformed lines) with line numbers |
| `exists` | `boolean` | ✓ | Whether the file was found on disk |

**EnvFileError Structure**:

| Attribute | Type | Description |
|-----------|------|-------------|
| `line` | `number` | 1-based line number in `.deck.env` file |
| `message` | `string` | Human-readable error description |
| `rawText` | `string` | The original malformed line text |

**Validation Rules**:
- Lines starting with `#` are comments (skipped)
- Blank lines are skipped
- Lines without `=` are malformed → produce `EnvFileError`
- Keys must match `/^[A-Za-z_][A-Za-z0-9_]*$/`
- Values may be quoted (single or double) — quotes are stripped
- First `=` splits key from value (values may contain `=`)

**Lifecycle**: Parsed on deck load and re-parsed on `.deck.env` file change (FileSystemWatcher).

---

### ResolvedEnv

The runtime collection of resolved environment variables, merging declarations + file values + defaults.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `variables` | `Map<string, ResolvedVar>` | ✓ | All declared variables with resolution status |
| `isComplete` | `boolean` | ✓ | `true` if all required variables are satisfied |
| `secrets` | `string[]` | ✓ | List of variable names marked `secret: true` (for scrubbing) |
| `secretValues` | `string[]` | ✓ | Sorted (longest first) resolved values of secret variables (for scrubbing) |

**Validation Rules**:
- `isComplete` is `false` if any variable with `required: true` has `status !== 'resolved'`
- `secretValues` are sorted by descending length to prevent partial replacement artifacts

---

### ResolvedVar

A single resolved environment variable with its display and execution values.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | `string` | ✓ | Variable name (matches `EnvDeclaration.name`) |
| `declaration` | `EnvDeclaration` | ✓ | Back-reference to the declaration |
| `status` | `ResolvedVarStatus` | ✓ | Resolution status |
| `resolvedValue` | `string` | | The actual value (from `.deck.env` or default). Absent if unresolved. |
| `displayValue` | `string` | ✓ | What to show in UI: the real value, `•••••` (for secrets), or `<missing>` |
| `source` | `'env-file' \| 'default' \| 'unresolved'` | ✓ | Where the value came from |
| `validationResult` | `EnvValidationResult` | | Result of running the validate rule (if any) |

**ResolvedVarStatus Enum**:

| Value | Meaning |
|-------|---------|
| `'resolved'` | Value present and valid (from `.deck.env` or `default`; check `source` field to distinguish) |
| `'resolved-invalid'` | Value present but fails validation rule |
| `'missing-optional'` | Optional variable not provided, resolved to empty string |
| `'missing-required'` | Required variable not provided — error state |

**EnvValidationResult Structure**:

| Attribute | Type | Description |
|-----------|------|-------------|
| `rule` | `string` | The validation rule that was applied |
| `passed` | `boolean` | Whether validation passed |
| `message` | `string` | Human-readable validation result |

---

### EnvStatus

Status summary sent to the webview for display (respects FR-010 — no secret values cross the boundary).

| Attribute | Type | Description |
|-----------|------|-------------|
| `total` | `number` | Total declared variables |
| `resolved` | `number` | Variables with `status === 'resolved'` |
| `missing` | `string[]` | Names of required variables that are missing |
| `invalid` | `string[]` | Names of variables that failed validation |
| `hasSecrets` | `boolean` | Whether any variable is marked `secret: true` |
| `isComplete` | `boolean` | All required variables satisfied and valid |
| `variables` | `EnvStatusEntry[]` | Per-variable summary (values masked for secrets) |

**EnvStatusEntry Structure**:

| Attribute | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Variable name |
| `status` | `ResolvedVarStatus` | Resolution status |
| `displayValue` | `string` | Displayed value (real for non-secret, `•••••` for secret) |

---

## Modified Entities

### Deck (extended)

| Attribute | Type | Change | Description |
|-----------|------|--------|-------------|
| `envDeclarations` | `EnvDeclaration[]` | **NEW** | Environment variable declarations parsed from frontmatter `env:` block |

No other Deck attributes change. The `metadata` field (existing `Record<string, unknown>`) still carries raw frontmatter; `envDeclarations` is parsed and validated separately.

### Action (no change to interface)

Action params (`Record<string, unknown>`) are not modified at the model level. The `{{VAR}}` interpolation produces **two copies** of the params at the conductor level:
- **Display params**: Used for webview rendering (secrets show as `{{VAR}}`)
- **Execution params**: Used for executor dispatch (secrets carry real values)

The Action model itself remains unchanged — the dual-path is managed by the conductor/resolver, not the model.

### ValidationContext (extended)

| Attribute | Type | Change | Description |
|-----------|------|--------|-------------|
| `envDeclarations` | `EnvDeclaration[]` | **NEW optional** | Env declarations from deck frontmatter |
| `resolvedEnv` | `ResolvedEnv` | **NEW optional** | Resolved env state for validation |
| `deckFilePath` | `string` | **existing** | Path to the `.deck.md` file (used to locate `.deck.env`) |

### DeckLoadedMessage (extended)

| Attribute | Type | Change | Description |
|-----------|------|--------|-------------|
| `envStatus` | `EnvStatus` | **NEW optional** | Environment readiness summary for the webview |

### Messages (new types)

| Message | Direction | Description |
|---------|-----------|-------------|
| `EnvStatusChangedMessage` | Host → Webview | Sent when `.deck.env` is re-validated after a file change |
| `EnvSetupRequestMessage` | Webview → Host | Sent when user clicks "Set Up Now" in webview env badge |

---

## Entity Schema: EnvDeclarationSchema (metadata for authoring)

Static metadata used by authoring providers (completion, hover). Not persisted — built at activation time.

| Property | Type | Required | Description (for hover) |
|----------|------|----------|------------------------|
| `name` | `string` | ✓ | Unique variable name, referenced as `{{name}}` in action parameters |
| `description` | `string` | | Human-readable description shown during guided setup |
| `required` | `boolean` | | Whether the variable must be present in `.deck.env` (default: false) |
| `secret` | `boolean` | | Values masked in webview, scrubbed from output (default: false) |
| `validate` | `string` | | Validation rule: `directory`, `file`, `command`, `url`, `port`, `regex:<pattern>` |
| `default` | `string` | | Fallback value when `.deck.env` doesn't provide one |
