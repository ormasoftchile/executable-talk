# Contract: Environment File Format

**Feature**: 006-deck-env-variables
**Date**: 2026-02-08
**Status**: Draft
**Covers**: FR-001, FR-002, FR-003, FR-011, FR-012

## Overview

This contract defines three file formats for the deck environment variables feature:

1. **Frontmatter `env:` block** — Declarations in `.deck.md` YAML frontmatter
2. **`.deck.env` file** — Sidecar file containing actual values
3. **`.deck.env.example` file** — Template with documented placeholders

---

## 1. Frontmatter `env:` Block

### Location

Inside the YAML frontmatter of a `.deck.md` file:

```yaml
---
title: "Onboarding: Repository Setup"
scenes:
  - name: setup
    label: "Initial Setup"
env:
  - name: REPO_PATH
    description: "Path to the target repository"
    required: true
    validate: directory
  - name: API_TOKEN
    description: "GitHub personal access token"
    secret: true
  - name: BRANCH_NAME
    description: "Branch to checkout"
    default: "main"
---
```

### Schema

```yaml
env:                          # Optional. Array of env declarations.
  - name: string              # REQUIRED. Valid identifier [A-Za-z_][A-Za-z0-9_]*
    description: string       # Optional. Human-readable description.
    required: boolean         # Optional. Default: false. Must be set in .deck.env.
    secret: boolean           # Optional. Default: false. Value masked in webview.
    validate: string          # Optional. Validation rule (see below).
    default: string           # Optional. Fallback value if not in .deck.env.
```

### Validation Rule Values

| Value | Meaning |
|-------|---------|
| `directory` | Value must be an existing directory path |
| `file` | Value must be an existing file path |
| `command` | Value must be a command found in PATH |
| `url` | Value must be a valid HTTP/HTTPS URL |
| `port` | Value must be an integer in range 1-65535 |
| `regex:<pattern>` | Value must match the regex `<pattern>` |

### Formal Constraints

- The `env` key MUST be a YAML sequence (array) if present
- Each array element MUST be a YAML mapping with at least a `name` key
- `name` values MUST be unique within the array
- `name` MUST match the regex `/^[A-Za-z_][A-Za-z0-9_]*$/`
- Unknown keys are silently ignored (forward compatibility)
- The `env` block is parsed by `EnvDeclarationParser` after gray-matter extracts frontmatter

### Ordering

The `env` block can appear anywhere within the frontmatter YAML. The order of declarations within `env` determines the display order in the guided setup UI and the env status badge.

---

## 2. `.deck.env` File

### Naming Convention

The `.deck.env` file MUST be co-located with the `.deck.md` file:

```
my-presentation/
  ├── onboarding.deck.md        ← Deck file
  ├── onboarding.deck.env       ← Environment values (GITIGNORED)
  └── onboarding.deck.env.example  ← Template (committed)
```

**Name derivation**: Replace `.deck.md` extension with `.deck.env`.

```
{basename}.deck.md → {basename}.deck.env
```

### Syntax

The `.deck.env` file uses a subset of the POSIX shell environment file format:

```bash
# This is a comment
# Blank lines are ignored

# Simple assignment
REPO_PATH=/home/user/projects/my-repo

# Quoted values (quotes are stripped)
API_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
GREETING='Hello World'

# Empty value
OPTIONAL_VAR=

# Values may contain equals signs
CONNECTION_STRING=Server=localhost;Port=5432;Database=mydb

# Multi-word unquoted values
DESCRIPTION=This is a description with spaces
```

### Grammar (EBNF)

```ebnf
file        = { line } ;
line        = comment | assignment | blank ;
comment     = "#" , { any_char } ;
assignment  = key , "=" , value ;
key         = letter_or_underscore , { letter_or_digit_or_underscore } ;
value       = quoted_value | raw_value ;
quoted_value = ( '"' , { any_char - '"' } , '"' )
             | ( "'" , { any_char - "'" } , "'" ) ;
raw_value   = { any_char } ;  (* trimmed of trailing whitespace *)
blank       = { whitespace } ;

letter_or_underscore = "A"-"Z" | "a"-"z" | "_" ;
letter_or_digit_or_underscore = letter_or_underscore | "0"-"9" ;
```

### Parse Rules

| Line Pattern | Behavior |
|-------------|----------|
| Empty or whitespace-only | Skip |
| Starts with `#` | Skip (comment) |
| Contains `=` with valid key before it | Parse as `KEY=VALUE` |
| No `=` found | Report as `EnvFileError` |
| Key is empty (line starts with `=`) | Report as `EnvFileError` |
| Key contains invalid characters | Report as `EnvFileError` |
| Duplicate key | Last value wins (later lines override earlier) |

