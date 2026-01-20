---
title: Demo Presentation
author: Test User
options:
  toolbar:
    - sidebar
    - panel
    - terminal
    - zenMode
  zenMode: true
---

# Welcome to Executable Talk! 🎉

Press **→** or **Space** to navigate forward.

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

# Terminal Commands

Run a command in the terminal:

[Show npm version](action:terminal.run?command=npm%20--version)

[List files](action:terminal.run?command=ls%20-la)

---

# VS Code Commands

Execute any VS Code command directly:

[Open Settings (filtered to "font")](action:vscode.command?id=workbench.action.openSettings&args=%22font%22)

[Search Markdown Extensions](action:vscode.command?id=workbench.extensions.search&args=%22markdown%22)

[Toggle Sidebar](action:vscode.command?id=workbench.action.toggleSidebarVisibility)

---

# Sequences

Execute multiple actions in order:

[Open and Highlight](action:sequence?actions=file.open%3Fpath%3Dpackage.json,editor.highlight%3Fpath%3Dpackage.json%26lines%3D1-5)


---

# Dynamic Content Rendering

Embed file content directly in slides:

[](render:file?path=package.json&lines=2-4)


---

# Command Output Rendering

Execute a command and embed its output:

[](render:command?cmd=npm%20--version)

[](render:command?cmd=ls%20-la%20src/)

---

# Diff Rendering

View git diffs directly in your slides:

[](render:diff?path=examples/demo.deck.md&before=HEAD~5)

---

# Presentation Options

Customize via frontmatter `options`:

```yaml
options:
  toolbar: true | false | [buttons]
  zenMode: true | false
  showSlideNumbers: true | false
  showProgress: true | false
  fontSize: small | medium | large
  theme: dark | light
```

**Toolbar buttons:** `sidebar`, `panel`, `terminal`, `activityBar`, `zenMode`

---

# The End

Press **Escape** to exit.

Press **Cmd+Z** to undo IDE changes.
