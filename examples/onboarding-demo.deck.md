---
title: "Onboarding Mode Demo"
author: Executable Talk
description: A showcase of Onboarding Mode features — checkpoints, validation actions, progressive disclosure, step tracking, and recovery.
scenes:
  - name: start
    slide: 1
  - name: validation
    slide: 4
options:
  mode: onboarding
  toolbar: true
  zenMode: false
  showSlideNumbers: true
  showProgress: true
  fontSize: medium
  theme: default
---

# Welcome to Onboarding Mode

This deck demonstrates **Onboarding Mode** — a step-by-step guided experience with validation, checkpoints, and recovery.

Notice the **step progress dots** at the bottom and the **"Step X of Y"** indicator instead of slide numbers.

Press **→** to proceed through each step.

---

# Step 1: Check Your Tools
<!-- checkpoint: tools-verified -->

Let's verify that your development tools are installed.

```action
type: validate.command
command:
  windows: node --version
  macos: node --version
  linux: node --version
label: Validate Node.js is installed
```

```action
type: validate.command
command: git --version
label: Validate Git is installed
```

If a validation fails, you'll see a **❌ message** and the **Retry Step** button appears.

---

# Step 2: Check Project Files
<!-- checkpoint: files-verified -->

Verify that the project files exist in this workspace:

```action
type: validate.fileExists
path: package.json
label: Validate package.json exists
```

```action
type: validate.fileExists
path: tsconfig.json
label: Validate tsconfig.json exists
```

```action
type: validate.fileExists
path: src/extension.ts
label: Validate extension entry point exists
```

These validations **don't require Workspace Trust** — they're read-only file checks.

---

# Step 3: Explore the Code

Open the main extension entry point to get oriented:

```action
type: file.open
path: src/extension.ts
label: Open extension.ts
```

```action
type: editor.highlight
path: src/extension.ts
lines: 1-20
label: Highlight the imports
```

:::advanced

### Deep Dive: Extension Activation

The extension activates on:
- The `executable-talk.openPresentation` command
- Any `.deck.md` file in the workspace
- Markdown language features for `deck-markdown`

Check `package.json` → `activationEvents` for the full list.

:::

---

# Step 4: Build the Project
<!-- checkpoint: build-complete -->

Run the TypeScript compiler to build the extension:

```action
type: terminal.run
command: npm run compile
label: Build the project
```

Then validate the build output exists:

```action
type: validate.fileExists
path: out/src/extension.js
label: Validate build output exists
```

:::optional

If the build fails, check that all dependencies are installed:

```action
type: terminal.run
command: npm install
label: Install dependencies
```

:::

---

# Step 5: Run the Tests
<!-- checkpoint: tests-passed -->

Run the unit test suite to verify everything works:

```action
type: terminal.run
command: npm run test:unit
label: Run unit tests
```

:::advanced

### Test Architecture

The test suite uses:
- **Mocha** as the test runner
- **Chai** for assertions
- **ts-node** for TypeScript compilation
- Tests are in `test/unit/` and `test/integration/`

:::

---

# Step 6: Check a Service Port

:::optional

If you have a local dev server running, validate it's accessible:

```action
type: validate.port
port: 3000
host: localhost
label: Check if port 3000 is open
```

This is a **non-blocking optional step** — it won't affect your onboarding progress.

:::

---

# Features Demonstrated

:::columns

:::left

### Onboarding Features
- ✅ `mode: onboarding` activation
- ✅ Step progress dots
- ✅ Step status tracking
- ✅ Retry / Reset buttons
- ✅ Inline validation results
- ✅ Auto-saved checkpoints

:::

:::right

### New Action Types
- 🔍 `validate.command` — exit code + output
- 📂 `validate.fileExists` — file checks
- 🔌 `validate.port` — TCP port probe
- ⏪ Reset to Checkpoint
- 🔄 Retry Step

:::

---

# Progressive Disclosure

Onboarding decks support **progressive disclosure** for different audiences:

:::advanced

### For Advanced Users

This collapsible section uses `:::advanced` — it renders as a `<details>` element that starts collapsed. Perfect for deep-dive content that beginners can skip.

:::

:::optional

### Optional Content

This section uses `:::optional` — it's visually marked with a badge and doesn't block step completion. Use it for nice-to-have steps.

:::

Both directives degrade gracefully in plain Markdown viewers.

---

# You're All Set! 🎉

:::center

**Onboarding complete!**

You've seen every onboarding feature in action:

- Step tracking with visual progress
- Checkpoints for safe recovery
- Validation actions for outcome verification
- Progressive disclosure for mixed audiences
- Retry and reset for error recovery

All features are **opt-in via frontmatter** — existing presentation decks are unaffected.

:::