### Features NOT Supported

To keep the parser simple and predictable (per Research R1):

- ❌ Variable interpolation (`$VAR` or `${VAR}` within values)
- ❌ Multi-line values
- ❌ Export prefix (`export KEY=VALUE`)
- ❌ Escape sequences within quoted values
- ❌ Inline comments (`KEY=VALUE # comment`)

### Encoding

- UTF-8 (no BOM)
- Line endings: LF or CRLF (both accepted)

### Security

The `.deck.env` file SHOULD be listed in `.gitignore` to prevent accidental commit of secrets. The preflight validator warns if it detects the file is not gitignored (FR-016).

---

## 3. `.deck.env.example` File

### Purpose

A committable template that documents the required environment variables without containing actual values. Generated by the guided setup flow (FR-012) or manually authored.

### Format

```bash
# Environment variables for onboarding.deck.md
# Copy this file to onboarding.deck.env and fill in your values.

# Path to the target repository
# Required: yes | Secret: no | Validate: directory
REPO_PATH=

# GitHub personal access token
# Required: no | Secret: yes | Validate: none
API_TOKEN=

# Branch to checkout
# Required: no | Secret: no | Validate: none
# Default: main
BRANCH_NAME=
```

### Generation Rules

For each `EnvDeclaration`, emit:

```
# {description}                           ← if description is non-empty
# Required: {yes|no} | Secret: {yes|no} | Validate: {rule|none}
# Default: {default}                      ← only if default is defined
{NAME}=
```

The file header includes:
```
# Environment variables for {deckFileName}
# Copy this file to {envFileName} and fill in your values.
```

### Convention

- `.deck.env.example` files SHOULD be committed to version control
- They serve as documentation for other presenters using the same deck
- The guided setup flow creates this file if it doesn't exist

---

## Placeholder Syntax in Action Parameters

### `{{VAR}}` References

Environment variables are referenced in action parameters using double-brace syntax:

```markdown
[Open Repository](action:file.open?path={{REPO_PATH}}/src/main.ts)

[Run Tests](action:terminal.run?command=cd {{REPO_PATH}} && npm test)

[Start Debug](action:debug.start?config={{DEBUG_CONFIG}})
```

### Interpolation Scope

Per spec clarification, `{{VAR}}` interpolation applies ONLY to action parameters, NOT to prose Markdown content. This means:

```markdown
# Setting up {{REPO_PATH}}      ← NOT interpolated (prose)

[Open](action:file.open?path={{REPO_PATH}})  ← Interpolated (action param)
```

### Syntax Rules

| Pattern | Behavior |
|---------|----------|
| `{{VALID_NAME}}` | Replaced with resolved value |
| `{{unknown}}` | Left as-is (no error) |
| `{{ SPACED }}` | NOT recognized (no spaces inside braces) |
| `{single}` | NOT recognized (requires double braces) |
| `{{nested{{VAR}}}}` | Outer match only: `{{nested{{VAR` is not valid identifier |
| `{{123_INVALID}}` | NOT recognized (must start with letter or underscore) |

Regex: `/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g`

---

## Example: Complete Deck with Environment Variables

```markdown
---
title: "Onboarding: Repository Setup"
env:
  - name: REPO_PATH
    description: "Path to the cloned repository"
    required: true
    validate: directory
  - name: GH_TOKEN
    description: "GitHub personal access token (classic)"
    secret: true
    required: true
  - name: BRANCH
    description: "Feature branch name"
    default: "feature/onboarding"
  - name: PORT
    description: "Local dev server port"
    default: "3000"
    validate: port
---

# Welcome to the Team! 🎉

Let's set up your development environment.

---

## Step 1: Verify Repository

[Open Project](action:file.open?path={{REPO_PATH}}/package.json)

[Check Structure](action:terminal.run?command=ls -la {{REPO_PATH}}/src)

---

## Step 2: Install Dependencies

[Install](action:terminal.run?command=cd {{REPO_PATH}} && npm install)

---

## Step 3: Create Feature Branch

[Checkout Branch](action:terminal.run?command=cd {{REPO_PATH}} && git checkout -b {{BRANCH}})

---

## Step 4: Start Dev Server

[Start Server](action:terminal.run?command=cd {{REPO_PATH}} && PORT={{PORT}} npm run dev)

---

## Step 5: Authenticate

[Verify Auth](action:terminal.run?command=gh auth status)

> Note: Your GitHub token is securely loaded from .deck.env
```
