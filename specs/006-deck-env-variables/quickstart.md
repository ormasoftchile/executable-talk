# Quickstart: Deck Environment Variables

**Feature**: 006-deck-env-variables
**Audience**: Deck authors and presenters

---

## What Are Deck Environment Variables?

Deck environment variables let you **parameterize your presentations** so the same `.deck.md` file works across different machines, users, and environments — without hardcoding paths, tokens, or configuration.

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│  .deck.md       │     │  .deck.env   │     │  Presentation    │
│  (declarations) │ ──▶ │  (values)    │ ──▶ │  (interpolated)  │
│  {{VAR}} refs   │     │  KEY=VALUE   │     │  real values     │
└─────────────────┘     └──────────────┘     └──────────────────┘
```

---

## 1. Declare Variables in Frontmatter

Add an `env:` block to your deck's YAML frontmatter:

```yaml
---
title: "Team Onboarding"
env:
  - name: REPO_PATH
    description: "Path to the cloned repository"
    required: true
    validate: directory

  - name: GH_TOKEN
    description: "GitHub personal access token"
    secret: true

  - name: BRANCH
    description: "Feature branch to work on"
    default: "main"
---
```

### Declaration Properties

| Property | Required | Default | Description |
|----------|----------|---------|-------------|
| `name` | ✓ | — | Variable name (letters, digits, underscores) |
| `description` | | `""` | Shown in hover tooltips and guided setup |
| `required` | | `false` | Error if not set in `.deck.env` |
| `secret` | | `false` | Value masked in the presentation UI |
| `validate` | | — | Validation rule: `directory`, `file`, `command`, `url`, `port`, `regex:<pattern>` |
| `default` | | — | Fallback when not set in `.deck.env` |

---

## 2. Create a `.deck.env` File

Create a file with the same base name, replacing `.deck.md` with `.deck.env`:

```
my-talk/
  ├── onboarding.deck.md          ← Your presentation
  ├── onboarding.deck.env         ← Your local values (gitignored!)
  └── onboarding.deck.env.example ← Template for others (committed)
```

Fill in your values:

```bash
# onboarding.deck.env
REPO_PATH=/home/alice/projects/my-repo
GH_TOKEN=ghp_abc123def456ghi789
BRANCH=feature/onboarding
```

> **⚠️ Important**: Add `*.deck.env` to your `.gitignore` to prevent committing secrets!

---

## 3. Use `{{VAR}}` in Actions

Reference your variables in action links using double-brace syntax:

```markdown
## Step 1: Open the Project

[Open package.json](action:file.open?path={{REPO_PATH}}/package.json)

## Step 2: Install Dependencies

[Run npm install](action:terminal.run?command=cd {{REPO_PATH}} && npm install)

## Step 3: Start Development

[Start dev server](action:terminal.run?command=cd {{REPO_PATH}} && PORT=3000 npm run dev)
```

When the action executes, `{{REPO_PATH}}` is replaced with the real value from `.deck.env`.

### What Gets Interpolated?

| Context | Interpolated? |
|---------|:------------:|
| Action parameters (`?param={{VAR}}`) | ✅ Yes |
| Markdown prose text | ❌ No |
| Slide titles | ❌ No |

---

## 4. Marking Secrets

Variables with `secret: true` are protected:

```yaml
env:
  - name: API_TOKEN
    description: "API authentication token"
    secret: true
    required: true
```

**What secret masking does:**

- ✅ Webview shows `•••••` instead of the real value
- ✅ Action parameter display keeps `{{API_TOKEN}}` placeholder
- ✅ Error messages are scrubbed of secret values
- ✅ Real value is used only at execution time (never sent to webview)

**Example**: If your action is `[Auth](action:terminal.run?command=curl -H "Authorization: Bearer {{API_TOKEN}}" https://api.example.com)`:

- **Displayed in presentation**: `curl -H "Authorization: Bearer {{API_TOKEN}}" https://api.example.com`
- **Actually executed**: `curl -H "Authorization: Bearer ghp_abc123..." https://api.example.com`

---

## 5. Validation Rules

Catch configuration problems before the presentation starts:

```yaml
env:
  - name: REPO_PATH
    validate: directory      # Must be an existing directory

  - name: CONFIG_FILE
    validate: file           # Must be an existing file

  - name: NODE_CMD
    validate: command        # Must be in PATH (e.g., node, git, docker)

  - name: API_URL
    validate: url            # Must be a valid HTTP/HTTPS URL

  - name: SERVER_PORT
    validate: port           # Must be 1-65535

  - name: VERSION
    validate: "regex:^\\d+\\.\\d+\\.\\d+$"  # Must match semver pattern
```

Validation runs during **preflight check** (before the presentation starts). Issues appear in the Problems panel.

---

## 6. Guided Setup

When opening a deck that has environment variables, the extension helps you get set up:

1. **Env status badge** appears in the presentation showing resolution status
2. If variables are missing, click **"Set Up Now"**
3. The extension creates a `.deck.env.example` template (if needed)
4. Opens `.deck.env` in the editor for you to fill in
5. As you save, the presentation updates automatically (live reload)

---

## 7. Sharing Decks with Others

To make your deck portable:

1. **Commit** the `.deck.env.example` template:
   ```bash
   git add onboarding.deck.env.example
   ```

2. **Gitignore** the actual values file:
   ```
   # .gitignore
   *.deck.env
   ```

3. **Document** in your deck's README what each variable needs

When someone clones your repo, they:
1. Copy `.deck.env.example` → `.deck.env`
2. Fill in their own values
3. Open the deck — ready to present!

---

## Complete Example

### `onboarding.deck.md`

```markdown
---
title: "Developer Onboarding"
env:
  - name: REPO_PATH
    description: "Path to the cloned repository"
    required: true
    validate: directory
  - name: GH_TOKEN
    description: "GitHub PAT with repo scope"
    secret: true
    required: true
  - name: BRANCH
    description: "Feature branch name"
    default: "feature/onboarding"
  - name: DEV_PORT
    description: "Local dev server port"
    default: "3000"
    validate: port
---

# Welcome! 🎉

Let's get your dev environment ready.

---

## Verify Your Setup

[Open Project](action:file.open?path={{REPO_PATH}})

[Check Node Version](action:terminal.run?command=node --version)

---

## Install & Build

[Install Dependencies](action:terminal.run?command=cd {{REPO_PATH}} && npm ci)

[Build Project](action:terminal.run?command=cd {{REPO_PATH}} && npm run build)

---

## Start Development

[Create Branch](action:terminal.run?command=cd {{REPO_PATH}} && git checkout -b {{BRANCH}})

[Start Server](action:terminal.run?command=cd {{REPO_PATH}} && PORT={{DEV_PORT}} npm run dev)

---

## You're Ready!

Your development environment is set up. Happy coding! 🚀
```

### `onboarding.deck.env.example`

```bash
# Environment variables for onboarding.deck.md
# Copy this file to onboarding.deck.env and fill in your values.

# Path to the cloned repository
# Required: yes | Secret: no | Validate: directory
REPO_PATH=

# GitHub PAT with repo scope
# Required: yes | Secret: yes | Validate: none
GH_TOKEN=

# Feature branch name
# Required: no | Secret: no | Validate: none
# Default: feature/onboarding
BRANCH=

# Local dev server port
# Required: no | Secret: no | Validate: port
# Default: 3000
DEV_PORT=
```

### `onboarding.deck.env` (your local file — gitignored)

```bash
REPO_PATH=/home/alice/projects/onboarding-app
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BRANCH=feature/alice-onboarding
DEV_PORT=4000
```
