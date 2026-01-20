---
title: Demo Presentation
author: Test User
---

[Open Settings](action:vscode.command?id=workbench.action.openSettings)

[Search Extensions](action:vscode.command?id=workbench.extensions.search&args=%22markdown%22)

[Toggle Sidebar](action:vscode.command?id=workbench.action.toggleSidebarVisibility)
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

[](render:file?path=package.json&lines=2-4)


---

# Command Output Rendering

Execute a command and embed its output:

[](render:command?cmd=npm%20--version)

[](render:command?cmd=ls%20-la%20src/)

---

# Diff Rendering

View git diffs directly in your slides:

[](render:diff?path=../src/renderer/contentRenderer.ts&before=HEAD~3)

---

# The End

Press **Escape** to exit.

Press **Cmd+Z** to undo IDE changes.
