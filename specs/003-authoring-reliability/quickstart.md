# Quickstart: Authoring & Reliability Features

**Feature**: 003-authoring-reliability  
**Date**: 2026-02-07

This guide shows how to use each new capability introduced by the Authoring & Reliability feature.

---

## 1. Writing Action Blocks (Fenced YAML Syntax)

Instead of URL-encoded inline links, write actions as readable YAML inside fenced code blocks:

### Before (inline link — still supported)

```markdown
[Open File](action:file.open?path=src/main.ts&line=10)
```

### After (fenced action block)

````markdown
```action
label: Open File
type: file.open
path: src/main.ts
line: 10
```
````

### Sequence Example

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

### Available Action Types

| Type | Required Params | Description |
|------|----------------|-------------|
| `file.open` | `path` | Opens a file in the editor |
| `editor.highlight` | `path`, `lines` | Highlights lines in an editor |
| `terminal.run` | `command` | Runs a terminal command |
| `debug.start` | `configName` | Starts a debug session |
| `sequence` | `steps` | Executes multiple actions in order |
| `vscode.command` | `id` | Runs a VS Code command |

---

## 2. Validating Your Deck Before Presenting

Run preflight validation to catch problems before going live:

1. Open your `.deck.md` file
2. Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
3. Run **Executable Talk: Validate Deck**

### What Gets Checked

- ✅ All file paths referenced by actions exist in the workspace
- ✅ Line ranges don't exceed file lengths
- ✅ Debug configurations exist in `launch.json`
- ✅ Commands referenced by `render:command` are available on PATH
- ✅ Workspace Trust status for trust-requiring actions

### Reading the Report

- **Errors** appear as red squiggles inline in your `.deck.md` file
- **Warnings** appear as yellow squiggles
- Open the **Problems panel** (`Cmd+Shift+M`) for the full list
- Check the **Output panel** → "Executable Talk Validation" for a detailed log

---

## 3. Understanding Error Notifications During Presentation

When an action fails during a live presentation, you'll see a non-blocking toast notification in the bottom-right corner:

### Simple Failure

```
📄 file.open failed
src/old-main.ts
File not found in workspace
```

### Sequence Failure

```
🔗 sequence failed — Step 3 of 5

✅ 1. file.open
✅ 2. editor.highlight
❌ 3. terminal.run — npm test: exit code 1
⏭ 4. editor.highlight
⏭ 5. file.open
```

### Behavior

- Simple failures auto-dismiss after 8 seconds
- Sequence failures stay until you dismiss them manually
- Hover over a toast to pause its auto-dismiss timer
- Click the ✕ button to dismiss immediately
- Up to 5 toasts can stack at once

### Recovery

When you see an error, you can:
- Press **Undo** to revert to the previous state
- Skip the action and continue presenting
- Manually perform the action (open the file, run the command)

---

## 4. Using Authoring Assistance

When editing `.deck.md` files, you get intelligent assistance inside `action` blocks:

### Autocomplete

- Type `type:` and press `Ctrl+Space` to see all action types
- After setting the type, press `Ctrl+Space` for type-specific parameters
- Type a file path value and get workspace file suggestions

### Hover Documentation

- Hover over an action type (e.g., `file.open`) to see its description and parameters
- Hover over a parameter name to see its type and description

### Real-Time Validation

- Invalid action types show red squiggles immediately
- Unknown parameters show yellow squiggles
- Missing required parameters are flagged
- File paths that don't exist are flagged with warnings

---

## Example: Complete Deck Using All Features

````markdown
---
title: My Technical Demo
author: Developer
---

# Welcome

This presentation demonstrates the new authoring features.

---

## Step 1: Open the Source

```action
label: Show Main File
type: file.open
path: src/main.ts
line: 1
```

---

## Step 2: Highlight Key Code

```action
label: Focus on Handler
type: editor.highlight
path: src/main.ts
lines: 15-25
style: prominent
```

---

## Step 3: Run Tests

```action
label: Execute Test Suite
type: terminal.run
command: npm test
timeout: 60000
```

---

## Step 4: Full Demo Sequence

```action
label: Run Everything
type: sequence
delay: 1000
steps:
  - type: file.open
    path: src/main.ts
  - type: editor.highlight
    path: src/main.ts
    lines: 15-25
  - type: terminal.run
    command: npm test
```
````

**Before presenting**: Run `Executable Talk: Validate Deck` to verify all paths and commands.
