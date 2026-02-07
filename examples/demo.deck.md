---
title: Demo Presentation
author: Test User
---

# Welcome to Executable Talk! 🎉

Press **→** or **Space** to navigate forward.

---
notes: This slide demonstrates file opening. Click the link below.
---

# Opening Files

Click the action link to open a file:

[Open package.json](action:file.open?path=package.json)

[Open README](action:file.open?path=README.md)

---

# Code Highlighting

Highlight specific lines in a file:

[Highlight lines 1-10](action:editor.highlight?path=package.json&lines=1-10)

[Highlight line 20](action:editor.highlight?path=package.json&lines=20)

---
notes: Terminal commands require Workspace Trust!
---

# Terminal Commands

Run a command in the terminal:

[Show npm version](action:terminal.run?command=npm%20--version)

[List files](action:terminal.run?command=ls%20-la)

---

# Sequences

Execute multiple actions in order:

[Open and Highlight](action:sequence?actions=file.open%3Fpath%3Dpackage.json,editor.highlight%3Fpath%3Dpackage.json%26lines%3D1-5)

---

# Dynamic Content Rendering

Embed file content directly in slides:

[](render:file?path=package.json&lines=1-10)

---

# Command Output Rendering

Execute a command and embed its output:

[](render:command?cmd=npm%20--version)

[](render:command?cmd=ls%20-la%20src/)

---

# Diff Rendering

View git diffs directly in your slides:

[](render:diff?path=src/renderer/contentRenderer.ts&before=HEAD~3)

---

# VS Code Commands

Execute any VS Code command:

[Open Settings](action:vscode.command?id=workbench.action.openSettings)

[Toggle Sidebar](action:vscode.command?id=workbench.action.toggleSidebarVisibility)

[Search Extensions](action:vscode.command?id=workbench.extensions.search&args=%22markdown%22)

---
notes: |
  NEW in v0.2.0 — YAML action blocks!
  Instead of URL-encoded inline links, you can write human-readable YAML.
  Both syntaxes work side by side.
---

# 🆕 YAML Action Blocks

Write actions as readable YAML — no more URL encoding!

**Old way (still works):**

```
[Open File](action:file.open?path=package.json)
```

**New way — human-readable YAML:**

```action
type: file.open
path: package.json
label: Open package.json
```

---

# YAML Action Blocks — Highlighting

YAML blocks make complex actions much easier to read:

```action
type: editor.highlight
path: src/extension.ts
lines: 1-15
label: Show Extension Entry Point
```

---
notes: |
  This slide shows a sequence in YAML.
  Compare how much cleaner this is than the URL-encoded version!
---

# YAML Sequences

Sequences are dramatically cleaner in YAML:

```action
type: sequence
label: Full Demo Flow
steps:
  - type: file.open
    path: ../src/extension.ts
  - type: editor.highlight
    path: ../src/extension.ts
    lines: 8-20
  - type: terminal.run
    command: echo "Hello from the sequence!"
```

---

# YAML Terminal & VS Code Commands

```action
type: terminal.run
command: echo "YAML blocks are great!"
label: Run Echo Command
```

```action
type: vscode.command
id: workbench.action.toggleSidebarVisibility
label: Toggle Sidebar
```

---
notes: |
  NEW — Preflight Validation!
  Run Cmd+Shift+P → "Executable Talk: Validate Deck" to catch errors before presenting.
  This slide has intentional errors for you to find with the validator.
---

# 🔍 Preflight Validation

Run **Validate Deck** (`Cmd+Shift+P`) to catch errors before presenting!

The validator checks for: <!-- .fragment -->

- ✅ Missing files <!-- .fragment -->
- ✅ Out-of-range line numbers <!-- .fragment -->
- ✅ Missing debug configurations <!-- .fragment -->
- ✅ Unavailable terminal commands <!-- .fragment -->
- ✅ Trust issues in untrusted workspaces <!-- .fragment -->

---

# Validation — Intentional Errors

These action blocks have problems the validator will catch:

```action
type: file.open
path: this/file/does/not/exist.ts
label: Missing File (validator catches this!)
```

```action
type: editor.highlight
path: package.json
lines: 9999-10000
label: Out of Range (validator catches this!)
```

---
notes: |
  NEW — Error Toasts!
  When actions fail during a live presentation, you get non-blocking toast notifications.
  Try clicking the intentional-error actions on the previous slide to see them!
---

# 🔔 Error Notifications

When an action fails during presentation, you'll see a **toast notification**:

- 📄 **file.open** — shows which file couldn't be found <!-- .fragment -->
- 🔍 **editor.highlight** — shows which lines are out of range <!-- .fragment -->
- ▶ **terminal.run** — shows the failing command <!-- .fragment -->
- 🔗 **sequence** — shows step-by-step breakdown (✅ ❌ ⏭) <!-- .fragment -->

Toasts auto-dismiss after 8s. Hover to pause the timer. <!-- .fragment -->

---
notes: |
  NEW — Authoring Assistance!
  Try editing this deck file to see autocomplete, hover docs, and diagnostics in action.
  Type "type:" inside an action block to see suggestions.
---

# ✍️ Authoring Assistance

When editing `.deck.md` files, you get full IDE support:

- **Autocomplete** — type suggestions after `type:`, parameter suggestions per action type <!-- .fragment -->
- **Hover Docs** — hover on `file.open` or `path` for descriptions and param tables <!-- .fragment -->
- **Real-time Diagnostics** — red squiggles for unknown types, missing params, invalid YAML <!-- .fragment -->

*Try it! Open this file and edit an action block.* <!-- .fragment -->

---

# The End

Press **Escape** to exit.

Press **Cmd+Z** to undo IDE changes.
