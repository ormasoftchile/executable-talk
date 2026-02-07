---
title: Cross-Platform Commands & Navigation Demo
author: Executable Talk
description: Demonstrates cross-platform command maps, scene anchors, and non-linear navigation features.
scenes:
  - name: intro
    slide: 1
  - name: cross-platform-demo
    slide: 3
  - name: wrap-up
    slide: 6
---

# Cross-Platform Commands & Navigation

Welcome to the **Executable Talk** cross-platform demo!

This deck showcases three new capabilities:
- 🧭 Non-linear navigation (jump to any slide)
- 📌 Scene checkpoints (save & restore IDE state)
- 🖥️ Cross-platform commands (one deck, every OS)

> Press **Ctrl+G** / **Cmd+G** to open the slide picker at any time.

---

## Non-Linear Navigation

### Jump to Any Slide

- Press **Ctrl+G** / **Cmd+G** to open the slide picker
- Type a slide number and press **Enter** to jump directly
- Press **Alt+Left** to go back to the previous slide
- Watch the breadcrumb trail at the bottom for your navigation history

### Try It Now

Type **4** then **Enter** to jump to slide 4, then **Alt+Left** to come back here!

---

## Cross-Platform: File Browser

This action opens the system file browser — the correct command runs on every OS:

```action
type: terminal.run
command:
  macos: open .
  windows: explorer .
  linux: xdg-open .
label: Open File Browser
```

---

## Cross-Platform: List Files

Different systems use different commands to list directory contents:

```action
type: terminal.run
command:
  macos: ls -la
  windows: dir
  linux: ls -la
  default: ls
label: List Directory
```

---

## Cross-Platform: Path Placeholders

Path placeholders resolve automatically on every OS:

```action
type: terminal.run
command: echo "Path separator is ${pathSep} and home is ${home}"
label: Show Path Info
```

| Placeholder | macOS/Linux | Windows |
|-------------|-------------|---------|
| `${pathSep}` | `/` | `\` |
| `${home}` | `/Users/you` | `C:\Users\you` |
| `${shell}` | `/bin/zsh` | `cmd.exe` |
| `${pathDelimiter}` | `:` | `;` |

---

## Scene Checkpoints

### Save & Restore IDE State

- Press **Ctrl+S** / **Cmd+S** to save a named scene
- Press **Ctrl+R** / **Cmd+R** to restore a saved scene
- Pre-authored scenes from frontmatter are available immediately:
  - **intro** → Slide 1
  - **cross-platform-demo** → Slide 3
  - **wrap-up** → This slide!

### Try It Now

1. Open some files in the editor
2. Press **Ctrl+S** and name it "my-checkpoint"
3. Navigate around and open different files
4. Press **Ctrl+R** and select "my-checkpoint" to restore everything!

---

## Cross-Platform: Package Manager

Different package managers on different platforms:

```action
type: terminal.run
command:
  macos: brew --version
  windows: winget --version
  linux: apt --version
  default: echo "No package manager check configured"
label: Check Package Manager
```

---

## Navigation History Trail

The breadcrumb trail at the bottom of the screen shows your recent navigation path.

- Each breadcrumb shows the slide number and how you got there:
  - **→** Sequential navigation (arrow keys)
  - **⤳** Jump (slide picker or number input)
  - **←** Go back
  - **📌** Scene restore
- Click any breadcrumb to jump back to that slide
- Up to 10 recent entries are shown; hover to see the full trail

---

## Preflight Validation

Run **Executable Talk: Validate Deck** before presenting to check:

- ✅ All file paths exist
- ✅ Debug configurations are valid
- ✅ Cross-platform commands cover your current OS
- ✅ No trust issues in untrusted workspaces

---

## Thank You!

This deck demonstrates all the features from **005-nonlinear-nav-scenes**:

| Feature | Shortcut |
|---------|----------|
| Slide Picker | Ctrl+G / Cmd+G |
| Save Scene | Ctrl+S / Cmd+S |
| Restore Scene | Ctrl+R / Cmd+R |
| Go Back | Alt+Left |
| Jump by Number | Type digits + Enter |

> All shortcuts are scoped to the presentation Webview — they don't interfere with normal VS Code shortcuts.
