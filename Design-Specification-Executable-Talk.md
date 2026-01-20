# Design Specification: Executable Talk

## 1. Vision
**Executable Talk** is a VS Code extension that transforms technical presentations from static slides into **executable narratives**. Instead of switching between slides and the IDE, the presentation *is* the controller for the IDE. Slides running in a Webview orchestrate the editor, terminal, and debugger to create an immersive, live-coding experience.

---

## 2. System Architecture
The extension follows a **Three-Layer Architecture**:

1.  **Presentation Webview (The UI):** Renders Markdown/HTML slides. It captures user interactions and sends commands via `postMessage`.
2.  **The Conductor (The Bridge):** A middle layer in the Extension Host that parses incoming messages, validates permissions, manages the **State Stack** (for undo/redo), and sequences multi-step actions.
3.  **VS Code API Layer (The Executor):** Interfaces directly with the editor (`vscode.window`), terminal (`vscode.window.createTerminal`), and workspace to perform the actual manipulations.

---

## 3. Authoring Syntax (Hybrid Approach)
To balance power and simplicity, the extension supports two ways to define actions within a `.deck.md` file:

### A. YAML Frontmatter (Slide Setup)
Used for complex orchestrations that happen automatically when a slide loads (`onEnter`) or for defining reusable named actions.

```yaml
---
title: "Exploring the Middleware"
onEnter:
  - action: file.open
    params: { path: "src/auth.ts", range: "10-20" }
  - action: terminal.run
    params: { command: "npm run dev", background: true }
---
```

### B. Inline Executable Links (Interactive Elements)
For buttons or text links that trigger actions on click.

```markdown
## Live Demo
Click here to **[Run Integration Tests](vscode:action:terminal.run "npm test")**.
Or view the **[Logic Highlights](vscode:action:editor.highlight "45-60")**.
```

---

## 4. Core Action Registry
| Action | Description | Example |
| :--- | :--- | :--- |
| `file.open` | Opens a file at a specific line/range. | `{ path: "api.js", range: "15-20" }` |
| `editor.highlight` | Applies a temporary decoration to lines. | `{ lines: "10, 15-22", color: "#ff000033" }` |
| `terminal.run` | Executes a command in a named terminal. | `{ command: "docker-compose up", name: "Server" }` |
| `debug.start` | Launches a specific debug configuration. | `{ configName: "Launch App" }` |
| `sequence` | Runs a list of actions with delays. | `{ steps: [...], delay: 500 }` |

---

## 5. State Management & Reproducibility
To ensure the presenter never gets "lost," the extension maintains a **Snapshot Stack**:
- **Auto-Snapshot:** Before any action is executed, the current IDE state (open files, active line, terminal status) is saved.
- **Smart Undo:** Pressing `Cmd+Z` inside the presentation doesn't undo text; it reverts the IDE to the previous slide's state (closing files opened by that slide).
- **Reset Command:** A global command to close all presentation-opened terminals and editors to return to a clean slate.

---

## 6. User Experience (UX)
- **Zen Mode Integration:** When the presentation starts, VS Code automatically enters Zen Mode and hides the Side Bar/Activity Bar.
- **Presenter View:** If a second monitor is detected, the Webview can be moved to the projector while the primary screen shows **Speaker Notes** and a live preview of the next slide's actions.
- **Visual Feedback:** Buttons in the Webview show a loading spinner while a terminal command is running and a green checkmark upon successful completion.

----

Competitive Analysis: Executable Talk Extension
Executable Talk operates in a 'Blue Ocean' between traditional presentation tools and development environments. While many tools touch on code presentation, none currently bridge the gap between narrative storytelling and native IDE orchestration.

1. The Competitive Landscape: Strategic Mapping
We can categorize the competition into four distinct tiers based on their proximity to the 'Executable Talk' vision:

Tier 1: Presentation-First (The 'Sandbox Illusion')
Competitors: Slidev, Marp, Reveal.js.
The Gap: These tools are excellent for rendering slides but treat code as static text or sandboxed simulations. Slidev's 'interactive' elements are often iframe-based Monaco editors disconnected from your actual local environment. They cannot open a real file in your VS Code sidebar or run a command in your native Zsh shell.
Tier 2: IDE-First (The 'Guided Tour')
Competitors: VS Code CodeTour, GitHub Codespaces Walkthroughs.
The Gap: CodeTour is designed for asynchronous documentation. It lacks a presentation UI (speaker notes, slide transitions, full-screen mode). It is a 'museum audio guide,' whereas Executable Talk is a 'live cooking show.'
Tier 3: Interactive Notebooks (The 'Data Story')
Competitors: Jupyter Notebooks, Observable, Quarto.
The Gap: These are documents, not performance tools. They excel at inline output but don't manipulate the IDE workspace (layout, file navigation, terminal focus) and aren't optimized for the 'talk circuit' (conferences/workshops).
Tier 4: Cloud Sandboxes (The 'Destination')
Competitors: StackBlitz, CodeSandbox, Replit.
The Gap: These are isolated destinations. They don't allow you to present your local project with your specific setup and tools. They lack the narrative 'deck' structure required for a keynote talk.
2. Feature Comparison Matrix
Feature	Executable Talk	Slidev	CodeTour	Jupyter
Narrative Format	Slide-based	Slide-based	Code Comments	Notebook Cells
IDE Control	Native (Full)	Sandboxed	Native (Partial)	Kernel-only
State Snapshots/Undo	✅ Yes	❌ No	❌ No	⚠️ Cell-level
Terminal Integration	✅ Native	❌ No	❌ No	⚠️ Limited
Presentation UI	✅ Yes	✅ Yes	❌ No	⚠️ Basic
3. Our Unique Selling Propositions (USPs)
Escape the Sandbox: We are the only tool that allows a slide to natively control the presenter’s entire local environment—opening files, running terminals, and interacting with local servers.
Stateful Demo Management: Our core differentiator is the State Stack. Each slide can snapshot the IDE state. If a live demo goes wrong, the presenter can 'Undo' back to the slide's starting state—killing the 'Demo Effect.'
The 'Executable Narrative': We move from slides that describe code to presentations that are code execution. This is 'Technical Storytelling 2.0.'
4. Strategic Positioning
Executable Talk is not a better slide deck; it is a performance cockpit. While Slidev creates documents and CodeTour creates guides, Executable Talk creates performances. It is the first tool to blend the polish of a keynote with the raw power of a live IDE.